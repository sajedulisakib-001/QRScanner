/**
 * Smart Payload Detector & Contextual Action Engine
 * 100% Pure Vanilla JavaScript - ZERO NPM Libraries
 *
 * Intelligently classifies QR codes and barcodes into rich semantic categories:
 * - Wi-Fi Networks (SSID, Password, Security)
 * - vCard / Contacts (Name, Phone, Email, Org, .vcf export)
 * - WhatsApp Chats (Direct chat link & pre-filled message)
 * - Emails (Mailto, Gmail compose, subject/body)
 * - Phone Numbers (Call tel:, SMS)
 * - SMS Messages (Recipient, body)
 * - Calendar Events (Google Calendar link, .ics download)
 * - Geo Coordinates / Maps (Google Maps, coordinates)
 * - Business Profiles (Google Business, Yelp)
 * - Video / Media (YouTube, Vimeo, TikTok, MP4)
 * - Audio / MP3 / Music (Spotify, Apple Music, SoundCloud, MP3)
 * - PDF Documents
 * - Images / Galleries
 * - Mobile App Stores (Apple App Store, Google Play)
 * - Social Media (Instagram, Twitter/X, Facebook, LinkedIn, TikTok, Threads)
 * - Multi-URL / Link in Bio (Linktree, Bio.link, Beacons)
 * - Restaurant / Food Menu
 * - Feedback / Review / Survey (Google Reviews, Trustpilot, Forms)
 * - Coupon / Promo Codes
 * - Retail Products (EAN-13, UPC-A, EAN-8 product lookup on Google & Amazon)
 * - Logistics / Serial Barcodes (Code 128, Code 39, ITF tracking)
 * - Plain Text & URLs
 */

(function (global) {
  'use strict';

  const ICONS = {
    text: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    wifi: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>',
    vcard: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    event: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
    whatsapp: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
    email: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
    phone: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    sms: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    coupon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
    location: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
    video: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>',
    audio: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
    pdf: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
    image: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    app: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
    menu: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>',
    feedback: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
    multilink: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
    business: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path><path d="M9 9h1"></path><path d="M9 13h1"></path><path d="M9 17h1"></path><path d="M14 9h1"></path><path d="M14 13h1"></path><path d="M14 17h1"></path></svg>',
    social: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
    url: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
    product: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>',
    logistics: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><line x1="4" y1="4" x2="4" y2="20"></line><line x1="7" y1="4" x2="7" y2="20"></line><line x1="11" y1="4" x2="11" y2="20"></line><line x1="14" y1="4" x2="14" y2="20"></line><line x1="17" y1="4" x2="17" y2="20"></line><line x1="20" y1="4" x2="20" y2="20"></line></svg>'
  };

  function detect(text, format = '') {
    if (!text) {
      return {
        type: 'text',
        title: 'Plain Text',
        icon: ICONS.text,
        badgeColor: '#64748b',
        badgeClass: 'badge-text',
        data: { text: '' },
        actions: [{ id: 'copy', label: 'Copy Text', type: 'primary', action: 'copy', copyText: '' }]
      };
    }

    const trimmed = text.trim();
    const lowerFormat = (format || '').toLowerCase();

    // 1. Wi-Fi: WIFI:T:WPA;S:MyNetwork;P:MyPassword;H:false;;
    if (/^WIFI:/i.test(trimmed)) {
      const ssidMatch = trimmed.match(/;?S:([^;]*)/i);
      const passMatch = trimmed.match(/;?P:([^;]*)/i);
      const typeMatch = trimmed.match(/;?T:([^;]*)/i);
      const hiddenMatch = trimmed.match(/;?H:([^;]*)/i);
      const ssid = ssidMatch ? ssidMatch[1] : 'Unknown Network';
      const password = passMatch ? passMatch[1] : '';
      const authType = typeMatch ? typeMatch[1].toUpperCase() : 'WPA/WPA2';
      const hidden = hiddenMatch ? hiddenMatch[1].toLowerCase() === 'true' : false;

      const actions = [];
      if (password) {
        actions.push({ id: 'copy-pass', label: 'Copy Password', type: 'primary', action: 'copy', copyText: password });
      }
      actions.push({ id: 'copy-all', label: 'Copy Wi-Fi Details', type: password ? 'secondary' : 'primary', action: 'copy', copyText: `Network: ${ssid}\nPassword: ${password}\nSecurity: ${authType}` });

      return {
        type: 'wifi',
        title: 'Wi-Fi Network',
        icon: ICONS.wifi,
        badgeColor: '#3b82f6',
        badgeClass: 'badge-wifi',
        data: { ssid, password, authType, hidden, raw: trimmed },
        actions
      };
    }

    // 2. vCard / Contact: BEGIN:VCARD ... END:VCARD or MECARD:
    if (/^BEGIN:VCARD/i.test(trimmed) || /^MECARD:/i.test(trimmed)) {
      let name = '', phone = '', email = '', org = '', title = '', url = '', note = '';
      if (/^BEGIN:VCARD/i.test(trimmed)) {
        const fnMatch = trimmed.match(/\nFN[;:]([^\r\n]+)/i);
        const nMatch = trimmed.match(/\nN[;:]([^\r\n]+)/i);
        const telMatch = trimmed.match(/\nTEL[^:]*:([^\r\n]+)/i);
        const emailMatch = trimmed.match(/\nEMAIL[^:]*:([^\r\n]+)/i);
        const orgMatch = trimmed.match(/\nORG[;:]([^\r\n]+)/i);
        const titleMatch = trimmed.match(/\nTITLE[;:]([^\r\n]+)/i);
        const urlMatch = trimmed.match(/\nURL[;:]([^\r\n]+)/i);
        const noteMatch = trimmed.match(/\nNOTE[;:]([^\r\n]+)/i);

        name = fnMatch ? fnMatch[1].trim() : (nMatch ? nMatch[1].replace(/;/g, ' ').trim() : '');
        phone = telMatch ? telMatch[1].trim() : '';
        email = emailMatch ? emailMatch[1].trim() : '';
        org = orgMatch ? orgMatch[1].trim() : '';
        title = titleMatch ? titleMatch[1].trim() : '';
        url = urlMatch ? urlMatch[1].trim() : '';
        note = noteMatch ? noteMatch[1].trim() : '';
      } else {
        const nMatch = trimmed.match(/N:([^;]+)/i);
        const telMatch = trimmed.match(/TEL:([^;]+)/i);
        const emailMatch = trimmed.match(/EMAIL:([^;]+)/i);
        const orgMatch = trimmed.match(/ORG:([^;]+)/i);
        const urlMatch = trimmed.match(/URL:([^;]+)/i);
        name = nMatch ? nMatch[1] : '';
        phone = telMatch ? telMatch[1] : '';
        email = emailMatch ? emailMatch[1] : '';
        org = orgMatch ? orgMatch[1] : '';
        url = urlMatch ? urlMatch[1] : '';
      }

      // Generate clean vCard content for download
      const vcfContent = /^BEGIN:VCARD/i.test(trimmed) ? trimmed : [
        'BEGIN:VCARD',
        'VERSION:3.0',
        name ? `FN:${name}` : '',
        phone ? `TEL:${phone}` : '',
        email ? `EMAIL:${email}` : '',
        org ? `ORG:${org}` : '',
        url ? `URL:${url}` : '',
        'END:VCARD'
      ].filter(Boolean).join('\r\n');

      const actions = [
        { id: 'save-vcf', label: 'Save Contact (.vcf)', type: 'primary', action: 'vcf', filename: `${(name || 'contact').replace(/[^a-z0-9_-]/gi, '_')}.vcf`, content: vcfContent }
      ];
      if (phone) {
        actions.push({ id: 'call', label: 'Call Phone', type: 'secondary', action: 'open', url: `tel:${phone}` });
      }
      if (email) {
        actions.push({ id: 'email', label: 'Send Email', type: 'secondary', action: 'open', url: `mailto:${email}` });
      }
      actions.push({ id: 'copy', label: 'Copy Info', type: 'secondary', action: 'copy', copyText: `Name: ${name || 'N/A'}\nPhone: ${phone || 'N/A'}\nEmail: ${email || 'N/A'}` });

      return {
        type: 'vcard',
        title: 'Contact Card (vCard)',
        icon: ICONS.vcard,
        badgeColor: '#10b981',
        badgeClass: 'badge-vcard',
        data: { name: name || 'Contact', phone, email, org, title, url, note, rawVCard: trimmed },
        actions
      };
    }

    // 3. Calendar Event: BEGIN:VEVENT ... END:VEVENT
    if (/^BEGIN:VEVENT/i.test(trimmed) || /BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT/i.test(trimmed)) {
      const summaryMatch = trimmed.match(/\nSUMMARY[;:]([^\r\n]+)/i);
      const startMatch = trimmed.match(/\nDTSTART[;:]([^\r\n]+)/i);
      const endMatch = trimmed.match(/\nDTEND[;:]([^\r\n]+)/i);
      const locMatch = trimmed.match(/\nLOCATION[;:]([^\r\n]+)/i);
      const descMatch = trimmed.match(/\nDESCRIPTION[;:]([^\r\n]+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : 'Event';
      const location = locMatch ? locMatch[1].trim() : '';
      const description = descMatch ? descMatch[1].trim() : '';
      const dtStart = startMatch ? startMatch[1].trim() : '';
      const dtEnd = endMatch ? endMatch[1].trim() : '';

      const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`;

      const icsContent = /^BEGIN:VCALENDAR/i.test(trimmed) ? trimmed : [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//QR Scanner Extension//EN',
        'BEGIN:VEVENT',
        `SUMMARY:${summary}`,
        dtStart ? `DTSTART:${dtStart}` : '',
        dtEnd ? `DTEND:${dtEnd}` : '',
        location ? `LOCATION:${location}` : '',
        description ? `DESCRIPTION:${description}` : '',
        'END:VEVENT',
        'END:VCALENDAR'
      ].filter(Boolean).join('\r\n');

      return {
        type: 'event',
        title: 'Calendar Event',
        icon: ICONS.event,
        badgeColor: '#8b5cf6',
        badgeClass: 'badge-event',
        data: { summary, dtStart, dtEnd, location, description, googleCalUrl, rawICS: trimmed },
        actions: [
          { id: 'google-cal', label: 'Add to Google Calendar', type: 'primary', action: 'open', url: googleCalUrl },
          { id: 'download-ics', label: 'Download .ics', type: 'secondary', action: 'ics', filename: `${summary.replace(/[^a-z0-9_-]/gi, '_')}.ics`, content: icsContent },
          { id: 'copy', label: 'Copy Event Details', type: 'secondary', action: 'copy', copyText: `${summary}\n${location}\n${description}` }
        ]
      };
    }

    // 4. WhatsApp: wa.me, api.whatsapp.com, whatsapp://
    if (/https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)/i.test(trimmed) || /^whatsapp:\/\/send/i.test(trimmed)) {
      let phone = '', message = '';
      const waMeMatch = trimmed.match(/wa\.me\/([0-9+]+)(?:\?text=([^&]*))?/i);
      if (waMeMatch) {
        phone = waMeMatch[1];
        message = waMeMatch[2] ? decodeURIComponent(waMeMatch[2]) : '';
      } else {
        const phoneParam = trimmed.match(/[?&]phone=([0-9+]+)/i);
        const textParam = trimmed.match(/[?&]text=([^&]*)/i);
        phone = phoneParam ? phoneParam[1] : '';
        message = textParam ? decodeURIComponent(textParam[1]) : '';
      }
      const openUrl = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}` : trimmed;

      return {
        type: 'whatsapp',
        title: 'WhatsApp Chat',
        icon: ICONS.whatsapp,
        badgeColor: '#25D366',
        badgeClass: 'badge-whatsapp',
        data: { phone, message, openUrl, raw: trimmed },
        actions: [
          { id: 'wa-open', label: 'Open in WhatsApp', type: 'primary', action: 'open', url: openUrl },
          { id: 'copy', label: 'Copy Number/Text', type: 'secondary', action: 'copy', copyText: phone ? `Phone: ${phone}\n${message}` : trimmed }
        ]
      };
    }

    // 5. Email: mailto:, MATMSG:, or standard user@domain.com
    if (/^mailto:/i.test(trimmed) || /^MATMSG:/i.test(trimmed) || /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      let email = '', subject = '', body = '';
      if (/^mailto:/i.test(trimmed)) {
        const clean = trimmed.replace(/^mailto:/i, '');
        const parts = clean.split('?');
        email = parts[0];
        if (parts[1]) {
          const params = new URLSearchParams(parts[1]);
          subject = params.get('subject') || '';
          body = params.get('body') || '';
        }
      } else if (/^MATMSG:/i.test(trimmed)) {
        const toMatch = trimmed.match(/TO:([^;]+)/i);
        const subMatch = trimmed.match(/SUB:([^;]+)/i);
        const bodyMatch = trimmed.match(/BODY:([^;]+)/i);
        email = toMatch ? toMatch[1] : '';
        subject = subMatch ? subMatch[1] : '';
        body = bodyMatch ? bodyMatch[1] : '';
      } else {
        email = trimmed;
      }
      const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      return {
        type: 'email',
        title: 'Email Message',
        icon: ICONS.email,
        badgeColor: '#0ea5e9',
        badgeClass: 'badge-email',
        data: { email, subject, body, mailtoUrl, gmailUrl },
        actions: [
          { id: 'open-gmail', label: 'Compose in Gmail', type: 'primary', action: 'open', url: gmailUrl },
          { id: 'open-mailto', label: 'Open Default Mail', type: 'secondary', action: 'open', url: mailtoUrl },
          { id: 'copy-email', label: 'Copy Email', type: 'secondary', action: 'copy', copyText: email }
        ]
      };
    }

    // 6. Phone Call: tel:
    if (/^tel:/i.test(trimmed)) {
      const number = trimmed.replace(/^tel:/i, '').replace(/[^0-9+() -]/g, '').trim();
      return {
        type: 'phone',
        title: 'Phone Call',
        icon: ICONS.phone,
        badgeColor: '#10b981',
        badgeClass: 'badge-phone',
        data: { number, telUrl: `tel:${number}` },
        actions: [
          { id: 'call-now', label: 'Call Phone', type: 'primary', action: 'open', url: `tel:${number}` },
          { id: 'copy-num', label: 'Copy Number', type: 'secondary', action: 'copy', copyText: number }
        ]
      };
    }

    // 7. SMS: smsto: or sms:
    if (/^smsto:/i.test(trimmed) || /^sms:/i.test(trimmed)) {
      let number = '', message = '';
      if (/^smsto:/i.test(trimmed)) {
        const parts = trimmed.slice(6).split(':');
        number = (parts[0] || '').replace(/[^0-9+() -]/g, '');
        message = parts.slice(1).join(':') || '';
      } else {
        const clean = trimmed.slice(4);
        const parts = clean.split('?');
        number = (parts[0] || '').replace(/[^0-9+() -]/g, '');
        if (parts[1]) {
          const params = new URLSearchParams(parts[1]);
          message = params.get('body') || '';
        }
      }
      const smsUrl = `sms:${number}?body=${encodeURIComponent(message)}`;

      return {
        type: 'sms',
        title: 'SMS Message',
        icon: ICONS.sms,
        badgeColor: '#f59e0b',
        badgeClass: 'badge-sms',
        data: { number, message, smsUrl },
        actions: [
          { id: 'send-sms', label: 'Send SMS', type: 'primary', action: 'open', url: smsUrl },
          { id: 'copy-sms', label: 'Copy Text', type: 'secondary', action: 'copy', copyText: message || number }
        ]
      };
    }

    // 8. Coupon / Promo Code (prefix COUPON:, DISCOUNT:, PROMO:)
    if (/^(?:COUPON|DISCOUNT|PROMO|VOUCHER):/i.test(trimmed)) {
      const promoCode = trimmed.replace(/^(?:COUPON|DISCOUNT|PROMO|VOUCHER):\s*/i, '').trim();
      return {
        type: 'coupon',
        title: 'Coupon / Promo Code',
        icon: ICONS.coupon,
        badgeColor: '#ec4899',
        badgeClass: 'badge-coupon',
        data: { promoCode },
        actions: [
          { id: 'copy-code', label: 'Copy Promo Code', type: 'primary', action: 'copy', copyText: promoCode },
          { id: 'search-promo', label: 'Search Coupon', type: 'secondary', action: 'open', url: `https://www.google.com/search?q=${encodeURIComponent(promoCode + ' coupon discount')}` }
        ]
      };
    }

    // 9. Geo Location: geo:lat,lng
    if (/^geo:([-\d.]+),([-\d.]+)/i.test(trimmed)) {
      const m = trimmed.match(/^geo:([-\d.]+),([-\d.]+)/i);
      const lat = m[1];
      const lng = m[2];
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

      return {
        type: 'location',
        title: 'GPS Location',
        icon: ICONS.location,
        badgeColor: '#ef4444',
        badgeClass: 'badge-location',
        data: { latitude: lat, longitude: lng, mapsUrl },
        actions: [
          { id: 'open-maps', label: 'Open in Google Maps', type: 'primary', action: 'open', url: mapsUrl },
          { id: 'copy-coords', label: 'Copy Coordinates', type: 'secondary', action: 'copy', copyText: `${lat}, ${lng}` }
        ]
      };
    }

    // 10. Web URLs: Rich categorization into Video, Audio, PDF, Image, App, Social, Menu, Feedback, Business, Multi-Link, or General URL
    if (/^https?:\/\//i.test(trimmed)) {
      // 10a. Video (YouTube, Vimeo, Dailymotion, direct MP4/WebM)
      if (/youtube\.com\/watch|youtu\.be\/|vimeo\.com|dailymotion\.com|\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(trimmed)) {
        return {
          type: 'video',
          title: 'Video / Media',
          icon: ICONS.video,
          badgeColor: '#ef4444',
          badgeClass: 'badge-video',
          data: { url: trimmed },
          actions: [
            { id: 'open-video', label: 'Watch Video', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Video Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10b. Audio / MP3 / Music (Spotify, Apple Music, SoundCloud, Deezer, .mp3/.wav/.ogg)
      if (/spotify\.com|music\.apple\.com|soundcloud\.com|deezer\.com|bandcamp\.com|\.(mp3|wav|ogg|m4a|flac)(?:[?#].*)?$/i.test(trimmed)) {
        return {
          type: 'audio',
          title: 'Music / Audio (MP3)',
          icon: ICONS.audio,
          badgeColor: '#10b981',
          badgeClass: 'badge-audio',
          data: { url: trimmed },
          actions: [
            { id: 'play-audio', label: 'Listen to Audio', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Audio Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10c. PDF Document
      if (/\.pdf(?:[?#].*)?$/i.test(trimmed)) {
        return {
          type: 'pdf',
          title: 'PDF Document',
          icon: ICONS.pdf,
          badgeColor: '#f97316',
          badgeClass: 'badge-pdf',
          data: { url: trimmed },
          actions: [
            { id: 'open-pdf', label: 'Open PDF Document', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy PDF Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10d. Images (PNG, JPG, JPEG, WEBP, GIF, SVG, Unsplash, Imgur)
      if (/\.(png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(trimmed) || /imgur\.com|unsplash\.com\/photos/i.test(trimmed)) {
        return {
          type: 'image',
          title: 'Image File',
          icon: ICONS.image,
          badgeColor: '#8b5cf6',
          badgeClass: 'badge-image',
          data: { url: trimmed },
          actions: [
            { id: 'open-img', label: 'View Image', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Image Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10e. Mobile App Store (Apple App Store / Google Play)
      if (/apps\.apple\.com|play\.google\.com\/store/i.test(trimmed)) {
        return {
          type: 'app',
          title: 'Mobile App Store',
          icon: ICONS.app,
          badgeColor: '#3b82f6',
          badgeClass: 'badge-app',
          data: { url: trimmed },
          actions: [
            { id: 'open-store', label: 'Open in App Store', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Store Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10f. Feedback / Reviews / Surveys (Google Review, Trustpilot, Typeform, Forms)
      if (/writereview|g\.page\/r\/|trustpilot\.com|surveymonkey\.com|typeform\.com|forms\.gle|docs\.google\.com\/forms/i.test(trimmed)) {
        return {
          type: 'feedback',
          title: 'Feedback & Review',
          icon: ICONS.feedback,
          badgeColor: '#eab308',
          badgeClass: 'badge-feedback',
          data: { url: trimmed },
          actions: [
            { id: 'open-review', label: 'Leave Review / Survey', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10g. Restaurant Menu / Food Ordering
      if (/menu|restaurant|dining|food|toasttab\.com|chownow\.com|order\.online|ubereats\.com|doordash\.com/i.test(trimmed)) {
        return {
          type: 'menu',
          title: 'Restaurant / Food Menu',
          icon: ICONS.menu,
          badgeColor: '#f97316',
          badgeClass: 'badge-menu',
          data: { url: trimmed },
          actions: [
            { id: 'open-menu', label: 'View Food Menu', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Menu Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10h. Multi-Link / Link-in-Bio (Linktree, bio.link, beacons, etc.)
      if (/linktr\.ee|bio\.link|beacons\.ai|carrd\.co|bento\.me|taplink\.cc|lnk\.bio/i.test(trimmed)) {
        return {
          type: 'multilink',
          title: 'Multi-Link (Bio Hub)',
          icon: ICONS.multilink,
          badgeColor: '#6366f1',
          badgeClass: 'badge-multilink',
          data: { url: trimmed },
          actions: [
            { id: 'open-hub', label: 'Open Link Hub', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Hub Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10i. Business Profile / Google Maps Place
      if (/maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|waze\.com|yelp\.com\/biz/i.test(trimmed)) {
        return {
          type: 'business',
          title: 'Business Location / Maps',
          icon: ICONS.business,
          badgeColor: '#10b981',
          badgeClass: 'badge-business',
          data: { url: trimmed },
          actions: [
            { id: 'open-biz', label: 'Open in Google Maps', type: 'primary', action: 'open', url: trimmed },
            { id: 'copy-link', label: 'Copy Place Link', type: 'secondary', action: 'copy', copyText: trimmed }
          ]
        };
      }

      // 10j. Social Media Profiles
      if (/instagram\.com/i.test(trimmed)) return makeSocial('Instagram Profile', ICONS.social, '#d946ef', trimmed);
      if (/twitter\.com|x\.com/i.test(trimmed)) return makeSocial('X (Twitter) Profile', ICONS.social, '#0ea5e9', trimmed);
      if (/facebook\.com/i.test(trimmed)) return makeSocial('Facebook Page', ICONS.social, '#2563eb', trimmed);
      if (/linkedin\.com/i.test(trimmed)) return makeSocial('LinkedIn Profile', ICONS.social, '#0284c7', trimmed);
      if (/tiktok\.com/i.test(trimmed)) return makeSocial('TikTok Link', ICONS.audio, '#000000', trimmed);
      if (/threads\.net/i.test(trimmed)) return makeSocial('Threads Profile', ICONS.social, '#1e293b', trimmed);
      if (/reddit\.com/i.test(trimmed)) return makeSocial('Reddit Link', ICONS.social, '#ff4500', trimmed);

      // 10k. General Landing Page / Website
      return {
        type: 'url',
        title: 'Website Link',
        icon: ICONS.url,
        badgeColor: '#3b82f6',
        badgeClass: 'badge-url',
        data: { url: trimmed },
        actions: [
          { id: 'open-url', label: 'Open Website Link', type: 'primary', action: 'open', url: trimmed },
          { id: 'copy-link', label: 'Copy Link', type: 'secondary', action: 'copy', copyText: trimmed }
        ]
      };
    }

    // 11. Retail Product Barcodes (EAN-13, UPC-A, EAN-8)
    if (['ean_13', 'upc_a', 'ean_8'].includes(lowerFormat) || (/^\d{8}$|^\d{12}$|^\d{13}$/.test(trimmed) && !lowerFormat.includes('qr'))) {
      const googleSearchUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(trimmed)}`;
      const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(trimmed)}`;
      const barcodeLookupUrl = `https://www.barcodelookup.com/${encodeURIComponent(trimmed)}`;

      return {
        type: 'product',
        title: 'Retail Product Barcode',
        icon: ICONS.product,
        badgeColor: '#f59e0b',
        badgeClass: 'badge-product',
        data: { barcode: trimmed, googleSearchUrl, amazonUrl, barcodeLookupUrl },
        actions: [
          { id: 'google-shop', label: 'Google Shopping', type: 'primary', action: 'open', url: googleSearchUrl },
          { id: 'amazon-search', label: 'Search Amazon', type: 'secondary', action: 'open', url: amazonUrl },
          { id: 'lookup-db', label: 'Barcode Lookup', type: 'secondary', action: 'open', url: barcodeLookupUrl },
          { id: 'copy-barcode', label: 'Copy GTIN / UPC', type: 'secondary', action: 'copy', copyText: trimmed }
        ]
      };
    }

    // 12. Logistics & Carton Barcodes (Code 128, Code 39, ITF, Codabar)
    if (['code_128', 'code_39', 'itf', 'codabar'].includes(lowerFormat)) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
      return {
        type: 'logistics',
        title: 'Logistics / 1D Barcode',
        icon: ICONS.logistics,
        badgeColor: '#8b5cf6',
        badgeClass: 'badge-logistics',
        data: { code: trimmed, searchUrl },
        actions: [
          { id: 'track-search', label: 'Google / Track Code', type: 'primary', action: 'open', url: searchUrl },
          { id: 'copy-code', label: 'Copy Barcode Text', type: 'secondary', action: 'copy', copyText: trimmed }
        ]
      };
    }

    // 13. Plain Text / Notes / Structured Data Fallback
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    const translateUrl = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(trimmed)}`;

    return {
      type: 'text',
      title: 'Plain Text / Data',
      icon: ICONS.text,
      badgeColor: '#64748b',
      badgeClass: 'badge-text',
      data: { text: trimmed, googleSearchUrl, translateUrl },
      actions: [
        { id: 'copy-text', label: 'Copy Text', type: 'primary', action: 'copy', copyText: trimmed },
        { id: 'search-text', label: 'Google Search', type: 'secondary', action: 'open', url: googleSearchUrl },
        { id: 'translate-text', label: 'Translate', type: 'secondary', action: 'open', url: translateUrl }
      ]
    };
  }

  function makeSocial(title, icon, color, url) {
    return {
      type: 'social',
      title,
      icon,
      badgeColor: color,
      badgeClass: 'badge-social',
      data: { url },
      actions: [
        { id: 'open-social', label: 'Open Profile', type: 'primary', action: 'open', url },
        { id: 'copy-link', label: 'Copy Link', type: 'secondary', action: 'copy', copyText: url }
      ]
    };
  }

  // Export to global scope
  global.SmartPayloadDetector = {
    detect
  };

})(typeof window !== 'undefined' ? window : globalThis);
