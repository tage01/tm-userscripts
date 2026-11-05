// ==UserScript==
// @name         RedGIFs User Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.2
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/redgifs/redgifs-user-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/redgifs/redgifs-user-downloader.user.js
// @description  Downloads full-quality videos from RedGIFs user galleries to redgifs/[username]/
// @author       You
// @match        https://www.redgifs.com/users/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.redgifs.com
// @connect      thumbs2.redgifs.com
// @connect      media.redgifs.com
// ==/UserScript==

(function () {
    'use strict';

    const username = window.location.pathname.replace(/\/+$/, '').split('/').pop();
    if (!username) return;

    GM_addStyle(`
        .rgd-btn {
            position: fixed; top: 80px; right: 20px; z-index: 9999;
            padding: 12px 24px; background: #e5194d; color: #fff;
            border: none; border-radius: 8px; font-size: 16px; font-weight: 700;
            cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: background 0.2s;
        }
        .rgd-btn:hover { background: #c0153e; }
        .rgd-btn:disabled { opacity: 0.6; cursor: wait; }
        .rgd-cancel {
            position: fixed; bottom: 20px; right: 20px; z-index: 10000;
            padding: 8px 16px; background: #444; color: #fff;
            border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
            display: none;
        }
        .rgd-cancel:hover { background: #666; }
        .rgd-panel {
            position: fixed; bottom: 56px; right: 20px; z-index: 9999;
            background: rgba(0,0,0,0.88); color: #fff;
            padding: 14px 18px; border-radius: 10px; font-size: 13px;
            max-height: 420px; overflow-y: auto; min-width: 280px;
            font-family: 'DM Sans', sans-serif; line-height: 1.6;
            display: none;
        }
        .rgd-panel .ok { color: #4ade80; }
        .rgd-panel .fail { color: #f87171; }
        .rgd-panel .info { color: #93c5fd; }
        .rgd-panel .done { color: #fbbf24; font-weight: 700; }
        .rgd-panel::-webkit-scrollbar { width: 6px; }
        .rgd-panel::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
    `);

    const btn = document.createElement('button');
    btn.textContent = `\u2B07 Download All (${username})`;
    btn.className = 'rgd-btn';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'rgd-panel';
    document.body.appendChild(panel);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'rgd-cancel';
    document.body.appendChild(cancelBtn);

    let cancelled = false;
    const activeRequests = new Map();
    let reqId = 0;

    function log(msg, cls = '') {
        const el = document.createElement('div');
        if (cls) el.className = cls;
        el.textContent = msg;
        panel.appendChild(el);
        panel.scrollTop = panel.scrollHeight;
    }

    function doCancel() {
        cancelled = true;
        for (const [id, handle] of activeRequests) {
            handle.abort();
            activeRequests.delete(id);
        }
        cancelBtn.style.display = 'none';
        log('Cancelling...', 'done');
    }

    function getToken() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.redgifs.com/v2/auth/temporary',
                headers: { Referer: 'https://www.redgifs.com/' },
                onload: r => {
                    try { resolve(JSON.parse(r.responseText).token); }
                    catch (e) { reject(new Error('Token parse failed')); }
                },
                onerror: reject
            });
        });
    }

    function fetchPage(token, page) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.redgifs.com/v2/users/${encodeURIComponent(username)}/search?page=${page}&count=100&order=new`,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Referer: 'https://www.redgifs.com/'
                },
                onload: r => {
                    try { resolve(JSON.parse(r.responseText)); }
                    catch (e) { reject(new Error('API response parse failed')); }
                },
                onerror: reject
            });
        });
    }

    function downloadOne(gif, index, total) {
        return new Promise(resolve => {
            const url = gif.urls?.hd || gif.urls?.sd;
            if (!url) {
                log(`[${index}/${total}] ${gif.id} \u2014 no URL`, 'fail');
                return resolve(false);
            }
            const ext = url.endsWith('.mp4') ? '.mp4' : '.gif';
            const name = `redgifs/${username}/${gif.id}${ext}`;
            const label = (gif.title || gif.id).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 60);

            const id = ++reqId;

            const handle = GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                headers: { Referer: 'https://www.redgifs.com/' },
                onload: resp => {
                    activeRequests.delete(id);
                    if (cancelled) {
                        log(`--  [${index}/${total}] ${label}`, 'fail');
                        return resolve(false);
                    }
                    const blob = resp.response;
                    const blobUrl = URL.createObjectURL(blob);
                    GM_download({
                        url: blobUrl,
                        name,
                        saveAs: false,
                        onload: () => {
                            URL.revokeObjectURL(blobUrl);
                            log(`OK  [${index}/${total}] ${label}`, 'ok');
                            resolve(true);
                        },
                        onerror: err => {
                            URL.revokeObjectURL(blobUrl);
                            log(`ERR [${index}/${total}] ${label}: ${err}`, 'fail');
                            resolve(false);
                        },
                        ontimeout: () => {
                            URL.revokeObjectURL(blobUrl);
                            log(`TIM [${index}/${total}] ${label}`, 'fail');
                            resolve(false);
                        }
                    });
                },
                onerror: () => {
                    activeRequests.delete(id);
                    if (!cancelled) {
                        log(`ERR [${index}/${total}] ${label}: fetch failed`, 'fail');
                    }
                    resolve(false);
                },
                onprogress: () => {
                    if (cancelled) {
                        const h = activeRequests.get(id);
                        if (h) {
                            h.abort();
                            activeRequests.delete(id);
                        }
                    }
                }
            });

            activeRequests.set(id, handle);
        });
    }

    async function downloadAll() {
        cancelled = false;
        btn.disabled = true;
        btn.textContent = 'Working...';
        panel.style.display = 'block';
        cancelBtn.style.display = 'block';
        panel.innerHTML = '';
        log('Fetching API token...', 'info');

        try {
            const token = await getToken();
            log('Token obtained.', 'info');

            let allGifs = [];
            let page = 1;
            let totalPages = 1;

            while (page <= totalPages) {
                if (cancelled) { log('Cancelled.', 'done'); break; }
                const data = await fetchPage(token, page);
                console.log('Page', page, 'response:', data);
                if (page === 1) {
                    totalPages = data.pages || 1;
                    log(`${data.gifs ? data.gifs.length : 0} items on page 1, ${data.total || '?'} total, ${totalPages} page(s)`, 'info');
                }
                allGifs = allGifs.concat(data.gifs || []);
                page++;
            }

            console.log('All gifs collected:', allGifs.length);

            if (cancelled || allGifs.length === 0) {
                if (allGifs.length === 0) log('No videos found.', 'fail');
                resetUI();
                return;
            }

            log(`Found ${allGifs.length} videos for "${username}". Download?`, 'info');

            if (!confirm(`RedGIFs: ${allGifs.length} videos found for user "${username}".\n\nDownload all to "redgifs/${username}/"?`)) {
                log('Cancelled.', 'done');
                cancelled = true;
                resetUI();
                return;
            }

            log(`Downloading ${allGifs.length} videos to "redgifs/${username}/"...`, 'info');

            for (let i = 0; i < allGifs.length; i++) {
                if (cancelled) { log('Cancelled.', 'done'); break; }
                await downloadOne(allGifs[i], i + 1, allGifs.length);
            }

            if (!cancelled) log('All done!', 'done');
        } catch (err) {
            log(`Error: ${err.message || err}`, 'fail');
        }

        resetUI();
    }

    function resetUI() {
        cancelBtn.style.display = 'none';
        btn.disabled = false;
        btn.textContent = `\u2B07 Download All (${username})`;
    }

    btn.addEventListener('click', downloadAll);
    cancelBtn.addEventListener('click', doCancel);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && panel.style.display === 'block' && !cancelled) {
            doCancel();
        }
    });
})();
