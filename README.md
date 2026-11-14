# QR & Barcode Snipping Scanner (Chrome Extension)

A lightweight, zero-dependency Chrome Extension (Manifest V3) that allows you to click an icon, snip any area of your screen (Windows Snipping Tool / Mac screenshot style), and instantly scan QR codes and 1D/2D barcodes with 100% pure JavaScript.

---

## Features

- **Snipping Tool UX**: Click the extension icon in the toolbar, screen dims, crosshairs appear, and you can click-and-drag to select the QR code or barcode.
- **100% Pure JavaScript**: Zero NPM libraries, zero external build tools, zero network requests.
- **Cross-Platform Compatibility**: Fully works on **Windows, Linux, macOS, ChromeOS**, or any OS running Google Chrome / Chromium.
- **Hybrid Decoding Engine**:
  - Uses native hardware acceleration (`BarcodeDetector`) where supported by the OS (macOS, ChromeOS, Android).
  - Automatically falls back to our custom **Pure-JS QR & Barcode Engine** on Windows, Linux, and unsupported platforms.
- **Formats Supported**:
  - **QR Code** (Versions 1–20+, all error correction levels L/M/Q/H, UTF-8 text, URLs, numbers, etc.)
  - **Code 128** (Subsets A, B, C with auto-mode switching, GS1-128 FNC1, Modulo 103 checksum)
  - **EAN-13 & UPC-A** (Retail standard with parity check and Modulo 10 checksum)
  - **EAN-8** (Compact retail standard with Modulo 10 checksum)
  - **Code 39** (Standard alphanumeric with start/stop asterisks)
  - **ITF / Interleaved 2 of 5** (Carton & logistics symbology)
  - **Codabar / NW-7** (Library, blood bank, and logistics symbology)
- **Pre-Capture Architecture**: Captures pristine viewport screenshots before the dimming overlay renders, ensuring crisp, zero-artifact barcode lines and 100% accurate coordinates even on high-DPI Retina screens and zoomed pages.
- **Unlimited Local History**: Keeps all your scan history locally in `chrome.storage.local` with real-time search, filter by format, filter by smart category, date timestamps, and one-click copy.
- **Intelligent Payload Detection & Smart Contextual Actions**:
  - Automatically identifies the exact type of code scanned and displays specialized rich previews and actions:
    - **Wi-Fi Networks**: Shows Network SSID, security encryption, and password with a Show/Hide toggle and 1-click **Copy Password**.
    - **vCard / Contacts**: Displays contact name, phone, email, and organization with 1-click **Save Contact (.vcf)** download, direct call (`tel:`), and email.
    - **WhatsApp Chats**: Recognizes WhatsApp chat links, shows recipient phone and pre-filled message, with 1-click **Open in WhatsApp**.
    - **Email Messages**: Parses `mailto:`, subject, and message body with 1-click **Compose in Gmail** and default mail client.
    - **Phone Numbers**: 1-click **Call Phone (`tel:`)** and copy number.
    - **SMS Messages**: Extracts number and message body with 1-click **Send SMS**.
    - **Calendar Events**: Parses `VEVENT` / `VCALENDAR` with 1-click **Add to Google Calendar** and **Download .ics** file.
    - **GPS & Location**: Detects coordinates and maps links with 1-click **Open in Google Maps**.
    - **Retail Products (EAN-13, UPC-A, EAN-8)**: 1-click **Google Shopping Search**, **Amazon Search**, and **BarcodeLookup**.
    - **Videos & Media (YouTube, Vimeo, MP4)**: 1-click **Watch Video**.
    - **Music & Audio (Spotify, Apple Music, SoundCloud, MP3)**: 1-click **Play Audio**.
    - **PDF Documents**: 1-click **Open PDF** and download.
    - **Image Files**: 1-click **View Image**.
    - **Mobile App Stores**: Direct link to Google Play or iOS App Store.
    - **Social Media Profiles**: Instagram, X (Twitter), Facebook, LinkedIn, TikTok, Threads, Reddit.
    - **Restaurant & Food Menus**: Direct link to view menus and food ordering.
    - **Feedback & Reviews**: Google Reviews, Trustpilot, forms, and surveys.
    - **Coupons & Promo Codes**: Displays promo code prominently with 1-click **Copy Promo Code**.
    - **Multi-Link Bio Hubs**: Linktree, Bio.link, Beacons, Bento.
    - **Logistics / 1D Barcodes**: Direct tracking search on Google.
    - **Websites & Links**: Direct 1-click Open Link.
    - **Plain Text**: Copy, search Google, or translate.
- **Real-Time URL Safety & Public Threat Intelligence Verification**:
  - **Zero Blind Guessing**: Never marks links safe or unsafe blindly. Queries live, authoritative public threat intelligence databases:
    - **Cloudflare Security 1.1.1.2 Threat Intelligence (DoH)**: Real-time detection of malware, phishing, exploit kits, and malicious command-and-control (C2) domains.
    - **Google Public DNS DoH**: Validates active DNS records, DNSSEC authenticity, and domain existence.
    - **Structural Anti-Phishing Heuristics**: Detects direct IP hosts, Punycode IDN homograph spoofing (`xn--...`), credential obfuscation (`@` in URL), subdomain brand deception, non-standard web ports, and high-risk disposable phishing TLDs.
  - **Host Compromise & Privilege Execution Prevention**:
    - Strictly blocks privileged/executable schemes (`javascript:`, `file:`, `data:`, `vbscript:`, `blob:`).
    - Prevents remote script injection, local file disclosure, and arbitrary code execution.
    - Automatically disables "Open Link" when malware or harmful scripts are detected to keep the host device 100% secure.
    - Presents detailed verification evidence with a single click.
- **Zero-Setup Personal Cloud Sync (Google Drive & Google Account)**:
  - **1-Click Google Account Sync**: Uses Chrome's built-in `chrome.storage.sync` to back up all your scans under your personal Google Account across all your devices. Zero configuration or API keys needed.
  - **Live Google Drive Spreadsheet Webhook**: Auto-appends every scan as a new row in your private Google Sheet in Google Drive using a free 30-second Google Apps Script webhook (NO Google Cloud Console or API keys required).
  - **1-Click Google Sheets Importer**: One button copies all scans into spreadsheet format and opens `sheets.new` ready for 1-second pasting.
  - **Exporting Options**: Download full history as CSV, JSON, or plain text.
- **Actionable Results**:
  - One-click **Copy to Clipboard** with visual confirmation.
  - One-click **Open Link** button for URLs.
  - **Scan Again** button to immediately scan another area.
- **Style Isolation**: All extension UI runs inside a **Shadow DOM**, ensuring the website's CSS never interferes with the extension's look and feel.
- **Instant Keyboard Shortcuts & Custom Keybinding Support**:
  - macOS default: `Command + Shift + S` (`⌘⇧S`)
  - Windows & Linux default: `Alt + Shift + S`
  - Fully customizable: Users can set any custom hotkey (and make it global across the OS) via Chrome's native shortcut manager (`chrome://extensions/shortcuts` or the **Shortcut** button in the dashboard).

---

## How to Install in Google Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your address bar.
3. In the top-right corner, toggle on **Developer mode**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select this project folder:
   ```
   /Users/sakib/PROJECTS/QRScanner
   ```
6. The **QR & Barcode Snipping Scanner** will appear in your extensions list.
7. Click the **Extensions puzzle piece** icon in Chrome's top-right toolbar and click the **Pin** icon next to "QR & Barcode Snipping Scanner" to keep it visible in your toolbar.

---

## How to Test

1. Open `test.html` located in this folder in Chrome:
   - Either drag and drop `test.html` into Chrome, or
   - Press `Ctrl + O` (Windows/Linux) or `Cmd + O` (macOS) in Chrome and open `/Users/sakib/PROJECTS/QRScanner/test.html`.
2. Click the **QR Scanner** icon in your Chrome toolbar or press `Command+Shift+S` (Mac) / `Alt+Shift+S` (Windows/Linux).
3. The screen will dim into snipping mode with a crosshair cursor.
4. Click and drag a selection box around any of the QR codes or barcodes on the page.
5. Release the mouse. The result popup will appear immediately with the scanned content, copy button, and link opener!

---

## File Structure

```
QRScanner/
├── manifest.json       # Chrome Extension Manifest V3 configuration
├── background.js       # Service worker handling clicks, capture, and cloud sync
├── decoder.js          # Pure JS universal QR & 1D barcode decoding engine
├── smart-detector.js   # Intelligent payload classification & action engine (Wi-Fi, vCard, etc.)
├── url-safety.js       # Real-time URL threat intelligence & execution prevention engine
├── overlay.js          # Snipping tool UI, drag-to-select marquee, and modal (Shadow DOM)
├── history.html        # Scan History & Cloud Sync Dashboard
├── history.js          # History management, search, CSV/JSON export, and Google Drive sync
├── test.html           # Standalone test page with sample QR codes and barcodes
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # Documentation and instructions
```

