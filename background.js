/**
 * Background Service Worker (Manifest V3)
 * Handles toolbar clicks, context menus, viewport capture, threat intelligence, and cloud webhook syncing.
 */

try {
  importScripts('url-safety.js');
} catch (e) {
  console.warn("Could not import url-safety.js in service worker:", e);
}

// Create context menu items on install / update
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'start_snip',
        title: 'Snip QR / Barcode (Alt+Shift+S / ⌘⇧S)',
        contexts: ['action', 'page']
      });
      chrome.contextMenus.create({
        id: 'open_history',
        title: '📜 Scan History & Google Cloud Sync',
        contexts: ['action']
      });
    });
  }
});

// Handle context menu clicks
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'open_history') {
      chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    } else if (info.menuItemId === 'start_snip') {
      if (tab && tab.id) {
        triggerSnipFlow(tab);
      }
    }
  });
}

// Trigger snip flow when clicking extension action icon
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    triggerSnipFlow(tab);
  }
});

async function triggerSnipFlow(tab) {
  // Internal browser URLs cannot be scripted
  const restrictedProtocols = ['chrome:', 'edge:', 'devtools:', 'chrome-extension:', 'view-source:'];
  const isRestricted = !tab.url || restrictedProtocols.some(proto => tab.url.startsWith(proto));

  if (isRestricted) {
    console.warn("QR Scanner: Cannot run on internal browser pages (" + tab.url + "). Opening test page.");
    chrome.tabs.create({ url: chrome.runtime.getURL('test.html') });
    return;
  }

  try {
    // 1. Capture pristine visible tab BEFORE overlay is shown
    const windowId = tab.windowId;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });

    try {
      // Content script already active
      await chrome.tabs.sendMessage(tab.id, { action: 'START_SNIP', dataUrl });
    } catch (err) {
      // Content script not yet injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['decoder.js', 'smart-detector.js', 'url-safety.js', 'overlay.js']
      });
      await chrome.tabs.sendMessage(tab.id, { action: 'START_SNIP', dataUrl });
    }
  } catch (err) {
    console.error("Failed to start QR Scanner:", err);
  }
}

// Listen for messages from content scripts or history dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'OPEN_HISTORY_PAGE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'CHECK_URL_SAFETY') {
    if (typeof UrlSafety !== 'undefined' && UrlSafety.checkPublicThreatIntel) {
      UrlSafety.checkPublicThreatIntel(message.url)
        .then(report => sendResponse({ success: true, report }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    } else {
      sendResponse({ success: false, error: 'UrlSafety module not loaded.' });
      return false;
    }
  }

  if (message.action === 'SAVE_SCAN_AND_SYNC') {
    handleSaveScanAndSync(message.scan || message.item)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message port open for async response
  }

  if (message.action === 'SYNC_ALL_TO_WEBHOOK') {
    handleSyncAllToWebhook(message.url, message.items)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'SYNC_TO_WEBHOOK') {
    // Send single scan or test ping to Google Sheet Webhook
    chrome.storage.local.get(['cloud_webhook_url', 'cloud_webhook_enabled'], async (data) => {
      const webhookUrl = (message.url || data.cloud_webhook_url || '').trim();
      const isEnabled = message.url ? true : (data.cloud_webhook_enabled !== false && !!webhookUrl);

      if (isEnabled && webhookUrl) {
        const item = message.item || {
          id: 'ping_' + Date.now(),
          format: 'TEST_PING',
          text: 'Google Drive Sync verified successfully!',
          time: new Date().toISOString()
        };
        const res = await dispatchWebhook(webhookUrl, item);
        sendResponse(res);
      } else {
        sendResponse({ success: false, error: 'Webhook URL is not configured or disabled.' });
      }
    });
    return true; // Keep message port open for async response
  }
});

/**
 * Robust dispatcher for Google Apps Script Web Apps.
 * Tries POST (with text/plain to bypass CORS preflight and mode: 'no-cors' to follow redirects).
 * If network issues occur, falls back to GET with URL query parameters.
 */
async function dispatchWebhook(webhookUrl, item) {
  const cleanUrl = (webhookUrl || '').trim();
  if (!cleanUrl) return { success: false, error: 'Webhook URL is empty.' };

  // Attempt 1: Direct POST with JSON string as text/plain
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
    console.warn("Webhook POST attempt encountered an issue, trying GET fallback:", postErr);
  }

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
    console.error("Webhook GET fallback failed:", getErr);
    return { success: false, error: getErr.message || 'Webhook network request failed' };
  }
}

/**
 * Handles automatic persistence and cloud backup when a code is scanned.
 * Atomically writes to local storage, syncs to Google Account (Chrome sync),
 * and dispatches to Google Drive Spreadsheet Webhook.
 */
async function handleSaveScanAndSync(scan) {
  if (!scan || !scan.text) {
    return { success: false, error: 'Empty scan data' };
  }

  // 1. Fetch current settings and history from local storage
  const localData = await chrome.storage.local.get([
    'scan_history',
    'google_cloud_sync',
    'cloud_webhook_url',
    'cloud_webhook_enabled'
  ]);

  let isGoogleSync = localData.google_cloud_sync;
  let webhookUrl = (localData.cloud_webhook_url || '').trim();
  let isWebhookEnabled = (localData.cloud_webhook_enabled !== false) && !!webhookUrl;

  // Fallback to chrome.storage.sync if local settings are uninitialized
  if ((isGoogleSync === undefined || !webhookUrl) && chrome.storage.sync) {
    try {
      const syncSettings = await chrome.storage.sync.get(['google_cloud_sync', 'cloud_webhook_url']);
      if (isGoogleSync === undefined && syncSettings.google_cloud_sync !== undefined) {
        isGoogleSync = syncSettings.google_cloud_sync;
        await chrome.storage.local.set({ google_cloud_sync: isGoogleSync });
      }
      if (!webhookUrl && syncSettings.cloud_webhook_url) {
        webhookUrl = (syncSettings.cloud_webhook_url || '').trim();
        isWebhookEnabled = !!webhookUrl;
        await chrome.storage.local.set({ cloud_webhook_url: webhookUrl, cloud_webhook_enabled: true });
      }
    } catch (e) {}
  }

  // 2. Prepare new history entry
  const history = Array.isArray(localData.scan_history) ? localData.scan_history : [];
  const entry = {
    id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    format: scan.format || 'barcode',
    text: scan.text,
    engine: scan.engine || 'Pure JS Engine',
    time: Date.now()
  };

  // Add to beginning of history (capped at 10,000 scans)
  history.unshift(entry);
  if (history.length > 10000) history.pop();
  await chrome.storage.local.set({ scan_history: history });

  let googleSyncSuccess = false;
  let webhookSyncSuccess = false;
  let webhookSyncError = null;

  // 3. Auto-backup to Google Account Cloud Sync (chrome.storage.sync)
  if (isGoogleSync && chrome.storage.sync) {
    try {
      const compact = [];
      let bytes = 0;
      for (const h of history) {
        const row = { id: h.id, f: h.format, t: (h.text || '').substring(0, 300), time: h.time };
        const rowBytes = JSON.stringify(row).length;
        if (bytes + rowBytes > 6000 || compact.length >= 25) break;
        compact.push(row);
        bytes += rowBytes;
      }
      await chrome.storage.sync.set({ scan_sync_v2: compact, scan_history: compact });
      googleSyncSuccess = true;
    } catch (syncErr) {
      console.warn('Google Account sync skipped:', syncErr);
    }
  }

  // 4. Auto-backup to Live Google Drive Spreadsheet Webhook
  if (isWebhookEnabled && webhookUrl) {
    const webhookItem = {
      id: entry.id,
      format: entry.format,
      text: entry.text,
      time: new Date(entry.time).toISOString()
    };
    const webhookRes = await dispatchWebhook(webhookUrl, webhookItem);
    webhookSyncSuccess = webhookRes.success;
    if (!webhookRes.success) {
      webhookSyncError = webhookRes.error;
    }
  }

  return {
    success: true,
    entry: entry,
    googleSync: googleSyncSuccess,
    driveSync: webhookSyncSuccess,
    driveError: webhookSyncError,
    cloudConfigured: {
      googleSync: !!isGoogleSync,
      driveWebhook: isWebhookEnabled
    }
  };
}

/**
 * Bulk sync all past scans into Google Sheets via Webhook
 */
async function handleSyncAllToWebhook(webhookUrl, items) {
  const url = (webhookUrl || '').trim();
  if (!url) return { success: false, error: 'Missing Webhook URL' };
  if (!Array.isArray(items) || items.length === 0) return { success: true, count: 0 };

  let successCount = 0;
  for (const item of items) {
    const payload = {
      id: item.id || ('scan_' + Date.now()),
      format: item.format || 'Barcode',
      text: item.text || '',
      time: item.time ? new Date(item.time).toISOString() : new Date().toISOString()
    };
    const res = await dispatchWebhook(url, payload);
    if (res.success) successCount++;
    // 60ms delay to prevent Google Apps Script burst throttling
    await new Promise(r => setTimeout(r, 60));
  }

  return { success: true, count: successCount, total: items.length };
}
