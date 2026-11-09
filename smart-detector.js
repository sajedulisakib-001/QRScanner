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

  function detect(text, format = '') {
    if (!text) {
      return {
        type: 'text',
        title: 'Plain Text',
        icon: '📝',
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
        icon: '📡',
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
        icon: '👤',
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
        icon: '📅',
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
        icon: '💬',
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
        icon: '✉️',
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
        icon: '📞',
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
        icon: '💬',
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
        icon: '🏷️',
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
        icon: '📍',
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
          icon: '▶️',
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
          icon: '🎵',
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
          icon: '📄',
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
          icon: '🖼️',
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
          icon: '📱',
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
          icon: '⭐',
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
          icon: '🍽️',
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
          icon: '🔗',
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
          icon: '🏬',
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
      if (/instagram\.com/i.test(trimmed)) return makeSocial('Instagram Profile', '📸', '#d946ef', trimmed);
      if (/twitter\.com|x\.com/i.test(trimmed)) return makeSocial('X (Twitter) Profile', '🐦', '#0ea5e9', trimmed);
      if (/facebook\.com/i.test(trimmed)) return makeSocial('Facebook Page', '👥', '#2563eb', trimmed);
      if (/linkedin\.com/i.test(trimmed)) return makeSocial('LinkedIn Profile', '💼', '#0284c7', trimmed);
      if (/tiktok\.com/i.test(trimmed)) return makeSocial('TikTok Link', '🎵', '#000000', trimmed);
      if (/threads\.net/i.test(trimmed)) return makeSocial('Threads Profile', '🧵', '#1e293b', trimmed);
      if (/reddit\.com/i.test(trimmed)) return makeSocial('Reddit Link', '🤖', '#ff4500', trimmed);

      // 10k. General Landing Page / Website
      return {
        type: 'url',
        title: 'Website Link',
        icon: '🌐',
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
        icon: '🛒',
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
        icon: '📦',
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
      icon: '📝',
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
