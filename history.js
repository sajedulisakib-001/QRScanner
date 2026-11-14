/**
 * Scan History & Cloud Sync Dashboard Controller
 * 100% Vanilla JavaScript - ZERO NPM Libraries
 */

(function () {
  'use strict';

  let allScans = [];
  let currentPage = 1;
  let pageSize = 10;

  // DOM Elements
  const container = document.getElementById('history-items-container');
  const countLabel = document.getElementById('history-count');
  const searchInput = document.getElementById('search-input');
  const formatSelect = document.getElementById('filter-format');
  const categorySelect = document.getElementById('filter-category');
  const sortSelect = document.getElementById('sort-order');
  const googleSyncToggle = document.getElementById('toggle-google-sync');
  const webhookInput = document.getElementById('webhook-url-input');
  const webhookHint = document.getElementById('webhook-url-hint');
  const testWebhookBtn = document.getElementById('btn-test-webhook');
  const syncAllBtn = document.getElementById('btn-sync-all-to-sheet');
  const cloudBadge = document.getElementById('cloud-status-badge');

  // Load and initialize
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.UrlSafety !== 'undefined' && window.UrlSafety.setModalHandler) {
      window.UrlSafety.setModalHandler(showAppModal);
    }
    await loadSettings();
    await loadHistory();
    setupEventListeners();

    // Listen for real-time scan updates from other tabs
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          if (changes.scan_history) {
            allScans = Array.isArray(changes.scan_history.newValue) ? changes.scan_history.newValue : [];
            renderHistory();
          }
          if (changes.google_cloud_sync || changes.cloud_webhook_url) {
            loadSettings();
          }
        }
      });
    }
  });

  /**
   * Modern Accessible Modal Dialog (replaces native alert/confirm)
   */
  function showAppModal({ title, message, type = 'info', confirmText = 'OK', cancelText = null }) {
    return new Promise((resolve) => {
      const existing = document.querySelector('.app-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'app-modal-overlay';

      const iconMap = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        danger: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
      };
      const icon = iconMap[type] || iconMap.info;

      overlay.innerHTML = `
        <div class="app-modal-card" role="dialog" aria-modal="true">
          <div class="app-modal-header">
            <div class="app-modal-icon-badge type-${type}">${icon}</div>
            <div class="app-modal-title">${escapeHtml(title || 'Notification')}</div>
          </div>
          <div class="app-modal-body">${escapeHtml(message || '')}</div>
          <div class="app-modal-actions">
            ${cancelText ? `<button type="button" class="btn btn-secondary app-modal-btn-cancel">${escapeHtml(cancelText)}</button>` : ''}
            <button type="button" class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'} app-modal-btn-confirm">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      function close(result) {
        document.removeEventListener('keydown', handleKey);
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(result);
        }, 150);
      }

      function handleKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          close(true);
        }
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });

      const confirmBtn = overlay.querySelector('.app-modal-btn-confirm');
      const cancelBtn = overlay.querySelector('.app-modal-btn-cancel');

      if (confirmBtn) confirmBtn.addEventListener('click', () => close(true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));

      document.body.appendChild(overlay);
      document.addEventListener('keydown', handleKey);
      if (confirmBtn) confirmBtn.focus();
    });
  }

  async function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(['google_cloud_sync', 'cloud_webhook_url', 'cloud_webhook_enabled']);
      let googleSync = data.google_cloud_sync;
      let webhookUrl = (data.cloud_webhook_url || '').trim();

      // Fallback: check chrome.storage.sync if uninitialized in this local profile
      if ((googleSync === undefined || !webhookUrl) && chrome.storage.sync) {
        try {
          const syncData = await chrome.storage.sync.get(['google_cloud_sync', 'cloud_webhook_url']);
          if (googleSync === undefined && syncData.google_cloud_sync !== undefined) {
            googleSync = syncData.google_cloud_sync;
            await chrome.storage.local.set({ google_cloud_sync: googleSync });
          }
          if (!webhookUrl && syncData.cloud_webhook_url) {
            webhookUrl = (syncData.cloud_webhook_url || '').trim();
            await chrome.storage.local.set({ cloud_webhook_url: webhookUrl, cloud_webhook_enabled: true });
          }
        } catch (e) {}
      }
      
      if (googleSyncToggle) {
        googleSyncToggle.checked = !!googleSync;
        const syncStatusText = document.getElementById('google-sync-status-text');
        if (syncStatusText) {
          syncStatusText.textContent = googleSync ? 'Sync on' : 'Sync off';
        }
      }

      if (webhookInput && webhookUrl) {
        webhookInput.value = webhookUrl;
      }

      updateCloudBadge(!!googleSync, !!webhookUrl);
      updateWebhookHint(webhookUrl);
    }
  }

  function updateWebhookHint(url) {
    if (!webhookHint) return;
    const clean = (url || '').trim();
    if (!clean) {
      webhookHint.innerHTML = 'Must be the deployed Web App URL ending in <code>/exec</code> (not the <code>/edit</code> editor URL).';
      webhookHint.style.color = '#94a3b8';
    } else if (clean.includes('/edit')) {
      webhookHint.innerHTML = '<strong>Notice:</strong> This is the editor URL (/edit). In Google Apps Script, click <strong>Deploy &gt; Manage deployments</strong> to copy the URL ending in <strong>/exec</strong>.';
      webhookHint.style.color = '#f59e0b';
    } else if (clean.includes('/exec')) {
      webhookHint.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Valid Web App deployment URL detected (ends in /exec). Auto-backup is active!';
      webhookHint.style.color = '#34d399';
    } else {
      webhookHint.innerHTML = 'Note: Ensure this is the deployed Google Apps Script URL ending in <code>/exec</code>.';
      webhookHint.style.color = '#94a3b8';
    }
  }

  function updateCloudBadge(googleSync, webhook) {
    if (!cloudBadge) return;
    if (googleSync && webhook) {
      cloudBadge.textContent = '● Google Account & Drive Synced';
      cloudBadge.style.color = '#34d399';
      cloudBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    } else if (googleSync) {
      cloudBadge.textContent = '● Google Account Synced';
      cloudBadge.style.color = '#60a5fa';
      cloudBadge.style.background = 'rgba(59, 130, 246, 0.15)';
    } else if (webhook) {
      cloudBadge.textContent = '● Drive Sheet Webhook Active';
      cloudBadge.style.color = '#34d399';
      cloudBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    } else {
      cloudBadge.textContent = 'Local Storage Only';
      cloudBadge.style.color = '#94a3b8';
      cloudBadge.style.background = 'rgba(148, 163, 184, 0.15)';
    }
  }

  async function safeSyncGoogleAccount(items) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return;
    try {
      const compact = [];
      let bytes = 0;
      for (const h of items) {
        const row = { id: h.id, f: h.format, t: (h.text || '').substring(0, 300), time: h.time };
        const rowBytes = JSON.stringify(row).length;
        if (bytes + rowBytes > 6000 || compact.length >= 25) break;
        compact.push(row);
        bytes += rowBytes;
      }
      await chrome.storage.sync.set({ scan_sync_v2: compact, scan_history: compact });
    } catch (e) {
      console.warn('Google Account sync skipped:', e);
    }
  }

  async function loadHistory() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(['scan_history']);
      allScans = Array.isArray(data.scan_history) ? data.scan_history : [];

      // If local is empty but sync is enabled, try restoring from chrome.storage.sync
      if (allScans.length === 0 && chrome.storage.sync) {
        try {
          const syncData = await chrome.storage.sync.get(['scan_sync_v2', 'scan_history']);
          if (Array.isArray(syncData.scan_sync_v2) && syncData.scan_sync_v2.length > 0) {
            allScans = syncData.scan_sync_v2.map(item => ({
              id: item.id,
              format: item.f || item.format,
              text: item.t || item.text,
              time: item.time
            }));
            await chrome.storage.local.set({ scan_history: allScans });
          } else if (Array.isArray(syncData.scan_history) && syncData.scan_history.length > 0) {
            allScans = syncData.scan_history.map(item => ({
              id: item.id,
              format: item.f || item.format,
              text: item.t || item.text,
              time: item.time
            }));
            await chrome.storage.local.set({ scan_history: allScans });
          }
        } catch (e) {}
      }
    }
    renderHistory();
  }

  function renderHistory() {
    if (!container) return;

    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const filterFormat = formatSelect ? formatSelect.value : 'all';
    const filterCategory = categorySelect ? categorySelect.value : 'all';
    const sortOrder = sortSelect ? sortSelect.value : 'newest';

    let filtered = allScans.filter(item => {
      const smart = window.SmartPayloadDetector ? window.SmartPayloadDetector.detect(item.text, item.format) : null;
      item._smart = smart;

      // Category filter
      if (filterCategory !== 'all') {
        if (!smart || smart.type !== filterCategory) return false;
      }

      // Format filter
      if (filterFormat !== 'all') {
        const itemFmt = (item.format || '').toLowerCase();
        if (filterFormat === 'ean_13') {
          if (itemFmt !== 'ean_13' && itemFmt !== 'upc_a') return false;
        } else if (itemFmt !== filterFormat) {
          return false;
        }
      }

      // Search term
      if (searchTerm) {
        const text = (item.text || '').toLowerCase();
        const fmt = formatDisplayName(item.format).toLowerCase();
        const catTitle = (smart ? smart.title : '').toLowerCase();
        const dateStr = formatDate(item.time).toLowerCase();
        if (!text.includes(searchTerm) && !fmt.includes(searchTerm) && !catTitle.includes(searchTerm) && !dateStr.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      const timeA = a.time || 0;
      const timeB = b.time || 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const prevBtn = document.getElementById('btn-page-prev');
    const nextBtn = document.getElementById('btn-page-next');
    const pageIndicator = document.getElementById('page-indicator');

    if (prevBtn) prevBtn.disabled = (currentPage <= 1);
    if (nextBtn) nextBtn.disabled = (currentPage >= totalPages);
    if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;

    if (filtered.length === 0) {
      if (countLabel) countLabel.textContent = `Showing 0 of ${allScans.length} scans`;
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>
          <div style="font-size: 15px; font-weight: 600; color: #f1f5f9; margin-bottom: 6px;">
            ${allScans.length === 0 ? 'No scan history yet' : 'No matching scans found'}
          </div>
          <div style="font-size: 13px;">
            ${allScans.length === 0 ? 'Click "Snip New Code" or press ⌘⇧S (Command+Shift+S on Mac) / Alt+Shift+S on any tab to start scanning.' : 'Try adjusting your search query or format/category filters.'}
          </div>
        </div>
      `;
      return;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, filtered.length);
    const pageItems = filtered.slice(startIdx, endIdx);

    if (countLabel) {
      countLabel.textContent = `Showing ${startIdx + 1}–${endIdx} of ${filtered.length} scans`;
    }

    container.innerHTML = pageItems.map((item, localIdx) => {
      const globalIndex = startIdx + localIdx;
      const smart = item._smart;
      const isUrl = /^https?:\/\//i.test((item.text || '').trim());
      const isDangerous = (typeof window.UrlSafety !== 'undefined') && window.UrlSafety.isDangerousProtocol(item.text);
      const badgeClass = getBadgeClass(item.format);
      const displayName = formatDisplayName(item.format);
      const dateFormatted = formatDate(item.time);
      const primaryAction = smart && smart.actions ? smart.actions.find(a => a.id !== 'copy' && a.id !== 'copy-text') : null;

      return `
        <div class="history-item" data-id="${item.id || globalIndex}">
          <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start; width: 125px; flex-shrink: 0;">
            <span class="format-badge ${badgeClass}">${escapeHtml(displayName)}</span>
            ${smart ? `<span class="category-badge" style="background: ${smart.badgeColor};">${smart.icon} ${escapeHtml(smart.title)}</span>` : ''}
          </div>
          <div class="item-body">
            <div class="item-text">${escapeHtml(item.text)}</div>
            <div class="item-meta">
              <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${dateFormatted}</span>
              ${isDangerous ? `<span style="color: #ef4444; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>Dangerous Script Blocked</span>` : ''}
              ${isUrl && !isDangerous ? `<button type="button" class="btn-safe-open" data-url="${escapeHtml(item.text)}" style="color: #60a5fa; background: none; border: none; text-decoration: underline; cursor: pointer; font-size: 12px; padding: 0;">Open Link ↗</button>` : ''}
            </div>
          </div>
          <div class="item-actions">
            ${primaryAction ? `
              <button class="action-btn btn-smart-act" data-index="${globalIndex}" style="background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.12); color: #f1f5f9;">
                ${escapeHtml(primaryAction.label)}
              </button>
            ` : ''}
            <button class="action-btn btn-copy" data-text="${escapeHtml(item.text)}" title="Copy to clipboard">
              Copy
            </button>
            <button class="action-btn btn-delete" data-id="${item.id || ''}" data-index="${globalIndex}" title="Delete this scan">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach row events
    container.querySelectorAll('.btn-safe-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        if (typeof window.UrlSafety !== 'undefined' && window.UrlSafety.safeOpenUrl) {
          window.UrlSafety.safeOpenUrl(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });

    container.querySelectorAll('.btn-smart-act').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const item = filtered[idx];
        if (!item || !item._smart || !item._smart.actions) return;
        const act = item._smart.actions.find(a => a.id !== 'copy' && a.id !== 'copy-text');
        if (!act) return;

        if (act.action === 'open') {
          if (typeof window.UrlSafety !== 'undefined' && window.UrlSafety.safeOpenUrl) {
            window.UrlSafety.safeOpenUrl(act.url);
          } else {
            window.open(act.url, '_blank', 'noopener,noreferrer');
          }
        } else if (act.action === 'vcf') {
          downloadBlob(act.content, act.filename, 'text/vcard');
        } else if (act.action === 'ics') {
          downloadBlob(act.content, act.filename, 'text/calendar');
        } else if (act.action === 'copy') {
          navigator.clipboard.writeText(act.copyText || item.text);
        }
      });
    });

    container.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-text');
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        await deleteScan(id, idx);
      });
    });
  }

  async function deleteScan(id, index) {
    if (id) {
      allScans = allScans.filter(item => item.id !== id);
    } else if (index >= 0 && index < allScans.length) {
      allScans.splice(index, 1);
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ scan_history: allScans });
      const data = await chrome.storage.local.get(['google_cloud_sync']);
      if (data.google_cloud_sync) {
        await safeSyncGoogleAccount(allScans);
      }
    }

    // Auto-adjust page if current page became out of bounds
    const totalPages = Math.max(1, Math.ceil(allScans.length / pageSize));
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    renderHistory();
  }

  function setupEventListeners() {
    // Search & filters (reset to page 1)
    const resetAndRender = () => {
      currentPage = 1;
      renderHistory();
    };
    if (searchInput) searchInput.addEventListener('input', resetAndRender);
    if (formatSelect) formatSelect.addEventListener('change', resetAndRender);
    if (categorySelect) categorySelect.addEventListener('change', resetAndRender);
    if (sortSelect) sortSelect.addEventListener('change', resetAndRender);

    // Page size selector (10, 20, 50)
    const pageSizeSelect = document.getElementById('page-size-select');
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        pageSize = parseInt(pageSizeSelect.value, 10) || 10;
        currentPage = 1;
        renderHistory();
      });
    }

    // Previous & Next Pagination Buttons
    const prevBtn = document.getElementById('btn-page-prev');
    const nextBtn = document.getElementById('btn-page-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderHistory();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentPage++;
        renderHistory();
      });
    }

    // Snip new code button
    const snipBtn = document.getElementById('btn-snip-new');
    if (snipBtn) {
      snipBtn.addEventListener('click', async () => {
        // Query active tab in current window
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'START_SNIP' }).catch(() => {
              chrome.tabs.create({ url: chrome.runtime.getURL('test.html') });
            });
          }
        }
      });
    }

    // Export CSV
    const exportCsvBtn = document.getElementById('btn-export-csv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', async () => {
        if (allScans.length === 0) {
          await showAppModal({
            title: 'No Scans to Export',
            message: 'Your scan history is currently empty. Snip a code first before exporting.',
            type: 'info'
          });
          return;
        }

        let csv = 'Timestamp,Format,Content\r\n';
        for (const item of allScans) {
          const time = new Date(item.time || Date.now()).toISOString();
          const fmt = `"${(item.format || '').replace(/"/g, '""')}"`;
          const text = `"${(item.text || '').replace(/"/g, '""')}"`;
          csv += `${time},${fmt},${text}\r\n`;
        }

        downloadBlob(csv, `QR_Barcode_History_${getTodayDateStr()}.csv`, 'text/csv;charset=utf-8;');
      });
    }

    // Export JSON
    const exportJsonBtn = document.getElementById('btn-export-json');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', async () => {
        if (allScans.length === 0) {
          await showAppModal({
            title: 'No Scans to Export',
            message: 'Your scan history is currently empty. Snip a code first before exporting.',
            type: 'info'
          });
          return;
        }
        const jsonStr = JSON.stringify(allScans, null, 2);
        downloadBlob(jsonStr, `QR_Barcode_History_${getTodayDateStr()}.json`, 'application/json');
      });
    }

    // Configure Custom Keyboard Shortcut
    const shortcutBtn = document.getElementById('btn-configure-shortcut');
    if (shortcutBtn) {
      shortcutBtn.addEventListener('click', async () => {
        let opened = false;
        try {
          if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
            await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
            opened = true;
          }
        } catch (e) {
          opened = false;
        }

        if (!opened) {
          try {
            await navigator.clipboard.writeText('chrome://extensions/shortcuts');
          } catch (clipErr) {}
          await showAppModal({
            title: 'Customize Keyboard Shortcut',
            message: 'Chrome manages all extension keyboard shortcuts in its native Shortcuts manager.\n\n1. Open a new tab (⌘T on Mac / Ctrl+T on Windows)\n2. Paste: chrome://extensions/shortcuts (already copied to your clipboard!)\n3. Find "QR & Barcode Snipping Scanner"\n4. Click the pencil (Edit) button to record any key combination you want (e.g. ⌘⇧S, ⌘⌥Q, or any custom keys).\n5. Tip: You can switch it from "In Chrome" to "Global" to snip anywhere on your computer!',
            type: 'info',
            confirmText: 'Got It!'
          });
        }
      });
    }

    // Clear All History
    const clearAllBtn = document.getElementById('btn-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        if (allScans.length === 0) return;
        const confirmClear = await showAppModal({
          title: 'Delete All History?',
          message: 'Are you sure you want to permanently delete all scan history? This action cannot be undone.',
          type: 'danger',
          confirmText: 'Delete All History',
          cancelText: 'Cancel'
        });
        if (confirmClear) {
          allScans = [];
          currentPage = 1;
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({ scan_history: [] });
            if (chrome.storage.sync) {
              await chrome.storage.sync.set({ scan_history: [], scan_sync_v2: [] }).catch(() => {});
            }
          }
          renderHistory();
        }
      });
    }

    // Google Account Sync toggle
    if (googleSyncToggle) {
      googleSyncToggle.addEventListener('change', async () => {
        const enabled = googleSyncToggle.checked;
        const syncStatusText = document.getElementById('google-sync-status-text');
        if (syncStatusText) {
          syncStatusText.textContent = enabled ? 'Sync on' : 'Sync off';
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ google_cloud_sync: enabled });
          if (chrome.storage.sync) {
            try {
              await chrome.storage.sync.set({ google_cloud_sync: enabled });
            } catch (e) {}
          }
          if (enabled) {
            await safeSyncGoogleAccount(allScans);
          }
          const data = await chrome.storage.local.get(['cloud_webhook_url']);
          updateCloudBadge(enabled, !!data.cloud_webhook_url);
        }
      });
    }

    // Webhook URL input auto-save (on both typing and blur)
    const handleWebhookSave = async () => {
      const url = (webhookInput ? webhookInput.value : '').trim();
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({
          cloud_webhook_url: url,
          cloud_webhook_enabled: !!url
        });
        if (chrome.storage.sync) {
          try {
            await chrome.storage.sync.set({
              cloud_webhook_url: url,
              cloud_webhook_enabled: !!url
            });
          } catch (e) {}
        }
        const data = await chrome.storage.local.get(['google_cloud_sync']);
        updateCloudBadge(!!data.google_cloud_sync, !!url);
        updateWebhookHint(url);
      }
    };

    if (webhookInput) {
      webhookInput.addEventListener('input', handleWebhookSave);
      webhookInput.addEventListener('change', handleWebhookSave);
    }

    // Test Webhook button
    if (testWebhookBtn) {
      testWebhookBtn.addEventListener('click', async () => {
        const url = (webhookInput ? webhookInput.value : '').trim();
        if (!url) {
          await showAppModal({
            title: 'Web App URL Required',
            message: 'Please paste your Google Apps Script Web App URL first into the field above.',
            type: 'warning'
          });
          return;
        }

        if (url.includes('/edit')) {
          await showAppModal({
            title: 'Invalid Web App URL',
            message: 'The URL you entered contains "/edit".\n\nPlease enter the deployed Web App URL that ends with "/exec" (from Deploy > Manage deployments in Google Apps Script).',
            type: 'warning'
          });
          return;
        }

        testWebhookBtn.textContent = 'Testing...';
        testWebhookBtn.disabled = true;

        try {
          // Persist URL first
          await chrome.storage.local.set({ cloud_webhook_url: url, cloud_webhook_enabled: true });
          if (chrome.storage.sync) {
            try {
              await chrome.storage.sync.set({ cloud_webhook_url: url, cloud_webhook_enabled: true });
            } catch (e) {}
          }

          // Send test item
          const testItem = {
            id: 'test_' + Date.now(),
            format: 'TEST_PING',
            text: 'Google Drive Sync verified successfully!',
            time: new Date().toISOString()
          };

          chrome.runtime.sendMessage({ action: 'SYNC_TO_WEBHOOK', url: url, item: testItem }, async (res) => {
            testWebhookBtn.disabled = false;
            testWebhookBtn.textContent = 'Test';
            if (res && res.success) {
              await showAppModal({
                title: 'Google Drive Connected!',
                message: 'Success! A test row was sent to your Google Sheet in Google Drive. Open your spreadsheet to view the new row.',
                type: 'success',
                confirmText: 'Great!'
              });
              updateCloudBadge(googleSyncToggle ? googleSyncToggle.checked : false, true);
            } else {
              const extra = (res && res.error) ? '\n\nDetails: ' + res.error : '';
              await showAppModal({
                title: 'Test Signal Sent',
                message: 'Test signal dispatched to your Google Apps Script! Check your Google Sheet to confirm the test row was added.' + extra + '\n\nReminder: In Apps Script, set "Who has access" to "Anyone".',
                type: 'info'
              });
              updateCloudBadge(googleSyncToggle ? googleSyncToggle.checked : false, true);
            }
          });
        } catch (err) {
          testWebhookBtn.disabled = false;
          testWebhookBtn.textContent = 'Test';
          await showAppModal({
            title: 'Connection Failed',
            message: 'Failed to connect: ' + err.message + '\n\nPlease check your internet connection and ensure deployment access is set to "Anyone".',
            type: 'danger'
          });
        }
      });
    }

    // Helper to send a single scan to Google Apps Script webhook
    async function sendScanToWebhook(webhookUrl, item) {
      const cleanUrl = (webhookUrl || '').trim();
      if (!cleanUrl) return { success: false, error: 'Empty Webhook URL' };

      // Attempt 1: Direct POST with JSON string
      try {
        await fetch(cleanUrl, {
          method: 'POST',
          mode: 'no-cors',
          cache: 'no-cache',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item || {})
        });
        return { success: true };
      } catch (postErr) {
        // Attempt 2: Fallback to GET with URL search params
        try {
          const targetUrl = new URL(cleanUrl);
          targetUrl.searchParams.set('format', item.format || 'Barcode');
          targetUrl.searchParams.set('text', item.text || '');
          targetUrl.searchParams.set('time', item.time || new Date().toISOString());
          targetUrl.searchParams.set('id', item.id || '');
          await fetch(targetUrl.toString(), {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-cache',
            redirect: 'follow'
          });
          return { success: true };
        } catch (getErr) {
          return { success: false, error: getErr.message };
        }
      }
    }

    // Bulk Sync All History to Google Sheet with Real-time Progress Bar
    if (syncAllBtn) {
      syncAllBtn.addEventListener('click', async () => {
        const url = (webhookInput ? webhookInput.value : '').trim();
        if (!url) {
          await showAppModal({
            title: 'Web App URL Required',
            message: 'Please paste your Google Apps Script Web App URL first into the field above before syncing history.',
            type: 'warning'
          });
          if (webhookInput) webhookInput.focus();
          return;
        }

        if (url.includes('/edit')) {
          await showAppModal({
            title: 'Invalid Web App URL',
            message: 'The URL you entered contains "/edit".\n\nPlease enter the deployed Web App URL that ends with "/exec" (from Deploy > Manage deployments in Google Apps Script).',
            type: 'warning'
          });
          if (webhookInput) webhookInput.focus();
          return;
        }

        if (allScans.length === 0) {
          await showAppModal({
            title: 'No Scans in History',
            message: 'You have no scans in history yet. Snip a code first to test!',
            type: 'info'
          });
          return;
        }

        const confirmSync = await showAppModal({
          title: 'Sync All Scans to Google Sheet?',
          message: `This will append all ${allScans.length} scans from your history as new rows into your Google Sheet. Continue?`,
          type: 'info',
          confirmText: 'Sync All Now',
          cancelText: 'Cancel'
        });

        if (!confirmSync) return;

        // Progress UI elements
        const progressBox = document.getElementById('sync-progress-box');
        const progressLabel = document.getElementById('sync-progress-label');
        const progressPercent = document.getElementById('sync-progress-percent');
        const progressFill = document.getElementById('sync-progress-fill');
        const progressCaption = document.getElementById('sync-progress-caption');

        if (progressBox) {
          progressBox.style.display = 'block';
          progressBox.style.opacity = '1';
        }
        if (progressFill) {
          progressFill.style.width = '0%';
          progressFill.style.background = 'linear-gradient(90deg, #3b82f6, #10b981)';
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressLabel) progressLabel.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>Syncing scans to Google Sheet...';
        if (progressCaption) progressCaption.textContent = `0 of ${allScans.length} scans synced`;

        syncAllBtn.disabled = true;
        syncAllBtn.textContent = 'Syncing...';

        const total = allScans.length;
        let successCount = 0;
        let completed = 0;

        // Send items sequentially with smooth progress updates and throttling safety
        for (let i = 0; i < total; i++) {
          const item = allScans[i];
          const payload = {
            id: item.id || ('scan_' + Date.now() + '_' + i),
            format: item.format || 'Barcode',
            text: item.text || '',
            time: item.time ? new Date(item.time).toISOString() : new Date().toISOString()
          };

          const res = await sendScanToWebhook(url, payload);
          if (res.success) successCount++;
          completed++;

          const pct = Math.round((completed / total) * 100);
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (progressPercent) progressPercent.textContent = `${pct}%`;
          if (progressCaption) progressCaption.textContent = `${completed} of ${total} scans synced (${successCount} succeeded)`;

          // 50ms delay between rows for visual progress feedback and GAS rate limit protection
          await new Promise(r => setTimeout(r, 50));
        }

        // Finalize progress bar
        if (progressFill) {
          progressFill.style.width = '100%';
          progressFill.style.background = '#10b981';
        }
        if (progressPercent) progressPercent.textContent = '100%';
        if (progressLabel) progressLabel.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>All scans synced successfully!';
        if (progressCaption) progressCaption.textContent = `Completed! ${successCount} of ${total} scans appended to your Google Sheet.`;

        syncAllBtn.disabled = false;
        syncAllBtn.textContent = 'Sync all to sheet ⟳';

        // Auto-fade progress box after 8 seconds
        setTimeout(() => {
          if (progressBox && progressBox.style.display !== 'none') {
            progressBox.style.transition = 'opacity 0.4s ease';
            progressBox.style.opacity = '0';
            setTimeout(() => {
              progressBox.style.display = 'none';
              progressBox.style.opacity = '1';
            }, 400);
          }
        }, 8000);

        await showAppModal({
          title: 'Sync Complete!',
          message: `Successfully synced ${successCount} scans into your Google Sheet in Google Drive! Open your spreadsheet to view the new rows.`,
          type: 'success',
          confirmText: 'Find in Drive ↗',
          cancelText: 'Done'
        }).then((openDrive) => {
          if (openDrive) {
            window.open('https://drive.google.com/drive/search?q=QR_Barcode_Scans', '_blank');
          }
        });
      });
    }

    // 1-Click Paste into Google Sheets
    const oneClickDriveBtn = document.getElementById('btn-one-click-drive');
    if (oneClickDriveBtn) {
      oneClickDriveBtn.addEventListener('click', async () => {
        if (allScans.length === 0) {
          await showAppModal({
            title: 'No Scans Available',
            message: 'No scans to save yet. Perform a scan first!',
            type: 'info'
          });
          return;
        }

        // Generate Tab-Separated Values (TSV) which pastes directly into Google Sheets columns
        let tsv = 'Date & Time\tBarcode Type\tScanned Content\r\n';
        for (const item of allScans) {
          const dateStr = formatDate(item.time);
          const fmt = formatDisplayName(item.format);
          const text = (item.text || '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
          tsv += `${dateStr}\t${fmt}\t${text}\r\n`;
        }

        await navigator.clipboard.writeText(tsv);
        window.open('https://sheets.new', '_blank');
        await showAppModal({
          title: 'Scans Copied to Clipboard!',
          message: 'All scans have been copied to your clipboard in spreadsheet format!\n\nIn the newly opened Google Sheet, simply press Ctrl+V (or Cmd+V on Mac) to paste all your scans into neat rows and columns.',
          type: 'success',
          confirmText: 'Got It!'
        });
      });
    }

    // 1-Click Download CSV for Google Drive
    const downloadDriveCsvBtn = document.getElementById('btn-download-drive-csv');
    if (downloadDriveCsvBtn) {
      downloadDriveCsvBtn.addEventListener('click', async () => {
        if (allScans.length === 0) {
          await showAppModal({
            title: 'No Scans Available',
            message: 'No scans in history to export yet. Perform a scan first!',
            type: 'info'
          });
          return;
        }

        let csvContent = '\uFEFFDate & Time,Barcode Type,Scanned Content\r\n';
        for (const item of allScans) {
          const dateStr = `"${formatDate(item.time).replace(/"/g, '""')}"`;
          const fmt = `"${formatDisplayName(item.format).replace(/"/g, '""')}"`;
          const text = `"${(item.text || '').replace(/"/g, '""')}"`;
          csvContent += `${dateStr},${fmt},${text}\r\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_Scan_History_GoogleDrive_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        await showAppModal({
          title: 'Google Drive File Downloaded!',
          message: 'Your scan history has been saved as a spreadsheet file.\n\nYou can drop it directly into Google Drive or double-click to open in Google Sheets or Excel anytime!',
          type: 'success',
          confirmText: 'Great!'
        });
      });
    }

    // Find QR_Barcode_Scans sheet directly in Google Drive
    const findSheetBtn = document.getElementById('btn-find-sheet-drive');
    if (findSheetBtn) {
      findSheetBtn.addEventListener('click', () => {
        window.open('https://drive.google.com/drive/search?q=QR_Barcode_Scans', '_blank');
      });
    }

    // Open Drive Home
    const openDriveHomeBtn = document.getElementById('btn-open-drive-home');
    if (openDriveHomeBtn) {
      openDriveHomeBtn.addEventListener('click', () => {
        window.open('https://drive.google.com/drive/my-drive', '_blank');
      });
    }

    // Webhook modal guide & dialog dismissal
    const guideBtn = document.getElementById('btn-show-webhook-guide');
    const modal = document.getElementById('webhook-modal');
    const closeModalBtn = document.getElementById('btn-close-modal');
    const closeTopModalBtn = document.getElementById('btn-close-modal-top');
    const copyScriptBtn = document.getElementById('btn-copy-script');

    const hideWebhookModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (guideBtn && modal) {
      guideBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
    }
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', hideWebhookModal);
    }
    if (closeTopModalBtn) {
      closeTopModalBtn.addEventListener('click', hideWebhookModal);
    }
    if (modal) {
      modal.querySelectorAll('.modal-close-icon').forEach(btn => {
        btn.addEventListener('click', hideWebhookModal);
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) hideWebhookModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        hideWebhookModal();
      }
    });

    if (copyScriptBtn) {
      copyScriptBtn.addEventListener('click', async () => {
        const snippet = document.getElementById('code-snippet').textContent;
        await navigator.clipboard.writeText(snippet);
        copyScriptBtn.textContent = 'Copied to Clipboard!';
        setTimeout(() => { copyScriptBtn.textContent = 'Copy script to clipboard'; }, 1500);
      });
    }

  }

  // Helpers
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
      'itf': 'ITF',
      'codabar': 'Codabar'
    };
    return map[format.toLowerCase()] || format.toUpperCase();
  }

  function getBadgeClass(format) {
    if (!format) return 'badge-other';
    const f = format.toLowerCase();
    if (f.includes('qr')) return 'badge-qr';
    if (f.includes('128')) return 'badge-128';
    if (f.includes('ean') || f.includes('upc')) return 'badge-ean';
    return 'badge-other';
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Just now';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getTodayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
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

})();
