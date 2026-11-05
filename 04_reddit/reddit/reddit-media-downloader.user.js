// ==UserScript==
// @name         Reddit Media Downloader - Shreddit (www.reddit.com)
// @namespace    https://github.com/opencode/reddit-media-downloader
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-media-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-media-downloader.user.js
// @description  Przyciski pobierania na postach: zdjęcia i.redd.it, galerie (ZIP/kolejno), v.redd.it video (scalanie video+audio do MP4 via ffmpeg.wasm, fallback 2 pliki). Obsługa SPA, kolejka sekwencyjna.
// @author       opencode
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      i.redd.it
// @connect      preview.redd.it
// @connect      v.redd.it
// @connect      redd.it
// @connect      external-preview.redd.it
// @connect      packaged-media.redd.it
// @connect      www.reddit.com
// @connect      old.reddit.com
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// ==/UserScript==

/* global JSZip */
(function () {
  'use strict';

  // --- Konfiguracja ---
  const CFG = {
    zipGalleries: GM_getValue('rmd_zipGalleries', true), // true = ZIP, false = kolejno
    muxInBrowser: GM_getValue('rmd_muxInBrowser', true), // true = ffmpeg.wasm mux
  };

  // --- Selektory Shreddit ---
  const SEL = {
    post: 'shreddit-post',
    gallery: 'gallery-carousel',
    player: 'shreddit-player, shreddit-player-2',
  };

  // --- Pomoc: bezpieczna nazwa pliku ---
  function sanitizeFilename(s) {
    // usuń znaki niedozwolone w Windows, skróć do 80 znaków
    let n = (s || 'reddit').replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    if (n.length > 80) n = n.slice(0, 80).trim();
    if (!n) n = 'reddit';
    return n;
  }
  function extFromUrl(url, fallback) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (m) return '.' + m[1].toLowerCase();
    } catch {}
    return fallback || '.jpg';
  }
  function extFromMime(mime) {
    if (!mime) return '.bin';
    if (mime.includes('jpeg')) return '.jpg';
    if (mime.includes('png')) return '.png';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('mp4')) return '.mp4';
    if (mime.includes('gif')) return '.gif';
    return '.bin';
  }

  // --- Pobieranie binarne przez GM_xmlhttpRequest (omija CORS) ---
  function gmFetchBlob(url, onProgress) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        headers: { 'Referer': 'https://www.reddit.com/' },
        onprogress: (ev) => { if (onProgress && ev.lengthComputable) onProgress(ev.loaded / ev.total); },
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            const ct = res.responseHeaders.match(/content-type:\s*([^\r\n]+)/i);
            const mime = ct ? ct[1].trim() : '';
            resolve({ buffer: res.response, mime });
          } else {
            reject(new Error('HTTP ' + res.status + ' dla ' + url));
          }
        },
        onerror: (e) => reject(new Error('GM_xhr error ' + (e.error || ''))),
        ontimeout: () => reject(new Error('timeout ' + url)),
      });
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  // próbuj GM_download, fallback na blob link
  function triggerDownload(urlOrBlob, filename) {
    // jeśli mamy URL i chcemy użyć GM_download (dla bezpośrednich linków)
    if (typeof urlOrBlob === 'string') {
      try {
        GM_download({ url: urlOrBlob, name: filename, onload: () => {}, onerror: () => {
          // fallback: fetch blob
          gmFetchBlob(urlOrBlob).then(({ buffer, mime }) => {
            const blob = new Blob([buffer], { type: mime || 'application/octet-stream' });
            downloadBlob(blob, filename);
          }).catch(err => notify('Błąd pobierania: ' + err.message));
        }});
        return;
      } catch (e) {
        // fallback niżej
      }
    }
    if (urlOrBlob instanceof Blob) downloadBlob(urlOrBlob, filename);
  }

  function notify(text) {
    try { GM_notification({ title: 'Reddit Downloader', text: String(text).slice(0, 200), timeout: 4000 }); } catch {}
    console.log('[RMD]', text);
  }

  // --- Parsowanie packaged-media-json (preferowane - ma gotowy mux) ---
  function extractPackagedUrls(playerEl) {
    const raw = playerEl.getAttribute('packaged-media-json');
    if (!raw) return [];
    try {
      const j = JSON.parse(raw);
      const urls = [];
      (function walk(v) {
        if (typeof v === 'string' && /^https:\/\/.*\.mp4(\?|$)/i.test(v)) urls.push(v);
        else if (v && typeof v === 'object') {
          for (const k in v) walk(v[k]);
        }
      })(j);
      // deduplikacja
      return [...new Set(urls)];
    } catch { return []; }
  }

  // --- JSON API fallback dla video ---
  function fetchPostJson(permalink) {
    const url = 'https://www.reddit.com' + permalink + '.json?raw_json=1';
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'text',
        headers: { 'Referer': 'https://www.reddit.com/' },
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try { resolve(JSON.parse(res.responseText)); } catch (e) { reject(e); }
          } else reject(new Error('JSON HTTP ' + res.status));
        },
        onerror: (e) => reject(new Error('JSON xhr error')),
      });
    });
  }

  // --- Parsowanie MPD dla audio URL ---
  async function resolveAudioUrl(dashUrl) {
    try {
      const { buffer } = await gmFetchBlob(dashUrl);
      const xmlText = new TextDecoder().decode(buffer);
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      let base = doc.querySelector('AdaptationSet[contentType="audio"] BaseURL')?.textContent?.trim();
      if (!base) base = doc.querySelector('Representation[id*="AUDIO"] BaseURL')?.textContent?.trim();
      if (!base) {
        // szukaj dowolnego audio
        const nodes = doc.querySelectorAll('AdaptationSet BaseURL');
        for (const n of nodes) {
          if (/AUDIO/i.test(n.textContent)) { base = n.textContent.trim(); break; }
        }
      }
      if (!base) return null;
      return new URL(base, dashUrl).href;
    } catch (e) {
      console.warn('[RMD] MPD parse fail', e);
      return null;
    }
  }

  // --- ffmpeg.wasm muxer (lazy load) ---
  let ffmpegInstance = null;
  let ffmpegLoading = null;

  async function ensureFFmpeg(progressCb) {
    if (ffmpegInstance) return ffmpegInstance;
    if (ffmpegLoading) return ffmpegLoading;
    ffmpegLoading = (async () => {
      // ładuj z CDN (UMD)
      const loadScript = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => rej(new Error('load fail ' + src));
        document.head.appendChild(s);
      });
      // core jest pobierany automatycznie przez ffmpeg.js, ale potrzebujemy go dostępnego
      if (!window.FFmpegWASM) {
        await loadScript('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js');
      }
      const { FFmpeg } = window.FFmpegWASM;
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));
      if (progressCb) ffmpeg.on('progress', progressCb);
      // core URL - użyj CDN
      await ffmpeg.load({
        coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',
        wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
    try {
      const inst = await ffmpegLoading;
      return inst;
    } catch (e) {
      ffmpegLoading = null;
      throw e;
    }
  }

  async function muxVideoAudio(videoBuf, audioBuf, outName, mimeVideo, mimeAudio, statusCb) {
    const ffmpeg = await ensureFFmpeg(statusCb);
    const vName = 'in_v' + extFromMime(mimeVideo) || '.mp4';
    const aName = 'in_a' + extFromMime(mimeAudio) || '.mp4';
    await ffmpeg.writeFile(vName, new Uint8Array(videoBuf));
    await ffmpeg.writeFile(aName, new Uint8Array(audioBuf));
    // mux bez przekodowania
    await ffmpeg.exec(['-i', vName, '-i', aName, '-c', 'copy', '-shortest', outName]);
    const data = await ffmpeg.readFile(outName);
    // sprzątanie
    try { await ffmpeg.deleteFile(vName); } catch {}
    try { await ffmpeg.deleteFile(aName); } catch {}
    try { await ffmpeg.deleteFile(outName); } catch {}
    return data; // Uint8Array
  }

  // --- Kolejka sekwencyjna pobierania ---
  const queue = [];
  let busy = false;
  async function processQueue() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const job = queue.shift();
      try { await job(); } catch (e) { notify('Błąd: ' + e.message); console.error(e); }
    }
    busy = false;
  }
  function enqueue(job) { queue.push(job); processQueue(); }

  // --- Logika pobierania per typ posta ---
  function getPostMeta(postEl) {
    return {
      id: postEl.getAttribute('id') || postEl.getAttribute('data-post-id') || '',
      title: postEl.getAttribute('post-title') || document.title,
      permalink: postEl.getAttribute('permalink') || '',
      postType: postEl.getAttribute('post-type') || '',
      domain: postEl.getAttribute('domain') || '',
      contentHref: postEl.getAttribute('content-href') || '',
    };
  }

  function collectGalleryUrls(postEl) {
    const urls = [];
    // wariant 1: gallery-carousel
    postEl.querySelectorAll('gallery-carousel ul > li img').forEach(img => {
      let src = img.getAttribute('src') || img.getAttribute('data-lazy-src') || img.currentSrc || '';
      // preview.redd.it -> i.redd.it dla pełnej rozdzielczości: zamień preview na i i usuń parametry width
      if (src.includes('preview.redd.it')) {
        // spróbuj wydobyć oryginał z media_metadata jeśli dostępny, inaczej użyj preview w max jakości
        src = src.replace('preview.redd.it', 'i.redd.it').split('?')[0];
      }
      if (src) urls.push(src);
    });
    // wariant 2: shreddit-gallery
    postEl.querySelectorAll('shreddit-gallery img').forEach(img => {
      const s = img.src || img.getAttribute('data-lazy-src') || '';
      if (s) urls.push(s);
    });
    return [...new Set(urls)];
  }

  function collectSingleImageUrl(postEl, meta) {
    // content-href dla image
    if (meta.contentHref && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(meta.contentHref)) return meta.contentHref;
    // szukaj img w post-media-container
    const img = postEl.querySelector('[slot="post-media-container"] img');
    if (img) {
      const s = img.src || img.getAttribute('data-lazy-src') || '';
      if (s && !s.includes('external-preview')) return s;
    }
    // faceplate-img
    const fp = postEl.querySelector('faceplate-img[src]');
    if (fp) return fp.getAttribute('src');
    return meta.contentHref || null;
  }

  // --- Akcje pobierania ---
  async function downloadImage(url, filenameBase) {
    const { buffer, mime } = await gmFetchBlob(url);
    const ext = extFromUrl(url, extFromMime(mime));
    const name = sanitizeFilename(filenameBase) + ext;
    const blob = new Blob([buffer], { type: mime || 'image/jpeg' });
    downloadBlob(blob, name);
    notify('Pobrano: ' + name);
  }

  async function downloadGallery(postEl, meta) {
    let urls = collectGalleryUrls(postEl);
    // jeśli mało URLi, spróbuj JSON API
    if (urls.length < 2 && meta.permalink) {
      try {
        const json = await fetchPostJson(meta.permalink);
        const data = json[0]?.data?.children?.[0]?.data;
        const mm = data?.media_metadata || {};
        const gallery = data?.gallery_data?.items || [];
        if (gallery.length) {
          urls = gallery.map(it => {
            const m = mm[it.media_id];
            let u = m?.s?.u || m?.s?.mp4 || '';
            if (u) u = u.replace(/&amp;/g, '&');
            return u;
          }).filter(Boolean);
        }
      } catch (e) { console.warn('[RMD] gallery JSON fail', e); }
    }
    if (!urls.length) throw new Error('Nie znaleziono obrazów galerii');

    const base = sanitizeFilename(meta.title) + '_' + (meta.id || 'gallery');
    if (CFG.zipGalleries && typeof JSZip !== 'undefined') {
      notify('Pobieranie galerii (' + urls.length + ') → ZIP...');
      const zip = new JSZip();
      let idx = 0;
      for (const url of urls) {
        idx++;
        const { buffer, mime } = await gmFetchBlob(url);
        const ext = extFromUrl(url, extFromMime(mime)) || '.jpg';
        zip.file(String(idx).padStart(2, '0') + ext, buffer);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, base + '.zip');
      notify('Galeria ZIP gotowa: ' + base + '.zip');
    } else {
      notify('Pobieranie galerii (' + urls.length + ') kolejno...');
      let idx = 0;
      for (const url of urls) {
        idx++;
        const { buffer, mime } = await gmFetchBlob(url);
        const ext = extFromUrl(url, extFromMime(mime)) || '.jpg';
        const blob = new Blob([buffer], { type: mime || 'image/jpeg' });
        downloadBlob(blob, base + '_' + String(idx).padStart(2, '0') + ext);
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  async function downloadVideo(postEl, meta, btn) {
    const player = postEl.querySelector(SEL.player);
    const setStatus = (t) => { if (btn) btn.textContent = t; };

    // 1. spróbuj packaged-media-json (gotowy mux)
    if (player) {
      const packaged = extractPackagedUrls(player);
      if (packaged.length) {
        const url = packaged[0]; // najlepsza jakość
        setStatus('Pobieranie video...');
        const { buffer, mime } = await gmFetchBlob(url, (p) => setStatus('Pobieranie ' + Math.round(p * 100) + '%'));
        const blob = new Blob([buffer], { type: mime || 'video/mp4' });
        const name = sanitizeFilename(meta.title) + '_' + (meta.id || 'video') + '.mp4';
        downloadBlob(blob, name);
        notify('Pobrano video (mux): ' + name);
        setStatus('Pobrano ✓');
        setTimeout(() => setStatus('⬇ Video'), 2500);
        return;
      }
    }

    // 2. fallback: JSON API -> dash_url / fallback_url
    if (!meta.permalink) throw new Error('Brak permalink dla video');
    setStatus('Analiza video...');
    const json = await fetchPostJson(meta.permalink);
    const data = json[0]?.data?.children?.[0]?.data;
    const rv = data?.secure_media?.reddit_video || data?.media?.reddit_video || data?.crosspost_parent_list?.[0]?.secure_media?.reddit_video;
    if (!rv) throw new Error('Nie znaleziono reddit_video w JSON');

    const dashUrl = (rv.dash_url || '').replace(/&amp;/g, '&');
    const hlsUrl = (rv.hls_url || '').replace(/&amp;/g, '&');
    const fallbackUrl = (rv.fallback_url || '').replace(/&amp;/g, '&'); // niemy

    // jeśli jest packaged ale nie w DOM, spróbuj wyłuskać z innego pola
    // fallback: pobierz niemy video + audio
    const videoUrl = fallbackUrl || dashUrl.replace('DASHPlaylist.mpd', 'DASH_720.mp4');
    if (!videoUrl) throw new Error('Brak URL video');

    setStatus('Pobieranie video...');
    const vRes = await gmFetchBlob(videoUrl, (p) => setStatus('Video ' + Math.round(p * 100) + '%'));
    let audioUrl = null;
    if (dashUrl) {
      setStatus('Szukanie audio...');
      audioUrl = await resolveAudioUrl(dashUrl);
      // heurystyka gdy MPD bez audio (czasem brak ścieżki)
      if (!audioUrl) {
        const base = dashUrl.replace(/DASHPlaylist\.mpd.*/, '');
        audioUrl = base + 'DASH_AUDIO_128.mp4';
      }
    }

    if (!audioUrl) {
      // brak audio - pobierz sam video
      const blob = new Blob([vRes.buffer], { type: vRes.mime || 'video/mp4' });
      downloadBlob(blob, sanitizeFilename(meta.title) + '_' + (meta.id || 'video') + '_video-only.mp4');
      notify('Pobrano video (bez audio - brak ścieżki)');
      setStatus('Pobrano (video only)');
      return;
    }

    setStatus('Pobieranie audio...');
    let aRes;
    try {
      aRes = await gmFetchBlob(audioUrl, (p) => setStatus('Audio ' + Math.round(p * 100) + '%'));
    } catch (e) {
      // fallback audio 64k
      const alt = audioUrl.replace('DASH_AUDIO_128', 'DASH_AUDIO_64').replace('DASH_audio', 'DASH_AUDIO_64');
      if (alt !== audioUrl) aRes = await gmFetchBlob(alt);
      else throw e;
    }

    if (!CFG.muxInBrowser) {
      // pobierz 2 pliki osobno
      const base = sanitizeFilename(meta.title) + '_' + (meta.id || 'video');
      downloadBlob(new Blob([vRes.buffer], { type: vRes.mime }), base + '_video.mp4');
      await new Promise(r => setTimeout(r, 500));
      downloadBlob(new Blob([aRes.buffer], { type: aRes.mime }), base + '_audio.mp4');
      notify('Pobrano video i audio osobno (mux wyłączony). Połącz np. ffmpeg -i video.mp4 -i audio.mp4 -c copy out.mp4');
      setStatus('Pobrano 2 pliki');
      return;
    }

    // mux w przeglądarce
    setStatus('Scalanie MP4...');
    try {
      const outName = 'out.mp4';
      const muxed = await muxVideoAudio(vRes.buffer, aRes.buffer, outName, vRes.mime, aRes.mime, (p) => {
        if (p && typeof p.progress === 'number') setStatus('Mux ' + Math.round(p.progress * 100) + '%');
      });
      const blob = new Blob([muxed], { type: 'video/mp4' });
      const name = sanitizeFilename(meta.title) + '_' + (meta.id || 'video') + '.mp4';
      downloadBlob(blob, name);
      notify('Pobrano video (scalono): ' + name);
      setStatus('Pobrano ✓');
    } catch (e) {
      console.error('[RMD] mux fail', e);
      // fallback 2 pliki
      const base = sanitizeFilename(meta.title) + '_' + (meta.id || 'video');
      downloadBlob(new Blob([vRes.buffer], { type: vRes.mime }), base + '_video.mp4');
      downloadBlob(new Blob([aRes.buffer], { type: aRes.mime }), base + '_audio.mp4');
      notify('Scalanie nieudane (SharedArrayBuffer?), pobrano 2 pliki. Błąd: ' + e.message);
      setStatus('Fallback 2 pliki');
    }
    setTimeout(() => setStatus('⬇ Video'), 3000);
  }

  // --- UI: przyciski na postach ---
  const BTN_STYLE = 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;border:1px solid #343536;background:#1a1a1b;color:#d7dadc;font:12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;cursor:pointer;user-select:none;';
  const BTN_HOVER = 'background:#272729;';

  function makeButton(label, title) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title || label;
    b.style.cssText = BTN_STYLE;
    b.addEventListener('mouseenter', () => b.style.background = '#272729');
    b.addEventListener('mouseleave', () => b.style.background = '#1a1a1b');
    b.type = 'button';
    return b;
  }

  function ensureBar(postEl) {
    let bar = postEl.querySelector('.rmd-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'rmd-bar';
    bar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px 0;';
    // wstaw po media container lub na końcu posta
    const media = postEl.querySelector('[slot="post-media-container"]');
    if (media && media.parentNode) {
      media.insertAdjacentElement('afterend', bar);
    } else {
      const title = postEl.querySelector('[slot="title"]') || postEl;
      title.insertAdjacentElement('afterend', bar);
    }
    return bar;
  }

  function addButtonsToPost(postEl) {
    if (postEl.dataset.rmdDone === '1') return;
    postEl.dataset.rmdDone = '1';
    const meta = getPostMeta(postEl);
    const type = (meta.postType || '').toLowerCase();
    const bar = ensureBar(postEl);

    // unikaj reklam
    if (postEl.closest('shreddit-ad-post')) return;

    if (type === 'image') {
      const btn = makeButton('⬇ Obraz', 'Pobierz obraz');
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const url = collectSingleImageUrl(postEl, meta);
        if (!url) return notify('Nie znaleziono URL obrazu');
        btn.textContent = 'Pobieranie...';
        btn.disabled = true;
        enqueue(async () => {
          try { await downloadImage(url, meta.title + '_' + (meta.id || 'img')); }
          finally { btn.textContent = '⬇ Obraz'; btn.disabled = false; }
        });
      });
      bar.appendChild(btn);
    } else if (type === 'gallery' || postEl.querySelector(SEL.gallery)) {
      const btn = makeButton('⬇ Galeria', 'Pobierz galerię (ZIP/kolejno)');
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.textContent = 'Pobieranie...';
        btn.disabled = true;
        enqueue(async () => {
          try { await downloadGallery(postEl, meta); }
          catch (err) { notify(err.message); }
          finally { btn.textContent = '⬇ Galeria'; btn.disabled = false; }
        });
      });
      bar.appendChild(btn);
    } else if (type === 'video' || postEl.querySelector(SEL.player)) {
      const btn = makeButton('⬇ Video', 'Pobierz video v.redd.it (scalanie MP4)');
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.disabled = true;
        enqueue(async () => {
          try { await downloadVideo(postEl, meta, btn); }
          catch (err) { notify('Video błąd: ' + err.message); btn.textContent = 'Błąd'; }
          finally { btn.disabled = false; if (btn.textContent.startsWith('Błąd')) setTimeout(() => btn.textContent = '⬇ Video', 2000); }
        });
      });
      bar.appendChild(btn);
    } else if (type === 'link' && meta.contentHref) {
      // dla linków zewnętrznych (np. i.redd.it) - pokaż przycisk jeśli to obraz
      if (/\.(jpe?g|png|webp|gif|mp4)(\?|$)/i.test(meta.contentHref)) {
        const btn = makeButton('⬇ Media', 'Pobierz media z linku');
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          enqueue(async () => { await downloadImage(meta.contentHref, meta.title + '_' + (meta.id || 'link')); });
        });
        bar.appendChild(btn);
      }
    }
    // zawsze: przycisk kopiuj tytuł/link
    const copyBtn = makeButton('⎘ Link', 'Kopiuj permalink');
    copyBtn.style.opacity = '0.7';
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const url = meta.permalink ? 'https://www.reddit.com' + meta.permalink : location.href;
      navigator.clipboard.writeText(url).then(() => {
        const old = copyBtn.textContent; copyBtn.textContent = 'Skopiowano!';
        setTimeout(() => copyBtn.textContent = old, 1200);
      }).catch(() => notify(url));
    });
    bar.appendChild(copyBtn);
  }

  function scanAll() {
    document.querySelectorAll(SEL.post).forEach(addButtonsToPost);
  }

  // --- Observer dla SPA ---
  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAll, 300);
  }
  function startObserver() {
    const obs = new MutationObserver((muts) => {
      let hit = false;
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.(SEL.post) || n.querySelector?.(SEL.post)) { hit = true; break; }
      }
      if (hit) scheduleScan();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // --- Menu ---
  try {
    GM_registerMenuCommand('RMD: ZIP galerii ' + (CFG.zipGalleries ? '✓' : '✗') + ' (przełącz)', () => {
      CFG.zipGalleries = !CFG.zipGalleries;
      GM_setValue('rmd_zipGalleries', CFG.zipGalleries);
      notify('ZIP galerii: ' + (CFG.zipGalleries ? 'włączony' : 'pobieranie kolejno'));
    });
    GM_registerMenuCommand('RMD: Scalanie video ' + (CFG.muxInBrowser ? '✓' : '✗') + ' (przełącz)', () => {
      CFG.muxInBrowser = !CFG.muxInBrowser;
      GM_setValue('rmd_muxInBrowser', CFG.muxInBrowser);
      notify('Scalanie MP4 w przeglądarce: ' + (CFG.muxInBrowser ? 'włączone' : '2 pliki osobno'));
    });
  } catch {}

  // --- Start ---
  scanAll();
  startObserver();
  setTimeout(scanAll, 800);
  setTimeout(scanAll, 2500);
  // dla komentarzy z linkami - nie skanujemy
})();
