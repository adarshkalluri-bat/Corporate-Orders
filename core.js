/* Allocation Desk - the parts that do not touch the screen or the network:
   status rules, stock position, splitting, reading SAP files, composing the store message.
   The database enforces the same rules again on every change (see supabase-setup.sql). */
(function (root) {
  'use strict';

  const STATUS_LABEL = {
    PENDING: 'Pending', AWAITING: 'Awaiting store', PARTIAL: 'Partly approved',
    APPROVED: 'Approved', DISPATCHED: 'Dispatched', REJECTED: 'Rejected',
    OFFERED: 'Offered', CANCELLED: 'Cancelled'
  };
  const STATUS_ORDER = ['PENDING', 'AWAITING', 'PARTIAL', 'APPROVED', 'DISPATCHED', 'REJECTED'];

  function statusOf(l) {
    if (l.rejected) return 'REJECTED';
    if (l.offered > 0) return 'AWAITING';
    const total = l.approved_open + l.dispatched;
    if (total === 0) return 'PENDING';
    const done = total >= l.req_qty || l.balance_closed;
    if (l.approved_open === 0 && done) return 'DISPATCHED';
    return done ? 'APPROVED' : 'PARTIAL';
  }

  /* Turn the server's snapshot into what the screens use. */
  function build(snap) {
    const articles = {}, stores = {}, groups = {}, pos = {};
    for (const a of snap.articles) {
      articles[a.article_code] = a;
      const g = (a.group_name || '').trim();
      if (g) (groups[g] = groups[g] || []).push(a.article_code);
    }
    for (const s of snap.stores) stores[s.store_code] = s;
    const P = (c) => pos[c] || (pos[c] = { dc: 0, stores: 0, reserved: 0, free: 0, pending: 0, n_lines: 0, n_stores: 0, _st: new Set() });
    for (const c in articles) P(c);
    for (const c in snap.stock) { const p = P(c); p.dc = snap.stock[c][0]; p.stores = snap.stock[c][1]; }
    for (const c in snap.reserved) P(c).reserved = snap.reserved[c];
    const lines = snap.lines.map((x) => {
      const l = Object.assign({}, x);
      const a = articles[l.article_code] || {}, s = stores[l.store_code] || {};
      l.description = a.description || ''; l.group_name = (a.group_name || '').trim();
      l.image_path = a.image_path; l.image_ver = a.image_ver;
      l.store_name = s.store_name || ''; l.city = s.city || ''; l.email = s.email || '';
      l.approved = l.approved_open + l.dispatched;
      l.open_qty = Math.max(0, l.req_qty - l.approved - l.offered);
      l.status = statusOf(l);
      l.balance = (l.rejected || l.balance_closed) ? 0 : l.open_qty;
      if (l.balance > 0) { const p = P(l.article_code); p.pending += l.balance; p.n_lines++; p._st.add(l.store_code); }
      return l;
    });
    for (const c in pos) { const p = pos[c]; p.free = p.dc - p.reserved; p.n_stores = p._st.size; delete p._st; }
    const byId = {};
    for (const l of lines) byId[l.id] = l;
    return { articles, stores, groups, pos, lines, byId, meta: snap.meta || {}, imports: snap.imports || [],
             oldestOffer: snap.oldest_offer, rev: snap.rev };
  }

  function alternates(M, code) {
    const a = M.articles[code];
    const g = a && (a.group_name || '').trim();
    if (!g) return [];
    return (M.groups[g] || []).filter((c) => c !== code).map((c) => M.articles[c]);
  }
  const freeOf = (M, code) => (M.pos[code] ? M.pos[code].free : 0);

  /* How to share the free stock of an article among the lines still waiting for it. */
  function suggestSplit(M, article, method) {
    const waiting = M.lines.filter((l) => l.article_code === article && l.balance > 0);
    let free = Math.max(0, freeOf(M, article));
    const need = waiting.reduce((t, l) => t + l.balance, 0);
    const out = {};
    if (need <= free) { waiting.forEach((l) => { out[l.id] = l.balance; }); return out; }
    if (method === 'fifo') {
      for (const l of waiting) { const g = Math.min(l.balance, free); out[l.id] = g; free -= g; }
      return out;
    }
    const shares = waiting.map((l) => [l, l.balance * free / need]);
    shares.forEach(([l, s]) => { out[l.id] = Math.floor(s); });
    let left = free - Object.values(out).reduce((t, v) => t + v, 0);
    shares.slice().sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1]))).forEach(([l]) => {
      if (left > 0 && out[l.id] < l.balance) { out[l.id]++; left--; }
    });
    return out;
  }

  /* ---------------- formatting ---------------- */
  function inr(n) {                                  // Indian digit grouping: 1,25,000
    n = Math.round(Number(n) || 0);
    let s = String(Math.abs(n));
    if (s.length > 3) {
      let head = s.slice(0, -3); const tail = s.slice(-3), parts = [];
      while (head.length > 2) { parts.unshift(head.slice(-2)); head = head.slice(0, -2); }
      if (head) parts.unshift(head);
      s = parts.join(',') + ',' + tail;
    }
    return (n < 0 ? '-' : '') + s;
  }
  const rupees = (n) => 'Rs ' + inr(n);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  function when(ts) {                                // '2026-10-09' -> '09 Oct', a timestamp -> '09 Oct 16:10'
    if (!ts) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts.slice(8) + ' ' + MON[+ts.slice(5, 7) - 1];
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return String(ts);
    return p2(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function whenLong(d) {                             // '10 Oct 2026, 04:00 PM'
    let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return p2(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + p2(h) + ':' + p2(d.getMinutes()) + ' ' + ap;
  }

  /* ---------------- reading SAP downloads ----------------
     Column headings are matched by name, not position. Add a heading to ALIASES if a
     report uses a name that is not listed yet. */
  const norm = (t) => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIASES = {
    order_no: ['order no', 'order number', 'order', 'sales order', 'sales document', 'so no', 'so number',
               'document', 'document number', 'booking no', 'order id'],
    line_no: ['item', 'line', 'line no', 'line item', 'item no', 'sales document item', 'line number', 'item number', 'sr no'],
    order_date: ['order date', 'date', 'document date', 'created on', 'booking date'],
    store_code: ['store', 'store code', 'site', 'site code', 'plant', 'receiving site', 'ship to', 'sold to party'],
    customer: ['customer', 'customer name', 'corporate', 'corporate name', 'party name'],
    article_code: ['article', 'article code', 'article no', 'article number', 'material', 'material number', 'sku'],
    description: ['description', 'article description', 'material description', 'article name', 'article desc'],
    mc_name: ['mc', 'mc name', 'nc name', 'mc description', 'merchandise category', 'mc desc', 'material group'],
    group_name: ['group', 'group name', 'alternate group', 'group article', 'alt group'],
    mrp: ['mrp'],
    req_price: ['price', 'required price', 'requested price', 'price required', 'rate', 'net price', 'order price',
                'selling price', 'price wanted', 'offer price'],
    req_qty: ['qty', 'quantity', 'order qty', 'order quantity', 'required qty', 'required quantity', 'req qty', 'qty required'],
    store_name: ['store name', 'site name', 'name', 'plant name'],
    city: ['city', 'town', 'location'],
    email: ['email', 'e-mail', 'email id', 'mail id', 'store email'],
    site_code: ['site', 'site code', 'plant', 'store', 'store code', 'location code', 'dc'],
    site_type: ['site type', 'type', 'site category'],
    stock_qty: ['stock', 'stock qty', 'qty', 'quantity', 'unrestricted', 'unrestricted stock', 'unrestricted use',
                'soh', 'closing stock', 'available stock', 'stock quantity']
  };
  const SPECS = {
    articles: { required: ['article_code'], optional: ['description', 'mc_name', 'group_name', 'mrp'] },
    stores: { required: ['store_code'], optional: ['store_name', 'city', 'email'] },
    stock: { required: ['article_code', 'site_code', 'stock_qty'], optional: ['site_type'] },
    orders: { required: ['order_no', 'store_code', 'article_code', 'req_qty'],
              optional: ['line_no', 'order_date', 'customer', 'description', 'mc_name', 'mrp', 'req_price'] }
  };

  function code(v) {                                 // text, no '.0', no leading zeros on pure numbers
    if (v == null) return '';
    if (typeof v === 'number') v = Number.isInteger(v) ? String(v) : String(v);
    let s = String(v).trim();
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
    if (/^\d+$/.test(s)) s = s.replace(/^0+/, '') || '0';
    return s;
  }
  function num(v, dflt) {
    if (v == null || v === '') return dflt === undefined ? 0 : dflt;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? (dflt === undefined ? 0 : dflt) : n;
  }
  function dateStr(v) {                              // anything SAP / Excel gives -> 'YYYY-MM-DD'
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 90000) {          // Excel serial day number
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
    }
    if (v instanceof Date) return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
    m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);        // dd.mm.yyyy (SAP), dd/mm/yyyy
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + p2(m[2]) + '-' + p2(m[1]);
    m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{2,4})/);  // 05-Oct-2026
    if (m) {
      const i = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
      if (i >= 0) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + p2(i + 1) + '-' + p2(m[1]);
    }
    return s;
  }

  /* rows2d: the sheet as an array of rows. Finds the heading row (SAP often puts title lines
     above it) and returns objects using our own field names. Throws a readable message if a
     needed column is missing. */
  function readTable(rows2d, kind) {
    const spec = SPECS[kind], fields = spec.required.concat(spec.optional), lookup = {};
    for (const f of fields) for (const a of ALIASES[f]) if (!(norm(a) in lookup)) lookup[norm(a)] = f;
    let best = -1, bestMap = {};
    rows2d.slice(0, 25).forEach((row, i) => {
      const m = {};
      (row || []).forEach((cell, j) => { const f = lookup[norm(cell)]; if (f && !(f in m)) m[f] = j; });
      if (Object.keys(m).length > Object.keys(bestMap).length) { best = i; bestMap = m; }
    });
    const missing = spec.required.filter((f) => !(f in bestMap));
    if (best < 0 || missing.length) {
      const seen = ((rows2d[best < 0 ? 0 : best]) || []).filter((c) => c != null && c !== '').join(', ');
      const nice = missing.map((f) => ALIASES[f][0].replace(/\b\w/g, (c) => c.toUpperCase())).join(', ') || 'any known heading';
      throw new Error('Could not find the column(s): ' + nice + '.\nHeadings found in the file: ' + (seen || '(none)'));
    }
    const out = [];
    for (const row of rows2d.slice(best + 1)) {
      if (!row || !row.some((c) => c != null && c !== '')) continue;
      const o = {};
      for (const f in bestMap) o[f] = row[bestMap[f]] == null ? null : row[bestMap[f]];
      out.push(o);
    }
    return out;
  }

  const txt = (v) => (v == null ? '' : String(v).trim());
  /* Shape rows for the database functions. */
  const shape = {
    articles: (rows) => rows.map((r) => ({
      article_code: code(r.article_code), description: txt(r.description), mc_name: txt(r.mc_name),
      group_name: txt(r.group_name), mrp: r.mrp == null || r.mrp === '' ? null : num(r.mrp) })).filter((r) => r.article_code),
    stores: (rows) => rows.map((r) => ({
      store_code: code(r.store_code), store_name: txt(r.store_name), city: txt(r.city), email: txt(r.email) })).filter((r) => r.store_code),
    orders: (rows) => rows.map((r) => ({
      order_no: code(r.order_no), line_no: code(r.line_no), order_date: dateStr(r.order_date),
      store_code: code(r.store_code), customer: txt(r.customer), article_code: code(r.article_code),
      description: txt(r.description), mc_name: txt(r.mc_name),
      mrp: r.mrp == null || r.mrp === '' ? null : num(r.mrp), req_price: num(r.req_price),
      req_qty: Math.round(num(r.req_qty)) })).filter((r) => r.order_no && r.article_code),
    /* Stock: add up by article + site. dcSites says which sites are DCs; every other site is a
       store. DC rows are kept for every article, store rows only for articles we track (this
       keeps a report covering hundreds of stores small). */
    stock: (rows, knownArticles, dcSites) => {
      const agg = new Map();
      for (const r of rows) {
        const a = code(r.article_code), s = code(r.site_code);
        if (!a || !s) continue;
        const isDc = dcSites.has(s);
        if (!isDc && !knownArticles.has(a)) continue;
        const k = a + '\u0001' + s, q = Math.round(num(r.stock_qty));
        const cur = agg.get(k);
        if (cur) cur.q += q; else agg.set(k, { a, s, t: isDc ? 'DC' : 'STORE', q });
      }
      return Array.from(agg.values()).filter((r) => r.q !== 0);
    }
  };
  /* Which sites does a stock report contain, and which of them look like DCs? */
  function stockSites(rows, knownStores) {
    const all = new Set(), typedStore = new Set(), typedDc = new Set();
    for (const r of rows) {
      const s = code(r.site_code); if (!s) continue;
      all.add(s);
      const t = txt(r.site_type).toUpperCase();
      if (t.startsWith('ST')) typedStore.add(s); else if (t) typedDc.add(s);
    }
    const candidates = Array.from(all).filter((s) => typedDc.has(s) || (!typedStore.has(s) && !knownStores.has(s))).sort();
    return { all: Array.from(all).sort(), candidates };
  }

  /* ---------------- the message to the store ---------------- */
  function offerSubject(line, replyBy) {
    return 'Corporate order ' + line.order_no + ' - alternate available for ' + (line.description || line.article_code) +
           ' - confirm by ' + whenLong(replyBy);
  }
  function offerText(line, offers, replyBy, note) {
    const short = line.req_qty - line.approved;
    const rows = offers.map(([a, q]) => '  - ' + inr(q) + ' pcs of ' + a.article_code + ' ' + (a.description || '') + ' (MRP ' + rupees(a.mrp) + ')').join('\n');
    return 'Dear ' + (line.store_name || line.store_code) + ' team,\n\n' +
      'This is about corporate order ' + line.order_no + (line.customer ? ' for ' + line.customer : '') + '.\n\n' +
      'You ordered ' + inr(line.req_qty) + ' pcs of ' + line.article_code + ' (' + (line.description || '') + ') at ' + rupees(line.req_price) + '. ' +
      'We have approved ' + inr(line.approved) + ' pcs of this article; ' + inr(short) + ' pcs cannot be supplied in it. ' +
      'These alternate(s) at the same price point are held for you until ' + whenLong(replyBy) + ':\n\n' + rows + '\n\n' +
      (note ? note + '\n\n' : '') +
      'Please reply with your confirmation (article and quantity) before that time. If we do not hear from you, the held stock will be released to other orders.\n\n' +
      'Regards,\nHousehold Category Team';
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function offerHtml(line, offers, replyBy, note, hasImage) {
    const td = 'padding:8px 10px;border:1px solid #d9dde3;font-size:13px;vertical-align:middle';
    const th = 'padding:8px 10px;border:1px solid #d9dde3;background:#1f2a44;color:#fff;font-size:12px;text-align:left';
    const rows = offers.map(([a, q]) => '<tr><td style="' + td + '">' +
      (hasImage(a) ? '<img src="cid:alt' + esc(a.article_code) + '" width="110" style="border-radius:6px">' : '') + '</td>' +
      '<td style="' + td + '"><b>' + esc(a.article_code) + '</b><br>' + esc(a.description) + '</td>' +
      '<td style="' + td + '" align="right">' + rupees(a.mrp) + '</td>' +
      '<td style="' + td + '" align="right"><b>' + inr(q) + '</b></td></tr>').join('');
    return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1b2333">' +
      '<p>Dear ' + esc(line.store_name || line.store_code) + ' team,</p>' +
      '<p>This is about corporate order <b>' + esc(line.order_no) + '</b>' + (line.customer ? ' for <b>' + esc(line.customer) + '</b>' : '') + '.</p>' +
      '<p>You ordered <b>' + inr(line.req_qty) + ' pcs</b> of ' + esc(line.article_code) + ' (' + esc(line.description) + ') at ' + rupees(line.req_price) + '. ' +
      'We have approved <b>' + inr(line.approved) + ' pcs</b> of this article; <b>' + inr(line.req_qty - line.approved) + ' pcs</b> cannot be supplied in it. ' +
      'The following alternate(s) at the same price point are available and are <b>held for you until ' + whenLong(replyBy) + '</b>:</p>' +
      '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><th style="' + th + '">Image</th><th style="' + th + '">Alternate article</th>' +
      '<th style="' + th + '">MRP</th><th style="' + th + '">Qty we can allocate</th></tr>' + rows + '</table>' +
      (note ? '<p>' + esc(note) + '</p>' : '') +
      '<p><b>Please reply to this email with your confirmation</b> (article and quantity) before the time above. ' +
      'If we do not hear from you, the held stock will be released to other orders.</p>' +
      '<p>Regards,<br>Household Category Team</p></div>';
  }
  /* An .eml file marked as unsent: Outlook opens it as an editable draft, pictures included. */
  function b64utf8(s) {
    const bytes = new TextEncoder().encode(s); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const wrap76 = (s) => s.replace(/(.{76})/g, '$1\r\n');
  function buildEml(m) {                             // m: {to, cc, subject, html, images:[{cid, name, type, base64}]}
    const b = 'allocdesk-' + Math.random().toString(36).slice(2), L = [];
    if (m.to) L.push('To: ' + m.to);
    if (m.cc) L.push('Cc: ' + m.cc);
    L.push('Subject: =?UTF-8?B?' + b64utf8(m.subject) + '?=', 'X-Unsent: 1', 'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="' + b + '"', '',
      '--' + b, 'Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', wrap76(b64utf8(m.html)));
    for (const im of m.images || []) {
      L.push('--' + b, 'Content-Type: ' + im.type + '; name="' + im.name + '"', 'Content-Transfer-Encoding: base64',
        'Content-ID: <' + im.cid + '>', 'Content-Disposition: inline; filename="' + im.name + '"', '', wrap76(im.base64));
    }
    L.push('--' + b + '--', '');
    return L.join('\r\n');
  }

  root.Core = { STATUS_LABEL, STATUS_ORDER, statusOf, build, alternates, freeOf, suggestSplit, inr, rupees, when, whenLong,
    norm, ALIASES, SPECS, code, num, dateStr, readTable, shape, stockSites, offerSubject, offerText, offerHtml, buildEml, esc, b64utf8 };
})(typeof window !== 'undefined' ? window : globalThis);
