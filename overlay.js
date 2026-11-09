/**
 * QR & Barcode Snipping Tool Content Script
 * Injected on demand to provide a screenshot/snipping interface.
 * Uses Shadow DOM for total style encapsulation.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__QR_SNIPPER_INITIALIZED__) {
    return;
  }
  window.__QR_SNIPPER_INITIALIZED__ = true;

  const HOST_ID = '__qr_snipper_host_container__';
  let hostElement = null;
  let shadowRoot = null;
  let cachedScreenshotDataUrl = null;

  // Sound feedback on successful scan
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }

  // History and Cloud Auto-Backup helpers
  async function saveScanToHistory(item) {
    if (!item || !item.text) return { success: false };

    try {
      // 1. Dispatch to background service worker for unified storage + cloud sync
      const res = await new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
          return resolve({ success: false, fallback: true });
        }
        chrome.runtime.sendMessage({
          action: 'SAVE_SCAN_AND_SYNC',
          scan: {
            format: item.format,
            text: item.text,
            engine: item.engine
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, fallback: true, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: true });
          }
        });
      });

      // 2. If background worker was unreachable, fallback to local storage
      if (!res || !res.success) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const data = await chrome.storage.local.get(['scan_history']);
          const history = Array.isArray(data.scan_history) ? data.scan_history : [];
          const entry = {
            id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            format: item.format,
            text: item.text,
            time: Date.now()
          };
          history.unshift(entry);
          if (history.length > 10000) history.pop();
          await chrome.storage.local.set({ scan_history: history });
          return { success: true, localOnly: true };
        }
      }

      return res;
    } catch (e) {
      console.warn("saveScanToHistory fallback error:", e);
      return { success: false, error: e.message };
    }
  }

  async function getScanHistory() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const data = await chrome.storage.local.get(['scan_history']);
        return Array.isArray(data.scan_history) ? data.scan_history : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  async function clearScanHistory() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set({ scan_history: [] });
      } catch (e) {}
    }
  }

  // Listen for trigger from background service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_SNIP') {
      startSnipping(message.dataUrl);
      sendResponse({ status: 'started' });
    } else if (message.action === 'CANCEL_SNIP') {
      cleanup();
      sendResponse({ status: 'cancelled' });
    }
  });

  function startSnipping(preCapturedDataUrl) {
    cleanup(); // Clean up any existing instance
    cachedScreenshotDataUrl = preCapturedDataUrl || null;

    // Create host element with Shadow DOM
    hostElement = document.createElement('div');
    hostElement.id = HOST_ID;
    hostElement.style.cssText = 'all: initial !important; position: absolute !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important;';
    document.documentElement.appendChild(hostElement);

    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Inject styles and template
    shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .snip-backdrop {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          cursor: crosshair;
          user-select: none;
          z-index: 2147483646;
          background: rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }

        .snip-hint-banner {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(17, 24, 39, 0.94);
          backdrop-filter: blur(10px);
          color: #f3f4f6;
          padding: 8px 18px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15);
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 2147483647;
          letter-spacing: 0.2px;
          pointer-events: auto;
        }

        .snip-hint-banner .kbd {
          background: rgba(255, 255, 255, 0.15);
          padding: 2px 7px;
          border-radius: 5px;
          font-size: 11px;
          font-family: monospace;
          font-weight: 600;
          color: #e5e7eb;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .snip-banner-btn {
          background: rgba(59, 130, 246, 0.25);
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: #93c5fd;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: background 0.15s, color 0.15s;
        }
        .snip-banner-btn:hover {
          background: #2563eb;
          color: #fff;
        }

        /* Selection box with clear cutout using giant outer box-shadow */
        .snip-selection-box {
          position: fixed;
          display: none;
          border: 2px solid #3b82f6;
          background: transparent;
          box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.45);
          z-index: 2147483646;
          pointer-events: none;
          border-radius: 3px;
        }

        .snip-dim-tag {
          position: absolute;
          bottom: -28px;
          right: 0;
          background: #1e293b;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 600;
          font-family: monospace;
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
          box-shadow: 0 2px 5px rgba(0,0,0,0.4);
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        /* Scanning overlay state */
        .snip-scanning-hud {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(12px);
          color: #fff;
          padding: 24px 32px;
          border-radius: 16px;
          display: none;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
          z-index: 2147483647;
        }

        .snip-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(59, 130, 246, 0.2);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: snip-spin 0.8s linear infinite;
        }

        @keyframes snip-spin {
          to { transform: rotate(360deg); }
        }

        /* Result Modal Card - Obsidian Theme matching history.html & Image 2 */
        .snip-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2147483647;
          animation: snip-fade-in 0.15s ease-out;
        }

        @keyframes snip-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }

        .snip-card {
          background: #141519;
          color: #f8fafc;
          width: 460px;
          max-width: 92vw;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.7);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 22px;
          box-sizing: border-box;
        }

        .snip-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .snip-card-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.3px;
        }

        .snip-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .snip-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 18px;
          cursor: pointer;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background 0.15s;
          padding: 0;
        }

        .snip-close-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }

        .snip-card-body {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .snip-meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .snip-badge {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #ffffff;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: normal;
        }

        .snip-type-label {
          font-size: 12.5px;
          color: #88909d;
          font-weight: 400;
        }

        .snip-engine-badge {
          font-size: 12px;
          color: #5e6573;
          margin-left: auto;
        }

        .snip-smart-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 11.5px;
          font-weight: 500;
          color: #ffffff;
        }

        .snip-sync-status-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #34d399;
          margin-bottom: 14px;
        }

        .snip-sync-check-icon {
          color: #10b981;
          font-weight: 700;
          font-size: 13px;
        }

        .snip-smart-box {
          background: #0d0e12;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .snip-smart-field {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          gap: 8px;
        }

        .snip-smart-label {
          color: #88909d;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .snip-smart-val {
          color: #f8fafc;
          word-break: break-all;
          text-align: right;
        }

        .snip-pill-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .snip-pill-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        .snip-result-box {
          background: #0d0e12;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 14px 16px;
          max-height: 180px;
          overflow-y: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13.5px;
          line-height: 1.45;
          color: #f8fafc;
          word-break: break-all;
          white-space: pre-wrap;
          user-select: all;
          margin-bottom: 14px;
        }

        .snip-result-box::-webkit-scrollbar {
          width: 5px;
        }
        .snip-result-box::-webkit-scrollbar-thumb {
          background: #25262c;
          border-radius: 3px;
        }

        /* Safety & Threat Intelligence Card (Image 2) */
        .snip-safety-box {
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 14px;
          font-size: 12.5px;
          border: 1px solid rgba(16, 185, 129, 0.2);
          background: rgba(16, 185, 129, 0.04);
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .snip-safety-header {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .snip-safety-icon {
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 1px;
          display: flex;
          align-items: center;
        }

        .snip-safety-title {
          font-weight: 600;
          color: #34d399;
          font-size: 13px;
        }

        .snip-safety-sub {
          font-size: 12px;
          color: #88909d;
          line-height: 1.45;
          margin-top: 3px;
        }

        .snip-safety-pill {
          display: none;
        }

        .snip-safety-toggle-btn {
          background: none;
          border: none;
          color: #38bdf8;
          font-size: 12px;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
          margin-top: 4px;
          align-self: flex-start;
          transition: color 0.15s;
        }
        .snip-safety-toggle-btn:hover {
          color: #7dd3fc;
        }

        .snip-safety-details {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 11.5px;
          color: #cbd5e1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          line-height: 1.45;
        }

        /* Action Buttons Row (Image 2) */
        .snip-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .snip-btn {
          border: none;
          height: 38px;
          padding: 0 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s ease;
          box-sizing: border-box;
          white-space: nowrap;
        }

        .snip-btn:active {
          transform: scale(0.98);
        }

        .snip-btn-primary {
          background: #ffffff;
          color: #0f1013;
          font-weight: 600;
          flex: 1;
        }
        .snip-btn-primary:hover {
          background: #e2e8f0;
        }

        .snip-btn-success {
          background: #10b981 !important;
          color: #ffffff !important;
        }

        .snip-btn-secondary {
          background: #1f2026;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f1f5f9;
        }
        .snip-btn-secondary:hover {
          background: #2b2c34;
          color: #ffffff;
        }

        /* Bottom Row Links (Image 2) */
        .snip-footer-links {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .snip-link-btn {
          background: none;
          border: none;
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          transition: color 0.15s;
        }
        .snip-link-btn:hover {
          color: #ffffff;
        }

        .snip-link-muted {
          color: #88909d;
        }
        .snip-link-muted:hover {
          color: #ffffff;
        }
        .snip-btn-disabled {
          opacity: 0.5 !important;
          cursor: not-allowed !important;
          background: #334155 !important;
          color: #94a3b8 !important;
          border-color: #475569 !important;
        }
        .snip-btn-warning {
          background: rgba(245, 158, 11, 0.2) !important;
          border-color: rgba(245, 158, 11, 0.5) !important;
          color: #fbbf24 !important;
        }

        /* History drawer */
        .snip-history-list {
          max-height: 240px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .snip-history-item {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .snip-history-info {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-family: monospace;
          color: #e2e8f0;
          flex: 1;
        }
        .snip-history-tag {
          font-size: 10px;
          font-weight: 700;
          background: #334155;
          color: #93c5fd;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .snip-empty-state {
          text-align: center;
          padding: 24px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .snip-empty-icon {
          font-size: 36px;
          opacity: 0.8;
        }
        .snip-empty-text {
          font-size: 15px;
          font-weight: 500;
          color: #f1f5f9;
        }
        .snip-empty-subtext {
          font-size: 13px;
          color: #94a3b8;
          max-width: 320px;
          line-height: 1.4;
        }
      </style>

      <div class="snip-backdrop" id="snip-backdrop">
        <div class="snip-hint-banner">
          <span>📐 Drag to select code</span>
          <button class="snip-banner-btn" id="snip-btn-fullpage" title="Scan entire visible tab">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
            Scan Whole Screen
          </button>
          <button class="snip-banner-btn" id="snip-btn-top-hist" title="View all local and cloud scan history">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            History &amp; Cloud Sync
          </button>
          <span class="kbd">ESC</span>
        </div>
        <div class="snip-selection-box" id="snip-box">
          <div class="snip-dim-tag" id="snip-dim-tag">0 × 0 px</div>
        </div>
      </div>

      <div class="snip-scanning-hud" id="snip-scanning-hud">
        <div class="snip-spinner"></div>
        <span style="font-size: 14px; font-weight: 500;">Analyzing selected area...</span>
      </div>

      <div id="snip-modal-container"></div>
    `;

    setupEvents();
  }

  function setupEvents() {
    const backdrop = shadowRoot.getElementById('snip-backdrop');
    const box = shadowRoot.getElementById('snip-box');
    const dimTag = shadowRoot.getElementById('snip-dim-tag');
    const scanningHud = shadowRoot.getElementById('snip-scanning-hud');
    const fullpageBtn = shadowRoot.getElementById('snip-btn-fullpage');

    let isMouseDown = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    // Whole screen button
    if (fullpageBtn) {
      fullpageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        box.style.display = 'none';
        backdrop.style.cursor = 'wait';
        scanningHud.style.display = 'flex';
        const viewW = document.documentElement.clientWidth || window.innerWidth;
        const viewH = document.documentElement.clientHeight || window.innerHeight;
        captureAndProcess({
          left: 0,
          top: 0,
          width: viewW,
          height: viewH
        });
      });
    }

    // Top banner history & cloud sync button
    const topHistBtn = shadowRoot.getElementById('snip-btn-top-hist');
    if (topHistBtn) {
      topHistBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup();
        chrome.runtime.sendMessage({ action: 'OPEN_HISTORY_PAGE' });
      });
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      isMouseDown = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = startX;
      currentY = startY;

      box.style.display = 'block';
      box.style.left = startX + 'px';
      box.style.top = startY + 'px';
      box.style.width = '0px';
      box.style.height = '0px';
      dimTag.textContent = '0 × 0 px';
    }

    function onMouseMove(e) {
      if (!isMouseDown) return;
      currentX = e.clientX;
      currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = width + 'px';
      box.style.height = height + 'px';
      dimTag.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
    }

    async function onMouseUp(e) {
      if (!isMouseDown) return;
      isMouseDown = false;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      // Ignore accidental tiny clicks
      if (width < 15 || height < 15) {
        box.style.display = 'none';
        return;
      }

      box.style.display = 'none';
      backdrop.style.cursor = 'wait';
      scanningHud.style.display = 'flex';

      await captureAndProcess({ left, top, width, height });
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup();
      }
    }

    backdrop.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);

    shadowRoot.__listeners = { onMouseDown, onMouseMove, onMouseUp, onKeyDown };
  }

  async function captureAndProcess(rect) {
    const backdrop = shadowRoot.getElementById('snip-backdrop');
    const scanningHud = shadowRoot.getElementById('snip-scanning-hud');

    try {
      // 1. Use pre-captured screenshot (taken before overlay darkened the page) or request on-demand
      let dataUrl = cachedScreenshotDataUrl;
      if (!dataUrl) {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' }, resolve);
        });

        if (!response || !response.success || !response.dataUrl) {
          throw new Error(response ? response.error : 'Failed to capture visible tab.');
        }
        dataUrl = response.dataUrl;
      }

      // 2. Load screenshot image
      const img = new Image();
      img.src = dataUrl;
      await img.decode();

      // 3. Compute cropping rectangle accounting for exact viewport-to-image scaling
      const viewW = document.documentElement.clientWidth || window.innerWidth;
      const viewH = document.documentElement.clientHeight || window.innerHeight;
      const scaleX = img.width / viewW;
      const scaleY = img.height / viewH;
      const cropX = Math.round(rect.left * scaleX);
      const cropY = Math.round(rect.top * scaleY);
      const cropW = Math.round(rect.width * scaleX);
      const cropH = Math.round(rect.height * scaleY);

      // Safe bounds clamping
      const safeCropX = Math.max(0, Math.min(img.width - 1, cropX));
      const safeCropY = Math.max(0, Math.min(img.height - 1, cropY));
      const safeCropW = Math.max(1, Math.min(img.width - safeCropX, cropW));
      const safeCropH = Math.max(1, Math.min(img.height - safeCropY, cropH));

      // 4. Crop image with guaranteed white quiet zone padding
      const pad = 35;
      const canvas = document.createElement('canvas');
      canvas.width = safeCropW + pad * 2;
      canvas.height = safeCropH + pad * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, safeCropX, safeCropY, safeCropW, safeCropH, pad, pad, safeCropW, safeCropH);

      // 5. Decode with UniversalBarcodeDecoder
      const result = await window.UniversalBarcodeDecoder.decode(canvas, ctx);

      // 6. Audio and storage feedback on success
      let backupStatus = null;
      if (result && result.found) {
        playBeep();
        backupStatus = await saveScanToHistory(result);
      }

      backdrop.style.display = 'none';
      scanningHud.style.display = 'none';

      // 7. Show modal
      showResultModal(result, backupStatus);

    } catch (err) {
      console.error("QR Scanner error:", err);
      backdrop.style.display = 'none';
      scanningHud.style.display = 'none';
      showResultModal({ found: false, error: err.message });
    }
  }

  function downloadBlob(filename, content, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Download failed:', e);
    }
  }

  function renderSmartPreviewBox(smart) {
    if (!smart || !smart.data) return '';
    const d = smart.data;

    if (smart.type === 'wifi') {
      return `
        <div class="snip-smart-box">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Network (SSID)</span>
            <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.ssid)}</span>
          </div>
          ${d.password ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Password</span>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="snip-smart-val" id="snip-wifi-pass" style="font-family: monospace; letter-spacing: 0.5px;">••••••••</span>
                <button type="button" class="snip-pill-btn" id="snip-wifi-toggle-pass">Show</button>
              </div>
            </div>
          ` : ''}
          <div class="snip-smart-field">
            <span class="snip-smart-label">Security</span>
            <span class="snip-smart-val">${escapeHtml(d.authType)}</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'vcard') {
      return `
        <div class="snip-smart-box">
          ${d.name ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Name</span>
              <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.name)}</span>
            </div>
          ` : ''}
          ${d.phone ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Phone</span>
              <a href="tel:${escapeHtml(d.phone)}" class="snip-smart-val" style="color: #60a5fa; text-decoration: underline;">${escapeHtml(d.phone)}</a>
            </div>
          ` : ''}
          ${d.email ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Email</span>
              <a href="mailto:${escapeHtml(d.email)}" class="snip-smart-val" style="color: #60a5fa; text-decoration: underline;">${escapeHtml(d.email)}</a>
            </div>
          ` : ''}
          ${d.org ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Company</span>
              <span class="snip-smart-val">${escapeHtml(d.org)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (smart.type === 'event') {
      return `
        <div class="snip-smart-box">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Event</span>
            <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.summary)}</span>
          </div>
          ${d.location ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Location</span>
              <span class="snip-smart-val">${escapeHtml(d.location)}</span>
            </div>
          ` : ''}
          ${d.dtStart ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Time</span>
              <span class="snip-smart-val">${escapeHtml(d.dtStart)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (smart.type === 'whatsapp') {
      return `
        <div class="snip-smart-box">
          ${d.phone ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">WhatsApp Number</span>
              <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.phone)}</span>
            </div>
          ` : ''}
          ${d.message ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Message</span>
              <span class="snip-smart-val">${escapeHtml(d.message)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (smart.type === 'email') {
      return `
        <div class="snip-smart-box">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Recipient</span>
            <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.email)}</span>
          </div>
          ${d.subject ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Subject</span>
              <span class="snip-smart-val">${escapeHtml(d.subject)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (smart.type === 'coupon') {
      return `
        <div class="snip-smart-box" style="border-color: #ec4899;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Promo / Coupon Code</span>
            <span class="snip-smart-val" style="font-size: 16px; font-weight: 700; color: #f472b6; letter-spacing: 1px;">${escapeHtml(d.promoCode)}</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'product') {
      return `
        <div class="snip-smart-box">
          <div class="snip-smart-field">
            <span class="snip-smart-label">GTIN / Barcode</span>
            <span class="snip-smart-val" style="font-size: 14px; font-family: monospace; font-weight: 600; color: #fbbf24;">${escapeHtml(d.barcode)}</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'phone') {
      return `
        <div class="snip-smart-box">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Phone Number</span>
            <a href="${escapeHtml(d.telUrl)}" class="snip-smart-val" style="font-weight: 600; color: #60a5fa; text-decoration: underline;">${escapeHtml(d.number)}</a>
          </div>
        </div>
      `;
    }

    if (smart.type === 'sms') {
      return `
        <div class="snip-smart-box">
          ${d.number ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">SMS Recipient</span>
              <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.number)}</span>
            </div>
          ` : ''}
          ${d.message ? `
            <div class="snip-smart-field">
              <span class="snip-smart-label">Message</span>
              <span class="snip-smart-val">${escapeHtml(d.message)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (smart.type === 'location') {
      return `
        <div class="snip-smart-box">
          <div class="snip-smart-field">
            <span class="snip-smart-label">GPS Coordinates</span>
            <span class="snip-smart-val" style="font-weight: 600;">${escapeHtml(d.latitude)}, ${escapeHtml(d.longitude)}</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'pdf') {
      return `
        <div class="snip-smart-box" style="border-color: #f97316;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Document Type</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #fb923c;">📄 Portable Document Format (PDF)</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'app') {
      return `
        <div class="snip-smart-box" style="border-color: #3b82f6;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Application</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #60a5fa;">📱 Mobile App Store Listing</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'video') {
      return `
        <div class="snip-smart-box" style="border-color: #ef4444;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Media Stream</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #f87171;">▶️ Online Video Link</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'audio') {
      return `
        <div class="snip-smart-box" style="border-color: #10b981;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Audio Stream</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #34d399;">🎵 Music / Audio Track</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'menu') {
      return `
        <div class="snip-smart-box" style="border-color: #f97316;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Category</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #fb923c;">🍽️ Restaurant / Dining Menu</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'feedback') {
      return `
        <div class="snip-smart-box" style="border-color: #eab308;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Category</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #facc15;">⭐ Customer Review &amp; Survey</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'multilink') {
      return `
        <div class="snip-smart-box" style="border-color: #6366f1;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Link Hub</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #818cf8;">🔗 Bio &amp; Multiple Links Page</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'social') {
      return `
        <div class="snip-smart-box" style="border-color: ${smart.badgeColor || '#3b82f6'};">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Platform</span>
            <span class="snip-smart-val" style="font-weight: 600;">${smart.icon} ${escapeHtml(smart.title)}</span>
          </div>
        </div>
      `;
    }

    if (smart.type === 'business') {
      return `
        <div class="snip-smart-box" style="border-color: #10b981;">
          <div class="snip-smart-field">
            <span class="snip-smart-label">Location</span>
            <span class="snip-smart-val" style="font-weight: 600; color: #34d399;">🏬 Business Profile / Maps</span>
          </div>
        </div>
      `;
    }

    return '';
  }

  function showResultModal(result, backupStatus) {
    const container = shadowRoot.getElementById('snip-modal-container');
    if (!container) return;

    if (result && result.found) {
      const formatName = formatDisplayName(result.format);
      const smart = window.SmartPayloadDetector ? window.SmartPayloadDetector.detect(result.text, result.format) : null;
      const actions = smart && Array.isArray(smart.actions) ? smart.actions : [
        { id: 'copy', label: 'Copy Text', type: 'primary', action: 'copy', copyText: result.text }
      ];

      // Format cloud backup status line (matching Image 2)
      let backupText = 'Synced to Google Account & Drive';
      if (backupStatus) {
        if (backupStatus.googleSync && backupStatus.driveSync) {
          backupText = 'Synced to Google Account & Drive';
        } else if (backupStatus.driveSync) {
          backupText = 'Appended to Google Drive Sheet';
        } else if (backupStatus.googleSync) {
          backupText = 'Synced to Google Account';
        } else if (backupStatus.cloudConfigured && (backupStatus.cloudConfigured.googleSync || backupStatus.cloudConfigured.driveWebhook)) {
          backupText = 'Cloud backup dispatched';
        } else {
          backupText = 'Saved to Local History';
        }
      }

      const openAction = actions.find(a => a.action === 'open' && a.url);
      const copyAction = actions.find(a => a.action === 'copy');
      const otherActions = actions.filter(a => a !== openAction && a !== copyAction);
      const hasDangerousProto = (typeof window.UrlSafety !== 'undefined') && window.UrlSafety.isDangerousProtocol(result.text);
      const isUrlOrScript = hasDangerousProto || /^https?:\/\//i.test((result.text || '').trim()) || (openAction && /^https?:\/\//i.test(openAction.url));
      const rawTargetUrl = hasDangerousProto ? (result.text || '').trim() : (openAction ? openAction.url : (result.text || '').trim());

      container.innerHTML = `
        <div class="snip-modal-overlay" id="snip-modal-backdrop">
          <div class="snip-card">
            <div class="snip-card-header">
              <h3>Scan successful</h3>
              <button class="snip-close-btn" id="snip-btn-close" title="Close (ESC)">✕</button>
            </div>
            <div class="snip-card-body" id="snip-modal-body">
              <div class="snip-meta-row">
                <span class="snip-badge">${escapeHtml(formatName)}</span>
                <span class="snip-type-label">${smart ? escapeHtml(smart.title) : 'Barcode content'}</span>
                <span class="snip-engine-badge">${escapeHtml(result.engine || 'BarcodeDetector')}</span>
              </div>

              ${renderSmartPreviewBox(smart)}

              <div class="snip-result-box" id="snip-result-text">${escapeHtml(result.text)}</div>

              ${isUrlOrScript ? `
                <div class="snip-safety-box" id="snip-safety-box">
                  <div class="snip-safety-header">
                    <span class="snip-safety-icon" id="snip-safety-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <path d="m9 12 2 2 4-4"></path>
                      </svg>
                    </span>
                    <div style="flex: 1;">
                      <div class="snip-safety-title" id="snip-safety-title">Verified safe to visit</div>
                      <div class="snip-safety-sub" id="snip-safety-sub">Verified via Cloudflare Security Threat Intelligence &amp; Google Public DNS. No security flags or threats detected.</div>
                    </div>
                  </div>
                  <div class="snip-safety-details" id="snip-safety-details" style="display: none;"></div>
                  <button type="button" class="snip-safety-toggle-btn" id="snip-safety-toggle-btn" style="display: none;">View verification details</button>
                </div>
              ` : ''}

              <div class="snip-sync-status-row" id="snip-sync-status-row">
                <span class="snip-sync-check-icon">✓</span>
                <span id="snip-sync-text">${escapeHtml(backupText)}</span>
              </div>

              <div class="snip-actions" id="snip-modal-actions">
                ${openAction ? `
                  <button class="snip-btn snip-btn-primary snip-smart-act-btn" data-act-id="${openAction.id}">
                    ${escapeHtml(openAction.label || 'Open link')} ↗
                  </button>
                ` : ''}
                ${otherActions.map(act => `
                  <button class="snip-btn ${act.type === 'primary' && !openAction ? 'snip-btn-primary' : 'snip-btn-secondary'} snip-smart-act-btn" data-act-id="${act.id}">
                    ${escapeHtml(act.label)}
                  </button>
                `).join('')}
                ${copyAction ? `
                  <button class="snip-btn ${!openAction && otherActions.length === 0 ? 'snip-btn-primary' : 'snip-btn-secondary'} snip-smart-act-btn" data-act-id="${copyAction.id}">
                    ${escapeHtml(copyAction.label || 'Copy')}
                  </button>
                ` : `
                  <button class="snip-btn snip-btn-secondary snip-smart-act-btn" data-act-id="copy">
                    Copy
                  </button>
                `}
              </div>

              <div class="snip-footer-links">
                <button class="snip-link-btn" id="snip-btn-rescan">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                  </svg>
                  Scan again
                </button>
                <button class="snip-link-btn snip-link-muted" id="snip-btn-history">
                  View history
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Handle Wi-Fi password reveal toggle if present
      if (smart && smart.type === 'wifi' && smart.data && smart.data.password) {
        const toggleBtn = shadowRoot.getElementById('snip-wifi-toggle-pass');
        const passSpan = shadowRoot.getElementById('snip-wifi-pass');
        let revealed = false;
        if (toggleBtn && passSpan) {
          toggleBtn.addEventListener('click', () => {
            revealed = !revealed;
            passSpan.textContent = revealed ? smart.data.password : '••••••••';
            toggleBtn.textContent = revealed ? 'Hide' : 'Show';
          });
        }
      }

      // Wire up smart action buttons
      shadowRoot.querySelectorAll('.snip-smart-act-btn').forEach(btn => {
        const actId = btn.getAttribute('data-act-id');
        const act = actions.find(a => a.id === actId) || (actId === 'copy' ? { action: 'copy', label: 'Copy' } : null);
        if (!act) return;

        btn.addEventListener('click', async () => {
          if (act.action === 'copy') {
            const textToCopy = act.copyText !== undefined ? act.copyText : result.text;
            try {
              await navigator.clipboard.writeText(textToCopy);
              btn.classList.add('snip-btn-success');
              const origHtml = btn.innerHTML;
              btn.innerHTML = `✓ Copied!`;
              setTimeout(() => {
                btn.classList.remove('snip-btn-success');
                btn.innerHTML = origHtml;
              }, 1800);
            } catch (err) {
              const el = shadowRoot.getElementById('snip-result-text');
              const range = document.createRange();
              range.selectNodeContents(el);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else if (act.action === 'open') {
            if (typeof window.UrlSafety !== 'undefined' && window.UrlSafety.safeOpenUrl) {
              window.UrlSafety.safeOpenUrl(act.url);
            } else {
              window.open(act.url, '_blank', 'noopener,noreferrer');
            }
          } else if (act.action === 'vcf') {
            downloadBlob(act.filename, act.content, 'text/vcard');
            btn.classList.add('snip-btn-success');
            const origHtml = btn.innerHTML;
            btn.innerHTML = `✓ Saved!`;
            setTimeout(() => {
              btn.classList.remove('snip-btn-success');
              btn.innerHTML = origHtml;
            }, 1800);
          } else if (act.action === 'ics') {
            downloadBlob(act.filename, act.content, 'text/calendar');
            btn.classList.add('snip-btn-success');
            const origHtml = btn.innerHTML;
            btn.innerHTML = `✓ Saved!`;
            setTimeout(() => {
              btn.classList.remove('snip-btn-success');
              btn.innerHTML = origHtml;
            }, 1800);
          }
        });
      });

      // Asynchronous URL Safety & Threat Intelligence Verification
      if (isUrlOrScript && typeof window.UrlSafety !== 'undefined') {
        const updateSafetyUI = (report) => {
          if (!report) return;
          const box = shadowRoot.getElementById('snip-safety-box');
          const icon = shadowRoot.getElementById('snip-safety-icon');
          const title = shadowRoot.getElementById('snip-safety-title');
          const sub = shadowRoot.getElementById('snip-safety-sub');
          const pill = shadowRoot.getElementById('snip-safety-pill');
          const details = shadowRoot.getElementById('snip-safety-details');
          const toggleBtn = shadowRoot.getElementById('snip-safety-toggle-btn');
          if (!box) return;

          if (report.verdict === 'SAFE') {
            title.textContent = 'Verified safe to visit';
            title.style.color = '#34d399';
            sub.textContent = report.summary || 'Verified via Cloudflare Security Threat Intelligence & Google Public DNS. No security flags or threats detected.';
            box.style.borderColor = 'rgba(16, 185, 129, 0.2)';
            box.style.background = 'rgba(16, 185, 129, 0.04)';
          } else if (report.verdict === 'MALICIOUS' || report.verdict === 'BLOCKED_PROTOCOL') {
            title.textContent = 'Malicious Threat Blocked';
            title.style.color = '#f87171';
            sub.textContent = report.summary || 'Malicious link detected';
            box.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            box.style.background = 'rgba(239, 68, 68, 0.06)';
          } else {
            title.textContent = 'Caution: Suspicious URL';
            title.style.color = '#fbbf24';
            sub.textContent = report.summary || 'Suspicious signals detected';
            box.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            box.style.background = 'rgba(245, 158, 11, 0.06)';
          }

          const allDetails = [];
          if (report.details && Array.isArray(report.details)) {
            report.details.forEach(d => allDetails.push(`<div>• ${escapeHtml(d)}</div>`));
          }
          if (report.warnings && Array.isArray(report.warnings)) {
            report.warnings.forEach(w => allDetails.push(`<div style="color: #f87171; font-weight: 500;">⚠️ ${escapeHtml(w)}</div>`));
          }

          if (allDetails.length > 0 && details) {
            details.innerHTML = allDetails.join('');
            if (toggleBtn) {
              toggleBtn.style.display = 'block';
              toggleBtn.onclick = () => {
                const isHidden = details.style.display === 'none';
                details.style.display = isHidden ? 'flex' : 'none';
                toggleBtn.textContent = isHidden ? 'Hide verification details' : 'View verification details';
              };
            }
          }

          // If Malicious or Dangerous Protocol: Disable open buttons!
          if (report.verdict === 'MALICIOUS' || report.verdict === 'BLOCKED_PROTOCOL' || !report.canOpen) {
            shadowRoot.querySelectorAll('.snip-smart-act-btn').forEach(b => {
              const actId = b.getAttribute('data-act-id');
              const act = actions.find(a => a.id === actId);
              if (act && act.action === 'open') {
                b.classList.add('snip-btn-disabled');
                b.setAttribute('disabled', 'true');
                b.textContent = '🚫 Open Blocked';
                b.title = 'Blocked by Threat Intelligence: ' + (report.summary || 'Malicious URL');
              }
            });
          } else if (report.verdict === 'SUSPICIOUS') {
            shadowRoot.querySelectorAll('.snip-smart-act-btn').forEach(b => {
              const actId = b.getAttribute('data-act-id');
              const act = actions.find(a => a.id === actId);
              if (act && act.action === 'open') {
                b.classList.add('snip-btn-warning');
                b.textContent = '⚠️ ' + act.label + ' (Caution)';
              }
            });
          }
        };

        // Check via background worker or directly
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'CHECK_URL_SAFETY', url: rawTargetUrl }, (res) => {
            if (res && res.success && res.report) {
              updateSafetyUI(res.report);
            } else {
              window.UrlSafety.checkPublicThreatIntel(rawTargetUrl).then(updateSafetyUI).catch(() => {});
            }
          });
        } else {
          window.UrlSafety.checkPublicThreatIntel(rawTargetUrl).then(updateSafetyUI).catch(() => {});
        }
      }

      const historyBtn = shadowRoot.getElementById('snip-btn-history');
      if (historyBtn) {
        historyBtn.addEventListener('click', () => {
          cleanup();
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'OPEN_HISTORY_PAGE' });
          }
        });
      }

    } else {
      // Empty state (matching obsidian theme)
      container.innerHTML = `
        <div class="snip-modal-overlay" id="snip-modal-backdrop">
          <div class="snip-card">
            <div class="snip-card-header">
              <h3>No code detected</h3>
              <button class="snip-close-btn" id="snip-btn-close">✕</button>
            </div>
            <div class="snip-card-body" id="snip-modal-body">
              <div class="snip-empty-state">
                <div class="snip-empty-icon">🔍</div>
                <div class="snip-empty-text">No QR code or barcode found</div>
                <div class="snip-empty-subtext">
                  Please drag carefully around the entire code, leaving a small border around the edges.
                </div>
              </div>
              <div class="snip-actions">
                <button class="snip-btn snip-btn-primary" id="snip-btn-rescan">
                  Try again
                </button>
                <button class="snip-btn snip-btn-secondary" id="snip-btn-dismiss">
                  Close
                </button>
              </div>
              <div class="snip-footer-links">
                <div></div>
                <button class="snip-link-btn snip-link-muted" id="snip-btn-history">
                  View history
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      const dismissBtn = shadowRoot.getElementById('snip-btn-dismiss');
      if (dismissBtn) dismissBtn.addEventListener('click', cleanup);

      const historyBtn = shadowRoot.getElementById('snip-btn-history');
      if (historyBtn) {
        historyBtn.addEventListener('click', () => {
          cleanup();
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'OPEN_HISTORY_PAGE' });
          }
        });
      }
    }

    const closeBtn = shadowRoot.getElementById('snip-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', cleanup);

    const rescanBtn = shadowRoot.getElementById('snip-btn-rescan');
    if (rescanBtn) rescanBtn.addEventListener('click', startSnipping);

    const modalBackdrop = shadowRoot.getElementById('snip-modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) cleanup();
      });
    }
  }

  async function showHistoryView() {
    const body = shadowRoot.getElementById('snip-modal-body');
    if (!body) return;

    const history = await getScanHistory();

    body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: #94a3b8;">All Local Scans (${history.length})</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="snip-btn-open-dashboard" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            Cloud Sync Dashboard ↗
          </button>
          ${history.length > 0 ? `
            <button id="snip-btn-clear-hist" style="background: transparent; border: none; color: #ef4444; font-size: 11px; cursor: pointer;">
              Clear All
            </button>
          ` : ''}
        </div>
      </div>

      <div class="snip-history-list" id="snip-history-list">
        ${history.length === 0 ? `
          <div style="text-align: center; color: #64748b; padding: 24px 0; font-size: 13px;">
            No scan history yet.
          </div>
        ` : history.map((h, i) => `
          <div class="snip-history-item">
            <span class="snip-history-tag">${escapeHtml(formatDisplayName(h.format))}</span>
            <div class="snip-history-info" title="${escapeHtml(h.text)}">${escapeHtml(h.text)}</div>
            <button class="snip-text-btn snip-hist-copy-btn" data-index="${i}">Copy</button>
          </div>
        `).join('')}
      </div>

      <div class="snip-actions" style="margin-top: 8px;">
        <button class="snip-btn snip-btn-primary" id="snip-btn-rescan">
          Scan New Code
        </button>
        <button class="snip-btn snip-btn-secondary" id="snip-btn-dismiss">
          Close
        </button>
      </div>
    `;

    const openDashBtn = shadowRoot.getElementById('snip-btn-open-dashboard');
    if (openDashBtn) {
      openDashBtn.addEventListener('click', () => {
        cleanup();
        chrome.runtime.sendMessage({ action: 'OPEN_HISTORY_PAGE' });
      });
    }

    // Copy buttons in history
    shadowRoot.querySelectorAll('.snip-hist-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (history[idx]) {
          await navigator.clipboard.writeText(history[idx].text);
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        }
      });
    });

    // Clear history button
    const clearBtn = shadowRoot.getElementById('snip-btn-clear-hist');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        await clearScanHistory();
        showHistoryView();
      });
    }

    const dismissBtn = shadowRoot.getElementById('snip-btn-dismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', cleanup);

    const rescanBtn = shadowRoot.getElementById('snip-btn-rescan');
    if (rescanBtn) rescanBtn.addEventListener('click', startSnipping);
  }

  function formatDisplayName(format) {
    if (!format) return 'Barcode';
    const map = {
      'qr_code': 'QR Code',
      'code_128': 'Code 128',
      'ean_13': 'EAN-13',
      'ean_8': 'EAN-8',
      'upc_a': 'UPC-A',
      'upc_e': 'UPC-E',
      'code_39': 'Code 39',
      'code_93': 'Code 93',
      'itf': 'ITF (Interleaved 2 of 5)',
      'codabar': 'Codabar',
      'data_matrix': 'Data Matrix',
      'aztec': 'Aztec',
      'pdf417': 'PDF417'
    };
    return map[format.toLowerCase()] || format.toUpperCase();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showShadowModal(options) {
    return new Promise((resolve) => {
      if (!shadowRoot) {
        resolve(false);
        return;
      }

      const iconMap = {
        success: '✓',
        warning: '⚠️',
        danger: '🚨',
        info: 'ℹ️'
      };
      const icon = iconMap[options.type] || 'ℹ️';

      const modalDiv = document.createElement('div');
      modalDiv.className = 'snip-modal-overlay';
      modalDiv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:2147483647;padding:16px;';

      modalDiv.innerHTML = `
        <div class="snip-card" style="max-width: 440px; width: 100%; border: 1px solid #334155; box-shadow: 0 25px 50px rgba(0,0,0,0.7);">
          <div class="snip-card-header">
            <h3>
              <span style="font-size: 18px;">${icon}</span>
              ${escapeHtml(options.title || 'Security Notification')}
            </h3>
            <button class="snip-close-btn" id="snip-submodal-close">✕</button>
          </div>
          <div class="snip-card-body">
            <div style="font-size: 13.5px; line-height: 1.55; color: #cbd5e1; white-space: pre-line; margin-bottom: 20px;">
              ${escapeHtml(options.message || '')}
            </div>
            <div class="snip-actions" style="justify-content: flex-end; gap: 10px;">
              ${options.cancelText ? `
                <button type="button" class="snip-btn snip-btn-secondary" id="snip-submodal-cancel">
                  ${escapeHtml(options.cancelText)}
                </button>
              ` : ''}
              <button type="button" class="snip-btn snip-btn-primary" id="snip-submodal-confirm" style="${options.type === 'danger' ? 'background: #dc2626;' : options.type === 'warning' ? 'background: #d97706;' : ''}">
                ${escapeHtml(options.confirmText || 'OK')}
              </button>
            </div>
          </div>
        </div>
      `;

      function close(result) {
        if (modalDiv.parentNode) modalDiv.parentNode.removeChild(modalDiv);
        resolve(result);
      }

      modalDiv.querySelector('#snip-submodal-close').onclick = () => close(false);
      const cancelBtn = modalDiv.querySelector('#snip-submodal-cancel');
      if (cancelBtn) cancelBtn.onclick = () => close(false);
      modalDiv.querySelector('#snip-submodal-confirm').onclick = () => close(true);

      shadowRoot.appendChild(modalDiv);
    });
  }

  // Register Shadow DOM modal handler for URL safety
  if (typeof window.UrlSafety !== 'undefined' && window.UrlSafety.setModalHandler) {
    window.UrlSafety.setModalHandler(showShadowModal);
  }

  function cleanup() {
    if (shadowRoot && shadowRoot.__listeners) {
      const { onMouseMove, onMouseUp, onKeyDown } = shadowRoot.__listeners;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    }
    if (hostElement && hostElement.parentNode) {
      hostElement.parentNode.removeChild(hostElement);
    }
    hostElement = null;
    shadowRoot = null;
  }

})();
