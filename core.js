/* Allocation Desk - the parts that do not touch the screen or the network:
   status rules, pack rounding, discount and margin, stock position, splitting, reading
   report columns, composing store messages.
   The database enforces the allocation rules again on every change (see supabase-setup.sql). */
(function (root) {
  'use strict';

  const STATUS_LABEL = {
    PENDING: 'Pending', AWAITING: 'Awaiting store', PARTIAL: 'Partly approved',
    APPROVED: 'Approved', DISPATCHED: 'Dispatched', REJECTED: 'Rejected',
    OFFERED: 'Offered', CANCELLED: 'Cancelled'
  };
  const STATUS_ORDER = ['PENDING', 'AWAITING', 'PARTIAL', 'APPROVED', 'DISPATCHED', 'REJECTED'];
  const REJECT_REASONS = ['Not available', 'Stock given in alternate article', 'Reorder in new article', 'Inactive article',
    'Wrong order', 'Wrong price', 'Duplicate order', 'Order cancelled', 'Store requirement', 'Other'];
  /* DC stock locations, in the order they are shown. key = field in the stock data. */
  const LOCATIONS = [['v', 'V01 & V02'], ['nso', 'NSO (0023)'], ['hh', 'HH reserved (0043)'], ['spl', 'Special buy (0041)'], ['best', 'Best seller (0042)'], ['sea', 'Sea stock']];

  function statusOf(l) {
    if (l.rejected) return 'REJECTED';
    if (l.offered > 0) return 'AWAITING';
    const total = l.approved_open + l.dispatched;
    if (total === 0) return 'PENDING';
    const done = total >= l.req_qty || l.balance_closed;
    if (l.approved_open === 0 && done) return 'DISPATCHED';
    return done ? 'APPROVED' : 'PARTIAL';
  }

  /* ---------------- pack size, discount, margin ---------------- */
  const packOf = (a) => Math.max(1, Math.round(Number(a && a.pack_size) || 1));
  const roundPack = (qty, pack) => Math.ceil(Math.max(0, qty) / pack) * pack;         // always up to a full pack
  const floorPack = (qty, pack) => Math.floor(Math.max(0, qty) / pack) * pack;
  /* Margin on the price net of GST:  (price/(1+GST) - cost) / (price/(1+GST)) */
  function marginAt(price, gst, cost) {
    price = Number(price); gst = Number(gst); cost = Number(cost);
    if (!price || !cost || isNaN(gst)) return null;
    const net = price / (1 + gst);
    return (net - cost) / net;
  }
  const discountOf = (price, mrp) => (Number(mrp) > 0 && Number(price) > 0 ? 1 - Number(price) / Number(mrp) : null);
  const pct = (x, d) => (x == null || isNaN(x) ? '-' : (x * 100).toFixed(d == null ? 1 : d) + '%');

  function addDays(ymd, n) {                         // 'YYYY-MM-DD' + n days
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  function today() { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dayDiff(a, b) {                           // whole days from a to b
    const f = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
    return Math.round((f(b) - f(a)) / 86400000);
  }

  /* Turn the server's snapshot into what the screens use. */
  function build(snap) {
    const articles = {}, stores = {}, same = {}, diff = {}, pos = {}, now = today();
    for (const a of snap.articles) {
      articles[a.article_code] = a;
      const gs = (a.group_same || '').trim(), gd = (a.group_diff || '').trim();
      if (gs) (same[gs] = same[gs] || []).push(a.article_code);
      if (gd) (diff[gd] = diff[gd] || []).push(a.article_code);
    }
    for (const s of snap.stores) stores[s.store_code] = s;
    const P = (c) => pos[c] || (pos[c] = { dc: 0, loc: { v: 0, nso: 0, hh: 0, spl: 0, best: 0, sea: 0 }, reserved: 0, free: 0, pending: 0, n_lines: 0, n_stores: 0, _st: new Set() });
    for (const c in articles) P(c);
    for (const c in snap.stock) {
      const p = P(c), s = snap.stock[c];
      p.dc = s[0]; p.loc = { v: s[1], nso: s[2], hh: s[3], spl: s[4], best: s[5], sea: s[6] };
    }
    for (const c in snap.reserved) P(c).reserved = snap.reserved[c];
    const lines = snap.lines.map((x) => {
      const l = Object.assign({}, x);
      const a = articles[l.article_code] || {}, s = stores[l.store_code] || {};
      l.description = a.description || ''; l.category = a.category || ''; l.buyer = a.buyer || ''; l.mc_code = a.mc_code || '';
      l.in_master = !!a.in_master; l.art_status = a.status || '';
      l.image_path = a.image_path; l.image_ver = a.image_ver;
      l.pack = Math.max(1, Math.round(Number(a.pack_size) || Number(l.pack_size) || 1));
      l.store_name = s.store_name || ''; l.city = s.city || ''; l.state = s.state || ''; l.email = s.email || '';
      l.dc = s.dc || ''; l.lead_time = s.lead_time == null ? null : Number(s.lead_time);
      l.mrp = Number(l.mrp) || Number(a.mrp) || 0; l.req_price = Number(l.req_price) || 0;
      l.approved = l.approved_open + l.dispatched;
      l.open_qty = Math.max(0, l.req_qty - l.approved - l.offered);
      l.status = statusOf(l);
      l.balance = (l.rejected || l.balance_closed) ? 0 : l.open_qty;
      l.discount = discountOf(l.req_price, l.mrp);
      l.margin = marginAt(l.req_price, a.gst, a.cost);
      l.base_margin = marginAt(Number(a.vrp) || l.mrp, a.gst, a.cost);
      l.value = l.approved * l.req_price; l.ask_value = l.req_qty * l.req_price;
      /* delivery: the stock must be allocated at least "lead time" days before the date the store wants it */
      l.allocate_by = l.del_date && l.lead_time != null ? addDays(l.del_date, -l.lead_time) : null;
      l.days_left = l.allocate_by ? dayDiff(now, l.allocate_by) : null;
      l.late = l.balance > 0 && l.days_left != null && l.days_left < 0;
      l.tight = l.balance > 0 && l.days_left != null && l.days_left >= 0 && l.days_left <= 1;
      if (l.balance > 0) { const p = P(l.article_code); p.pending += l.balance; p.n_lines++; p._st.add(l.store_code); }
      return l;
    });
    for (const c in pos) { const p = pos[c]; p.free = p.dc - p.reserved; p.n_stores = p._st.size; delete p._st; }
    const byId = {};
    for (const l of lines) byId[l.id] = l;
    return { articles, stores, same, diff, pos, lines, byId, meta: snap.meta || {}, imports: snap.imports || [],
             oldestOffer: snap.oldest_offer, rev: snap.rev, counts: snap.counts || {}, schema: snap.schema || 1 };
  }

  /* Two kinds of alternate: the same design (other colour or vendor), and a different
     design at the same price point. */
  function alternates(M, code) {
    const a = M.articles[code];
    if (!a) return { same: [], diff: [] };
    const gs = (a.group_same || '').trim(), gd = (a.group_diff || '').trim();
    const sameCodes = gs ? (M.same[gs] || []).filter((c) => c !== code) : [];
    const skip = new Set(sameCodes.concat([code]));
    const diffCodes = gd ? (M.diff[gd] || []).filter((c) => !skip.has(c)) : [];
    return { same: sameCodes.map((c) => M.articles[c]), diff: diffCodes.map((c) => M.articles[c]) };
  }
  const allAlternates = (M, code) => { const x = alternates(M, code); return x.same.concat(x.diff); };
  const freeOf = (M, code) => (M.pos[code] ? M.pos[code].free : 0);

  /* How to share the free stock of an article among the lines still waiting for it,
     in full packs. Returns {line id: quantity}. */
  function suggestSplit(M, article, method) {
    const waiting = M.lines.filter((l) => l.article_code === article && l.balance > 0);
    const pack = packOf(M.articles[article]);
    let freePacks = Math.floor(Math.max(0, freeOf(M, article)) / pack);
    const need = waiting.map((l) => Math.ceil(l.balance / pack));
    const total = need.reduce((t, n) => t + n, 0), out = {};
    if (total <= freePacks) { waiting.forEach((l, i) => { out[l.id] = need[i] * pack; }); return out; }
    if (method === 'fifo') {
      waiting.forEach((l, i) => { const g = Math.min(need[i], freePacks); out[l.id] = g * pack; freePacks -= g; });
      return out;
    }
    const shares = need.map((n) => n * freePacks / total), give = shares.map((s) => Math.floor(s));
    let left = freePacks - give.reduce((t, n) => t + n, 0);
    shares.map((s, i) => [s - Math.floor(s), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
      if (left > 0 && give[i] < need[i]) { give[i]++; left--; }
    });
    waiting.forEach((l, i) => { out[l.id] = give[i] * pack; });
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
  function p2(n) { return String(n).padStart(2, '0'); }
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

  /* ---------------- reading report columns ----------------
     Column headings are matched by name, not position. For each field the first heading in
     its list that exists in the file is used, so "New MRP" wins over "Old MRP". Add a heading
     here if a report uses a name that is not listed yet. */
  const norm = (t) => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIASES = {
    // orders
    order_no: ['order id', 'order no', 'order number', 'sales order', 'sales document', 'so no', 'so number', 'document number', 'booking no', 'order', 'document'],
    line_no: ['item', 'line item', 'line no', 'item no', 'sales document item', 'line number', 'item number', 'line'],
    order_date: ['booking date', 'book date', 'order date', 'document date', 'created on', 'date'],
    del_date: ['del date', 'delivery date', 'req delivery date', 'requested delivery date', 'reqd delivery date', 'required delivery date'],
    customer: ['customer', 'customer name', 'corporate', 'corporate name', 'party name'],
    phone: ['ph no.', 'ph no', 'phone', 'phone no', 'mobile', 'mobile no', 'contact no', 'contact number'],
    poc_name: ['booked by', 'poc name', 'contact person', 'contact name', 'store poc'],
    req_price: ['price wanted', 'required price', 'requested price', 'price required', 'offer price', 'order price', 'net price', 'selling price', 'rate', 'price'],
    req_qty: ['quantity wanted', 'qty wanted', 'order qty', 'order quantity', 'required qty', 'required quantity', 'req qty', 'qty required', 'quantity', 'qty'],
    // articles
    article_code: ['material', 'art code', 'article code', 'article', 'article no', 'article number', 'material number', 'sku'],
    description: ['desc', 'description', 'short text', 'article description', 'material description', 'article desc', 'article name'],
    mc_code: ['mc code', 'merchandise category', 'mdse cat.', 'mdse cat', 'merchandise category code'],
    mc_name: ['mc name', 'mc desc', 'mc description', 'mc', 'nc name', 'merchandise category name', 'merchandise category desc'],
    category: ['category', 'cat'],
    buyer: ['buyer', 'buy'],
    mrp: ['new mrp', 'mrp', 'old mrp'],
    vrp: ['new vrp', 'vrp', 'old vrp'],
    cost: ['new cost', 'cost', 'article cost as per sap', 'cost including bogo'],
    gst: ['gst%', 'gst', 'gst rate', 'gst %'],
    pack_size: ['packsize', 'pack size', 'pk size', 'pak size', 'pack'],
    vendor_code: ['vendor code'],
    vendor_name: ['vendor name', 'vendor'],
    group_same: ['same model alternatives', 'same model alternative', 'same model', 'same design alternatives', 'same design'],
    group_diff: ['different model alternatives', 'different model alternative', 'different model', 'different design alternatives', 'different design'],
    status: ['article status as per system', 'article status for po', 'activity', 'article status'],
    bogo_count: ['count bogo'],
    ppo_cm: ['cm ppo qty', 'pending po qty', 'pending po'],
    ppo_nm: ['nm ppo qty'],
    store_stock: ['store stock'],
    intransit: ['lntransit stock', 'intransit stock', 'in transit stock'],
    // stores
    store_code: ['store code', 'st cd', 'site code', 'site', 'store', 'plant', 'receiving site'],
    store_name: ['store name', 'st-nm', 'site name', 'plant name', 'name'],
    city: ['city', 'town'],
    state: ['state'],
    email: ['storeemails', 'store emails', 'store email', 'email', 'e-mail', 'email id', 'mail id'],
    lead_time: ['lead time (allocation to store delivery)', 'lead time', 'transit time', 'intransit time', 'in transit time'],
    dc: ['dc/rdc', 'rdc', 'dc'],
    // DC stock
    site_code: ['dc', 'dc code', 'site', 'site code', 'plant', 'location code'],
    total: ['total msa -qty', 'total msa qty', 'total msa stock qty', 'total dc qty', 'msa stock (dc)', 'total qty', 'unrestricted stock', 'unrestricted', 'stock qty', 'stock'],
    v0102: ['v01 & v02 -qty', 'v01 & v02 qty', 'v01 v02 qty'],
    v01: ['v01 -qty', 'v01 qty', 'v01'],
    v02: ['v02 -qty', 'v02 qty', 'v02'],
    nso: ['nso (0023) -qty', 'nso qty', 'nso (0023) qty', '0023 qty', '0023'],
    hh: ['hh reserved (0043) -qty', 'hh reserve qty', 'hh reserved qty', '0043 qty', '0043'],
    spl: ['special buy (0041) -qty', 'special buy qty', '0041 qty', '0041'],
    best: ['best seller (0042) -qty', 'bestseller qty', 'best seller qty', '0042 qty', '0042'],
    sea: ['sea stk -qty', 'sea stk qty', 'sea stock qty']
  };
  const SPECS = {
    master: { required: ['article_code'], optional: ['description', 'mc_code', 'mc_name', 'category', 'buyer', 'mrp', 'vrp', 'cost', 'gst', 'pack_size', 'vendor_code', 'vendor_name', 'group_same', 'group_diff', 'status'] },
    data: { required: ['article_code', 'mrp'], optional: ['description', 'mc_code', 'mc_name', 'category', 'buyer', 'vrp', 'cost', 'gst', 'pack_size', 'vendor_code', 'vendor_name', 'status', 'bogo_count', 'ppo_cm', 'ppo_nm', 'store_stock', 'intransit'] },
    stores: { required: ['store_code'], optional: ['store_name', 'city', 'state', 'email', 'lead_time', 'dc'], need: ['store_name', 'email', 'lead_time'] },
    stock: { required: ['article_code', 'total'], optional: ['site_code', 'v0102', 'v01', 'v02', 'nso', 'hh', 'spl', 'best', 'sea'] },
    orders: { required: ['order_no', 'store_code', 'article_code', 'req_qty'], optional: ['line_no', 'order_date', 'del_date', 'customer', 'phone', 'poc_name', 'description', 'mc_name', 'mrp', 'req_price', 'pack_size', 'store_name'] }
  };
  const NICE = { article_code: 'Article', total: 'Total MSA qty', req_qty: 'Qty wanted', order_no: 'Order ID', store_code: 'Store Code', mrp: 'MRP' };

  function code(v) {                                 // text, no '.0', no leading zeros on pure numbers
    if (v == null) return '';
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
  const numOrNull = (v) => { const n = num(v, null); return n == null ? null : n; };
  function dateStr(v) {                              // anything SAP / Excel gives -> 'YYYY-MM-DD'
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 120000) {         // Excel serial day number
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
    }
    if (v instanceof Date) return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    const s = String(v).trim();
    if (/^\d{5}(\.\d+)?$/.test(s)) return dateStr(parseFloat(s));
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

  /* Look at the first rows of a sheet: which row is the heading row for this kind of file,
     and how many of the fields does it have?  Returns {row, map, score, missing}. */
  function findHeader(rows2d, kind) {
    const spec = SPECS[kind], fields = spec.required.concat(spec.optional);
    let best = { row: -1, map: {}, score: 0, missing: spec.required.slice() };
    rows2d.slice(0, 30).forEach((row, i) => {
      const at = {};
      (row || []).forEach((cell, j) => { const k = norm(cell); if (k && !(k in at)) at[k] = j; });
      const m = {};
      for (const f of fields) for (const a of ALIASES[f]) { const j = at[norm(a)]; if (j !== undefined) { m[f] = j; break; } }
      const missing = spec.required.filter((f) => !(f in m));
      const score = Object.keys(m).length - missing.length * 100 - (spec.need && !spec.need.some((f) => f in m) ? 100 : 0);
      if (score > best.score || best.row < 0) best = { row: i, map: m, score, missing };
    });
    return best;
  }
  /* rows2d: the sheet as an array of rows. Returns objects using our own field names, or
     throws a readable message naming the column that could not be found. */
  function readTable(rows2d, kind, header) {
    const h = header || findHeader(rows2d, kind), spec = SPECS[kind];
    const needMissing = spec.need && !spec.need.some((f) => f in h.map);
    if (h.row < 0 || h.missing.length || needMissing) {
      const seen = ((rows2d[Math.max(0, h.row)]) || []).filter((c) => c != null && c !== '').map((c) => String(c).replace(/\s+/g, ' ')).slice(0, 40).join(', ');
      const nice = h.missing.map((f) => NICE[f] || ALIASES[f][0]).join(', ') || (needMissing ? spec.need.map((f) => ALIASES[f][0]).join(' or ') : 'any known heading');
      throw new Error('Could not find the column(s): ' + nice + '.\nHeadings found in the file: ' + (seen || '(none)'));
    }
    const out = [];
    for (const row of rows2d.slice(h.row + 1)) {
      if (!row || !row.some((c) => c != null && c !== '')) continue;
      const o = {};
      for (const f in h.map) o[f] = row[h.map[f]] == null ? null : row[h.map[f]];
      out.push(o);
    }
    out.fields = Object.keys(h.map);
    return out;
  }

  const txt = (v) => (v == null ? '' : String(v).replace(/ /g, ' ').trim());
  const int = (v) => { const n = numOrNull(v); return n == null ? null : Math.round(n); };
  function gstOf(v) { const n = numOrNull(v); return n == null ? null : (n > 1 ? n / 100 : n); }
  function statusText(v) {
    const s = norm(v);
    if (!s) return '';
    if (s.startsWith('inactive')) return 'In-Active';
    if (s.startsWith('active')) return 'Active';
    return '';
  }
  /* Shape rows for the database functions. */
  const shape = {
    /* kind 'master' = the Diwali article master; 'data' = the full article data sheet */
    articles: (rows, kind) => rows.map((r) => {
      const bogo = kind === 'data' ? (numOrNull(r.bogo_count) || 1) : 1, cost = numOrNull(r.cost);
      const o = {
        article_code: code(r.article_code), description: txt(r.description), mc_code: code(r.mc_code), mc_name: txt(r.mc_name),
        category: txt(r.category), buyer: txt(r.buyer), mrp: numOrNull(r.mrp), vrp: numOrNull(r.vrp),
        cost: cost == null ? null : Math.round(cost * bogo * 100) / 100, gst: gstOf(r.gst), pack_size: int(r.pack_size),
        vendor_code: code(r.vendor_code), vendor_name: txt(r.vendor_name), status: statusText(r.status)
      };
      if (kind === 'master') { o.group_same = txt(r.group_same); o.group_diff = txt(r.group_diff); }
      else { o.ppo_cm = int(r.ppo_cm); o.ppo_nm = int(r.ppo_nm); o.store_stock = int(r.store_stock); o.intransit = int(r.intransit); }
      return o;
    }).filter((r) => /^\d{6,}$/.test(r.article_code) || (r.article_code && kind === 'master')),
    stores: (rows) => rows.map((r) => ({
      store_code: code(r.store_code).toUpperCase(), store_name: txt(r.store_name), city: txt(r.city), state: txt(r.state),
      email: txt(r.email), lead_time: int(r.lead_time), dc: txt(r.dc) })).filter((r) => r.store_code && r.store_code.length <= 12),
    /* Orders. A line is order ID + line item, or order ID + article when the report has no
       line item. Repeats of the same line inside one file are dropped and reported. */
    orders: (rows) => {
      const seen = new Set(), out = [], repeats = [];
      for (const r of rows) {
        const o = {
          order_no: code(r.order_no), line_no: code(r.line_no), order_date: dateStr(r.order_date), del_date: dateStr(r.del_date),
          store_code: code(r.store_code).toUpperCase(), store_name: txt(r.store_name), customer: txt(r.customer),
          phone: code(r.phone), poc_name: txt(r.poc_name), article_code: code(r.article_code), description: txt(r.description),
          mc_name: txt(r.mc_name), mrp: numOrNull(r.mrp), req_price: numOrNull(r.req_price), pack_size: int(r.pack_size),
          req_qty: Math.round(num(r.req_qty))
        };
        if (!o.order_no || !o.article_code || !/\d/.test(o.article_code)) continue;
        const key = o.order_no + '|' + (o.line_no || o.article_code);
        if (seen.has(key)) { repeats.push(`Order ${o.order_no}, article ${o.article_code}: repeated in the file (qty ${o.req_qty}) - only the first was taken`); continue; }
        seen.add(key); out.push(o);
      }
      out.repeats = repeats;
      return out;
    },
    /* DC stock: one row per article per DC with the quantity in each location.
       Totals rows ("Overall Result") and anything without an article number are skipped. */
    stock: (rows) => {
      const agg = new Map();
      for (const r of rows) {
        const a = code(r.article_code);
        if (!/^\d{6,}$/.test(a)) continue;
        const s = code(r.site_code) || 'DC', k = a + '|' + s;
        const q = { a, s, t: Math.round(num(r.total)), v: Math.round(num(r.v0102) + num(r.v01) + num(r.v02)), n: Math.round(num(r.nso)),
          h: Math.round(num(r.hh)), p: Math.round(num(r.spl)), b: Math.round(num(r.best)), e: Math.round(num(r.sea)) };
        const cur = agg.get(k);
        if (cur) for (const f of ['t', 'v', 'n', 'h', 'p', 'b', 'e']) cur[f] += q[f]; else agg.set(k, q);
      }
      return Array.from(agg.values()).filter((r) => r.t !== 0 || r.v || r.n || r.h || r.p || r.b || r.e);
    }
  };

  /* ---------------- messages to the store ---------------- */
  function offerSubject(line, replyBy) {
    return 'Corporate order ' + line.order_no + ' - alternate available for ' + (line.description || line.article_code) +
           ' - confirm by ' + whenLong(replyBy);
  }
  const altRows = (offers) => offers.map(([a, q]) => '  - ' + (q ? inr(q) + ' pcs of ' : '') + a.article_code + ' ' + (a.description || '') + ' (MRP ' + rupees(a.mrp) + ')').join('\n');
  function offerText(line, offers, replyBy, note) {
    const short = Math.max(0, line.req_qty - line.approved);
    return 'Dear ' + (line.store_name || line.store_code) + ' team,\n\n' +
      'This is about corporate order ' + line.order_no + (line.customer ? ' for ' + line.customer : '') + '.\n\n' +
      'You ordered ' + inr(line.req_qty) + ' pcs of ' + line.article_code + ' (' + (line.description || '') + ') at ' + rupees(line.req_price) + '. ' +
      'We have approved ' + inr(line.approved) + ' pcs of this article; ' + inr(short) + ' pcs cannot be supplied in it. ' +
      'These alternate(s) at the same price point are held for you until ' + whenLong(replyBy) + ':\n\n' + altRows(offers) + '\n\n' +
      (note ? note + '\n\n' : '') +
      'Please reply with your confirmation (article and quantity) before that time. If we do not hear from you, the held stock will be released to other orders.\n\n' +
      'Regards,\nHousehold Category Team';
  }
  /* The other route: the line is rejected and the store places a fresh order in an alternate. */
  function reorderSubject(line) { return 'Corporate order ' + line.order_no + ' - ' + (line.description || line.article_code) + ' not available - please reorder in an alternate'; }
  function reorderText(line, alts, note) {
    return 'Dear ' + (line.store_name || line.store_code) + ' team,\n\n' +
      'This is about corporate order ' + line.order_no + (line.customer ? ' for ' + line.customer : '') + '.\n\n' +
      'The ' + inr(line.balance || line.req_qty) + ' pcs you ordered of ' + line.article_code + ' (' + (line.description || '') + ') cannot be supplied, so this line has been rejected. ' +
      (alts.length ? 'Stock is available in the following alternate(s). Please place a fresh order in the article you choose:\n\n' + altRows(alts) + '\n\n'
                   : 'Please check with us for an alternate before placing a fresh order.\n\n') +
      (note ? note + '\n\n' : '') +
      'The stock is not held until the new order is received.\n\nRegards,\nHousehold Category Team';
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function mailHtml(text, offers, hasImage) {        // the same message with a picture table for Outlook
    const td = 'padding:8px 10px;border:1px solid #d9dde3;font-size:13px;vertical-align:middle';
    const th = 'padding:8px 10px;border:1px solid #d9dde3;background:#1f2a44;color:#fff;font-size:12px;text-align:left';
    const table = '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:10px 0"><tr><th style="' + th + '">Image</th><th style="' + th + '">Alternate article</th>' +
      '<th style="' + th + '">MRP</th><th style="' + th + '">Qty</th></tr>' + offers.map(([a, q]) => '<tr><td style="' + td + '">' +
      (hasImage(a) ? '<img src="cid:alt' + esc(a.article_code) + '" width="110" style="border-radius:6px">' : '') + '</td>' +
      '<td style="' + td + '"><b>' + esc(a.article_code) + '</b><br>' + esc(a.description) + '</td>' +
      '<td style="' + td + '" align="right">' + rupees(a.mrp) + '</td><td style="' + td + '" align="right"><b>' + (q ? inr(q) : '') + '</b></td></tr>').join('') + '</table>';
    const list = altRows(offers);
    const parts = list && text.includes(list) ? text.split(list) : [text, ''];
    const para = (t) => t.trim().split(/\n\n+/).filter(Boolean).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
    return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1b2333">' + para(parts[0]) + (offers.length ? table : '') + para(parts[1] || '') + '</div>';
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

  root.Core = { STATUS_LABEL, STATUS_ORDER, REJECT_REASONS, LOCATIONS, statusOf, build, alternates, allAlternates, freeOf, suggestSplit,
    packOf, roundPack, floorPack, marginAt, discountOf, pct, addDays, today, dayDiff, inr, rupees, when, whenLong,
    norm, ALIASES, SPECS, code, num, dateStr, findHeader, readTable, shape, offerSubject, offerText, reorderSubject, reorderText, mailHtml,
    buildEml, esc, b64utf8 };
})(typeof window !== 'undefined' ? window : globalThis);
