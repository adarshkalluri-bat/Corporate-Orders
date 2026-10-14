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
  const REJECT_REASONS = ['Reorder in new article', 'Wrong order', 'Stock given in alternate article', 'Stock out'];
  /* DC stock locations, in the order they are shown. key = field in the stock data. */
  const LOCATIONS = [['v', 'V01 & V02'], ['nso', 'NSO (0023)'], ['hh', 'HH reserved (0043)'], ['spl', 'Special buy (0041)'], ['best', 'Best seller (0042)'], ['sea', 'Sea stock']];
  /* 'oth' = stock the report gives only in its total, with no location against it. */
  const LOC_KEYS = ['v', 'nso', 'hh', 'spl', 'best', 'sea', 'oth'];
  const LOC_NAME = { v: 'V01 & V02', nso: 'NSO (0023)', hh: 'HH reserved (0043)', spl: 'Special buy (0041)', best: 'Best seller (0042)', sea: 'Sea stock', oth: 'No location given' };
  const LOC_SHORT = { v: 'V01&V02', nso: 'NSO', hh: 'HH reserved', spl: 'Special buy', best: 'Best seller', sea: 'Sea', oth: 'No location' };
  const DEFAULT_LOC_ORDER = 'v,best,spl,hh,nso,sea';
  /* {v: 400, best: 104} -> "V01&V02 400 + Best seller 104"; a single location shows without its quantity when bare is set */
  function locText(locs, bare) {
    const parts = LOC_KEYS.filter((k) => locs && Number(locs[k]) > 0);
    if (!parts.length) return '';
    if (bare && parts.length === 1) return LOC_SHORT[parts[0]];
    return parts.map((k) => LOC_SHORT[k] + ' ' + inr(locs[k])).join(' + ');
  }
  /* Take qty from the locations in the standing order (the same rule the database uses).
     avail: {location: pieces that can be taken}. Returns {use: {location: qty}, left: what could not be placed}. */
  function splitByOrder(order, avail, qty) {
    const use = {}; let left = Math.max(0, Math.round(qty) || 0);
    for (const k of order.concat(['oth'])) {
      if (left <= 0) break;
      const q = Math.min(left, Math.max(0, Math.round(Number(avail[k]) || 0)));
      if (q > 0) { use[k] = q; left -= q; }
    }
    return { use, left };
  }
  const autoSplit = (M, code, qty) => splitByOrder(M.locOrder, (M.pos[code] || {}).locFree || {}, qty);

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
    /* For each article:  stock = the quantity in the stock report,  inward = received since that report,
       dc = stock + inward (the total DC quantity),  reserved = allocated to orders,  free = dc - reserved.
       The same by location: loc (report), locIn (inwards), locRes (allocated), locFree (balance). */
    const P = (c) => pos[c] || (pos[c] = { dc: 0, stock: 0, inward: 0, loc: { v: 0, nso: 0, hh: 0, spl: 0, best: 0, sea: 0, oth: 0 }, locIn: {}, locRes: {}, locFree: {},
      reserved: 0, free: 0, pending: 0, n_lines: 0, n_stores: 0, _st: new Set() });
    for (const c in articles) P(c);
    for (const c in snap.stock) {
      const p = P(c), s = snap.stock[c];
      p.stock = s[0]; p.loc = { v: s[1], nso: s[2], hh: s[3], spl: s[4], best: s[5], sea: s[6], oth: s[0] - s[1] - s[2] - s[3] - s[4] - s[5] - s[6] };
    }
    const inw = snap.inward || {}, lres = snap.loc_reserved || {};
    for (const c in inw) { const p = P(c); p.locIn = inw[c]; p.inward = LOC_KEYS.reduce((t, k) => t + (Number(inw[c][k]) || 0), 0); }
    for (const c in lres) P(c).locRes = lres[c];
    for (const c in snap.reserved) P(c).reserved = snap.reserved[c];
    const lines = snap.lines.map((x) => {
      const l = Object.assign({}, x);
      const a = articles[l.article_code] || {}, s = stores[l.store_code] || {};
      l.description = a.description || ''; l.category = a.category || ''; l.buyer = a.buyer || ''; l.mc_code = a.mc_code || '';
      /* A line can hand part of its quantity to alternate lines split from it: what is wanted here is the SAP quantity minus that. */
      l.sap_qty = l.req_qty; l.moved_qty = l.moved_qty || 0; l.req_qty = Math.max(0, l.req_qty - l.moved_qty);
      /* An approved alternate takes the place of the ordered article; orig_article remembers what the store ordered. */
      l.orig_article = l.orig_article || ''; l.orig_desc = l.orig_article ? ((articles[l.orig_article] || {}).description || '') : '';
      const base = String(l.line_no || '').split('~')[0];
      l.line_item = base && base !== (l.orig_article || l.article_code) ? base : '';       // a real SAP line item number, when the export has one
      l.locs = l.locs || null;                             // which DC locations the approved / offered quantity is taken from
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
      /* value approved: at the price approved with each quantity (the price asked, where none was approved) */
      l.value = l.approved_value != null ? Number(l.approved_value) : l.approved * l.req_price; l.ask_value = l.req_qty * l.req_price;
      l.appr_price = l.approved ? Math.round(l.value / l.approved * 100) / 100 : null;
      l.price_changed = l.appr_price != null && Math.abs(l.appr_price - l.req_price) > 0.004;
      /* delivery: the stock must be allocated at least "lead time" days before the date the store wants it */
      l.allocate_by = l.del_date && l.lead_time != null ? addDays(l.del_date, -l.lead_time) : null;
      l.days_left = l.allocate_by ? dayDiff(now, l.allocate_by) : null;
      l.late = l.balance > 0 && l.days_left != null && l.days_left < 0;
      l.tight = l.balance > 0 && l.days_left != null && l.days_left >= 0 && l.days_left <= 1;
      if (l.balance > 0) { const p = P(l.article_code); p.pending += l.balance; p.n_lines++; p._st.add(l.store_code); }
      return l;
    });
    for (const c in pos) {
      const p = pos[c];
      p.dc = p.stock + p.inward; p.free = p.dc - p.reserved; p.n_stores = p._st.size; delete p._st;
      for (const k of LOC_KEYS) p.locFree[k] = (p.loc[k] || 0) + (Number(p.locIn[k]) || 0) - (Number(p.locRes[k]) || 0);
    }
    /* Stock at the ordering store, for the ordered article and for its alternates of both kinds.
       closing = closing stock, transit = in transit + CLA, total = both, mtd = sale this month. */
    const sst = snap.store_stock || {}, hasSS = !!(snap.meta && snap.meta.sstock_batch);
    const ssOf = (store, art) => { const v = (sst[store] || {})[art]; return v ? { closing: v[0], transit: v[1] + v[2], total: v[0] + v[1] + v[2], mtd: v[3] } : { closing: 0, transit: 0, total: 0, mtd: 0 }; };
    for (const l of lines) {
      if (!hasSS) { l.ss = null; continue; }
      const own = ssOf(l.store_code, l.article_code), a = articles[l.article_code] || {};
      const gs = (a.group_same || '').trim(), gd = (a.group_diff || '').trim(), seen = new Set([l.article_code]), alts = [];
      const add = (c, kind) => { if (seen.has(c)) return; seen.add(c); const v = ssOf(l.store_code, c); if (v.total || v.mtd) alts.push(Object.assign({ code: c, kind }, v)); };
      if (gs) (same[gs] || []).forEach((c) => add(c, 'same'));
      if (gd) (diff[gd] || []).forEach((c) => add(c, 'diff'));
      if (l.orig_article) add(l.orig_article, 'ordered');
      const altTotal = alts.reduce((t, x) => t + Math.max(0, x.total), 0);
      l.ss = { own, alts, altTotal, family: Math.max(0, own.total) + altTotal, familyMtd: own.mtd + alts.reduce((t, x) => t + x.mtd, 0) };
    }
    const byId = {};
    for (const l of lines) byId[l.id] = l;
    const locOrder = String(snap.loc_order || DEFAULT_LOC_ORDER).split(',').filter((k) => LOC_NAME[k] && k !== 'oth');
    return { articles, stores, same, diff, pos, lines, byId, meta: snap.meta || {}, imports: snap.imports || [], locOrder, inwardLoads: snap.inward_loads || [], hasStoreStock: hasSS,
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
    del_date: ['del date', 'deliverydt', 'delivery date', 'req delivery date', 'requested delivery date', 'reqd delivery date', 'required delivery date'],
    customer: ['customer', 'customer name', 'corporate', 'corporate name', 'party name'],
    phone: ['ph no.', 'ph no', 'phone', 'phone no', 'mobile', 'mobile no', 'contact no', 'contact number'],
    poc_name: ['booked by', 'poc name', 'contact person', 'contact name', 'store poc'],
    req_price: ['price wanted', 'required price', 'requested price', 'price required', 'offer price', 'order price', 'net price', 'selling price', 'rate', 'price'],
    req_qty: ['quantity wanted', 'qty wanted', 'order qty', 'order quantity', 'required qty', 'required quantity', 'req qty', 'qty required', 'quantity', 'qty'],
    // articles
    article_code: ['material', 'art code', 'article code', 'article', 'article no', 'article number', 'material number', 'sku', 'artcode'],
    description: ['desc', 'description', 'short text', 'article description', 'material description', 'article desc', 'article name', 'artdesc'],
    mc_code: ['mc code', 'merchandise category', 'mdse cat.', 'mdse cat', 'merchandise category code'],
    mc_name: ['mc name', 'mc desc', 'mc description', 'mc', 'nc name', 'merchandise category name', 'merchandise category desc', 'merch cat.desc.', 'merch cat desc', 'mcdes'],
    category: ['category', 'cat'],
    buyer: ['buyer', 'buy'],
    mrp: ['new mrp', 'mrp', 'old mrp'],
    vrp: ['new vrp', 'vrp', 'old vrp'],
    cost: ['new cost', 'cost', 'article cost as per sap', 'cost including bogo'],
    gst: ['gst%', 'gst', 'gst rate', 'gst %'],
    pack_size: ['packsize', 'pack size', 'pk size', 'pak size', 'pack', 'packsizedenom'],
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
    site_code: ['dc', 'dc code', 'site', 'site code', 'plant', 'plnt', 'location code'],
    total: ['total msa -qty', 'total msa qty', 'total msa stock qty', 'total dc qty', 'msa stock (dc)', 'total qty', 'unrestricted stock', 'unrestricted', 'stock qty', 'stock'],
    v0102: ['v01 & v02 -qty', 'v01 & v02 qty', 'v01 v02 qty'],
    v01: ['v01 -qty', 'v01 qty', 'v01'],
    v02: ['v02 -qty', 'v02 qty', 'v02'],
    nso: ['nso (0023) -qty', 'nso qty', 'nso (0023) qty', '0023 qty', '0023'],
    hh: ['hh reserved (0043) -qty', 'hh reserve qty', 'hh reserved qty', '0043 qty', '0043'],
    spl: ['special buy (0041) -qty', 'special buy qty', '0041 qty', '0041'],
    best: ['best seller (0042) -qty', 'bestseller qty', 'best seller qty', '0042 qty', '0042'],
    sea: ['sea stk -qty', 'sea stk qty', 'sea stock qty'],
    // inwards (GRN) received at the DC after the stock report
    in_qty: ['inward qty', 'inward quantity', 'inwards qty', 'grn qty', 'grn quantity', 'received qty', 'received quantity', 'receipt qty', 'gr qty', 'gr quantity',
      'quantity', 'qty'],             // pieces; SAP's "Quantity in UnE" is in packs and is not used
    mvt: ['mvt', 'movement type', 'mvmt type', 'mvmt'],
    doc_no: ['grn no', 'grn number', 'grn', 'material document', 'mat. doc.', 'mat doc', 'material doc', 'material doc.', 'document number', 'document no', 'doc no',
      'inbound delivery', 'reference'],
    in_date: ['grn date', 'posting date', 'pstng date', 'inward date', 'entry date', 'entered on', 'received date', 'received on', 'receipt date', 'gr date', 'document date', 'doc. date', 'date'],
    in_time: ['grn time', 'time of entry', 'entry time', 'posting time', 'received time', 'time'],
    sloc: ['storage location', 'stor. loc.', 'stor loc', 'storage loc', 'sloc', 's.loc', 'stock location', 'location', 'sl'],
    // approvals done in SAP (the SAP approval export)
    appr_status: ['apprstatus', 'approval status', 'appr status'],
    qty_alloc: ['qtyalloc', 'qty alloc', 'quantity allocated', 'allocated qty'],
    qty_appr: ['qtyappr', 'qty appr', 'quantity approved', 'approved qty'],
    price_given: ['pricegiven', 'price given', 'approved price'],
    appr_by: ['issuerecby', 'issue received by', 'approved by'],
    cat_date: ['catapprdate', 'category approval date', 'approval date'],
    cat_time: ['catapprtime', 'category approval time'],
    plan_date: ['planapprdate', 'planning approval date'],
    plan_time: ['plapprtime', 'planapprtime'],
    sap_po: ['pono.', 'po no', 'po number', 'pono'],
    remarks: ['remarks', 'remark'],
    reason_cat: ['reasoncat', 'reason'],
    // stock at the stores (store-wise stock report)
    ss_cl: ['cl_stk_q', 'closing stock', 'closing stock qty', 'closing qty', 'cl stk qty', 'cl stk', 'store closing stock', 'closing'],
    ss_it: ['intransit_q', 'intransit qty', 'in transit qty', 'intransit', 'in transit', 'git qty', 'git'],
    ss_cla: ['cla_stk_q', 'cla stk qty', 'cla stock', 'cla qty', 'cla'],
    ss_mtd: ['mtd_sale_q', 'mtd sale qty', 'mtd sales qty', 'mtd sale', 'mtd sales', 'mtd qty', 'mtd']
  };
  const SPECS = {
    master: { required: ['article_code'], optional: ['description', 'mc_code', 'mc_name', 'category', 'buyer', 'mrp', 'vrp', 'cost', 'gst', 'pack_size', 'vendor_code', 'vendor_name', 'group_same', 'group_diff', 'status'] },
    data: { required: ['article_code', 'mrp'], optional: ['description', 'mc_code', 'mc_name', 'category', 'buyer', 'vrp', 'cost', 'gst', 'pack_size', 'vendor_code', 'vendor_name', 'status', 'bogo_count', 'ppo_cm', 'ppo_nm', 'store_stock', 'intransit'] },
    stores: { required: ['store_code'], optional: ['store_name', 'city', 'state', 'email', 'lead_time', 'dc'], need: ['store_name', 'email', 'lead_time'] },
    stock: { required: ['article_code', 'total'], optional: ['site_code', 'v0102', 'v01', 'v02', 'nso', 'hh', 'spl', 'best', 'sea'] },
    orders: { required: ['order_no', 'store_code', 'article_code', 'req_qty'], optional: ['line_no', 'order_date', 'del_date', 'customer', 'phone', 'poc_name', 'description', 'mc_name', 'mrp', 'req_price', 'pack_size', 'store_name'] },
    /* Inwards: either one row per receipt (article, quantity, and if the file has them: GRN number, date, time, storage location, DC),
       or the layout of the DC stock report with the received quantity under each location. */
    inward: { required: ['article_code'], optional: ['in_qty', 'doc_no', 'in_date', 'in_time', 'sloc', 'site_code', 'description', 'mc_name', 'mvt', 'total', 'v0102', 'v01', 'v02', 'nso', 'hh', 'spl', 'best', 'sea'],
      need: ['in_qty', 'total', 'v0102', 'v01', 'v02', 'nso', 'hh', 'spl', 'best', 'sea'], needNice: 'Inward qty' },
    /* Approvals and rejections done in SAP: order + article, the status, and what was approved. */
    sapappr: { required: ['order_no', 'article_code', 'appr_status'], optional: ['qty_alloc', 'qty_appr', 'price_given', 'appr_by', 'cat_date', 'cat_time', 'plan_date', 'plan_time',
      'site_code', 'sap_po', 'remarks', 'reason_cat', 'store_code', 'store_name', 'mc_name', 'description', 'mrp', 'req_qty', 'req_price', 'order_date', 'del_date', 'poc_name', 'phone', 'pack_size'] },
    /* Stock at each store: closing stock, in transit and CLA, and the sale this month. Other sale columns are not used. */
    storestock: { required: ['store_code', 'article_code', 'ss_cl'], optional: ['ss_it', 'ss_cla', 'ss_mtd'] }
  };
  const NICE = { article_code: 'Article', total: 'Total MSA qty', req_qty: 'Qty wanted', order_no: 'Order ID', store_code: 'Store Code', mrp: 'MRP', in_qty: 'Inward qty', ss_cl: 'CL_STK_Q (closing stock)' };

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
    const t = String(v).trim(), neg = /^[\d,.\s]+-$/.test(t);             // SAP writes minus at the end: "1,602-"
    const n = parseFloat(t.replace(/[^\d.\-]/g, '').replace(/-$/, ''));
    return isNaN(n) ? (dflt === undefined ? 0 : dflt) : (neg ? -Math.abs(n) : n);
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

  /* Time of day in minutes from whatever a report gives: an Excel time (0.61), a date-time serial (46305.61), '14:35:00', '10.10.2026 14:35'. Null when there is none. */
  function minutesOf(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
    if (typeof v === 'number') { const f = v - Math.floor(v); return (v < 1 || v > 20000) && (f > 1e-9 || v < 1) && !(v > 20000 && f < 1e-9) ? Math.min(1439, Math.round(f * 1440)) : null; }
    const s = String(v).trim();
    let m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?/i);
    if (m) { let h = +m[1] % 24; if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0); return h * 60 + +m[2]; }
    if (/^\d{5}\.\d+$/.test(s) || /^0?\.\d+$/.test(s)) return minutesOf(parseFloat(s));
    m = s.match(/^(\d{2})(\d{2})(\d{2})$/);                         // SAP time as 143500
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  }
  /* Which location key a storage location stands for: 0023 / NSO, 0043 / HH reserved, 0041 / special buy, 0042 / best seller, sea; anything else is V01 & V02. */
  function locOfSloc(v) {
    const s = norm(v);
    if (!s) return 'v';
    if (s.includes('0023') || s === '23' || s.includes('nso')) return 'nso';
    if (s.includes('0043') || s === '43' || s.includes('hh')) return 'hh';
    if (s.includes('0041') || s === '41' || s.includes('special')) return 'spl';
    if (s.includes('0042') || s === '42' || s.includes('best')) return 'best';
    if (s.startsWith('sea')) return 'sea';
    return 'v';
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
      const nice = h.missing.map((f) => NICE[f] || ALIASES[f][0]).join(', ') || (needMissing ? (spec.needNice || spec.need.map((f) => ALIASES[f][0]).join(' or ')) : 'any known heading');
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
       line item. The same article entered again in the same order is a mistake at the store:
       the line is taken once and marked (dups = times entered, dup_qty = the quantities). */
    orders: (rows) => {
      const seen = new Map(), out = [];
      let extra = 0;
      for (const r of rows) {
        const o = {
          order_no: code(r.order_no), line_no: code(r.line_no), order_date: dateStr(r.order_date), del_date: dateStr(r.del_date),
          store_code: code(r.store_code).toUpperCase(), store_name: txt(r.store_name), customer: txt(r.customer),
          phone: code(r.phone), poc_name: txt(r.poc_name), article_code: code(r.article_code), description: txt(r.description),
          mc_name: txt(r.mc_name), mrp: numOrNull(r.mrp), req_price: numOrNull(r.req_price), pack_size: int(r.pack_size),
          req_qty: Math.round(num(r.req_qty)), dups: 0, dup_qty: ''
        };
        if (!o.order_no || !o.article_code || !/\d/.test(o.article_code)) continue;
        const key = o.order_no + '|' + (o.line_no || o.article_code), first = seen.get(key);
        if (first) { first.qtys.push(o.req_qty); extra++; continue; }       // same article again in the same order: taken once, marked
        seen.set(key, { o, qtys: [o.req_qty] }); out.push(o);
      }
      for (const { o, qtys } of seen.values()) if (qtys.length > 1) { o.dups = qtys.length; o.dup_qty = qtys.join(', '); }
      out.extraRows = extra;
      out.repeats = out.filter((o) => o.dups).map((o) => `Order ${o.order_no}: article ${o.article_code} ${o.description} is entered ${o.dups} times (qty ${o.dup_qty}) - taken once, with ${o.req_qty}`);
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
    },
    /* The SAP approval export. st: 'A' approved (by category or planning), 'R' rejected; other statuses are listed in out.others.
       q = the quantity allocated in SAP (QtyAlloc; QtyAppr when that is empty). pref = DC locations named in the remark (OK-DH29-0023 -> NSO). */
    sapappr: (rows) => {
      const out = []; out.others = {};
      const at = (d, t) => {
        const day = dateStr(d); if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
        const mins = minutesOf(t) == null ? (minutesOf(d) == null ? 12 * 60 : minutesOf(d)) : minutesOf(t);
        return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), Math.floor(mins / 60), mins % 60).toISOString();
      };
      for (const r of rows) {
        const o = code(r.order_no), a = code(r.article_code), label = txt(r.appr_status);
        if (!o || !/^\d{6,}$/.test(a)) continue;
        const st = /^approved/i.test(label) ? 'A' : /^rejected/i.test(label) ? 'R' : '';
        if (!st) { out.others[label || '(blank)'] = (out.others[label || '(blank)'] || 0) + 1; continue; }
        const alloc = Math.round(num(r.qty_alloc)), appr = Math.round(num(r.qty_appr)), rem = txt(r.remarks);
        const pref = []; const u = rem.toUpperCase();
        for (const [re, k] of [[/(^|[^0-9])(00)?23([^0-9]|$)/, 'nso'], [/(^|[^0-9])(00)?43([^0-9]|$)/, 'hh'], [/(^|[^0-9])(00)?41([^0-9]|$)/, 'spl'], [/(^|[^0-9])(00)?42([^0-9]|$)/, 'best'], [/V0[12]/, 'v']]) {
          const m = re.exec(u.replace(/DH\d+/g, ' ')); if (m) pref.push([m.index, k]);
        }
        out.push({ o, a, st, label, q: alloc > 0 ? alloc : appr > 0 ? appr : 0, price: numOrNull(r.price_given), who: txt(r.appr_by),
          at: at(r.cat_date, r.cat_time) || at(r.plan_date, r.plan_time), plan_at: at(r.plan_date, r.plan_time), dc: code(r.site_code), po: code(r.sap_po),
          remarks: rem, reason: txt(r.reason_cat), pref: pref.sort((x, y) => x[0] - y[0]).map((x) => x[1]).join(','),
          site: code(r.store_code).toUpperCase(), name: txt(r.store_name), mc: txt(r.mc_name), desc: txt(r.description), mrp: numOrNull(r.mrp),
          want: Math.round(num(r.req_qty)), pw: numOrNull(r.req_price), book: dateStr(r.order_date), del: dateStr(r.del_date), poc: txt(r.poc_name), phone: code(r.phone), pack: int(r.pack_size) });
      }
      return out;
    },
    /* Stock at the stores: one row per store and article, {s, a, c: closing, i: in transit, l: CLA, m: sale this month}. */
    storestock: (rows) => {
      const agg = new Map();
      for (const r of rows) {
        const a = code(r.article_code), st = code(r.store_code).toUpperCase();
        if (!/^\d{6,}$/.test(a) || !st || st.length > 12) continue;
        const k = st + '|' + a, q = { s: st, a, c: Math.round(num(r.ss_cl)), i: Math.round(num(r.ss_it)), l: Math.round(num(r.ss_cla)), m: Math.round(num(r.ss_mtd)) };
        const cur = agg.get(k);
        if (cur) { cur.c += q.c; cur.i += q.i; cur.l += q.l; cur.m += q.m; } else agg.set(k, q);
      }
      return Array.from(agg.values());
    },
    /* Inwards. Each entry: {a: article, q: pcs, l: location key, s: DC code, d: GRN / document number,
       day: 'YYYY-MM-DD' or '', mins: time of day in minutes or null}. Totals rows and rows without an article number are skipped. */
    inward: (rows) => {
      const out = [];
      out.skipped = [];                                                  // rows that are not a goods receipt (movement type other than 101, or a minus quantity)
      for (const r of rows) {
        const a = code(r.article_code);
        if (!/^\d{6,}$/.test(a)) continue;
        const mvt = code(r.mvt);
        if ((mvt && mvt !== '101') || num(r.in_qty) < 0) { out.skipped.push({ a, mvt, q: Math.round(num(r.in_qty)), d: code(r.doc_no) }); continue; }
        const base = { a, s: code(r.site_code), d: code(r.doc_no), m: txt(r.mc_name), n: txt(r.description), day: dateStr(r.in_date), mins: minutesOf(r.in_time) };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(base.day)) base.day = '';
        if (base.mins == null) base.mins = minutesOf(r.in_date);        // a date cell that carries the time as well
        const byLoc = { v: Math.round(num(r.v0102) + num(r.v01) + num(r.v02)), nso: Math.round(num(r.nso)), hh: Math.round(num(r.hh)), spl: Math.round(num(r.spl)), best: Math.round(num(r.best)), sea: Math.round(num(r.sea)) };
        const placed = Object.keys(byLoc).reduce((t, k) => t + Math.max(0, byLoc[k]), 0);
        if (placed > 0) {                                               // laid out like the stock report: a quantity under each location
          for (const k in byLoc) if (byLoc[k] > 0) out.push(Object.assign({ q: byLoc[k], l: k }, base));
          const rest = Math.round(num(r.total)) - placed;
          if (rest > 0) out.push(Object.assign({ q: rest, l: 'v' }, base));
        } else {
          const q = Math.round(r.in_qty != null && r.in_qty !== '' ? num(r.in_qty) : num(r.total));
          if (q > 0) out.push(Object.assign({ q, l: locOfSloc(r.sloc) }, base));
        }
      }
      return out;
    }
  };

  /* ---------------- upload templates ----------------
     For each upload: the headings exactly as the app reads them, one invented example row, and what goes in each column.
     [heading, needed?, what to put, example] */
  const TEMPLATES = {
    master: { file: 'Template_1_Diwali_Article_Master', sheet: 'Master', cols: [
      ['Material', 'Yes', 'Article code', '1005107'], ['Desc', '', 'Article description', 'Casserole 1500ml Red'], ['MC Code', '', 'Merchandise category code', 'TH101'],
      ['MC Name', '', 'Merchandise category name', 'Casserole'], ['Category', '', 'Category', 'Thermoware'], ['Buyer', '', 'Buyer name', 'Riya'], ['MRP', '', 'MRP in rupees', 499],
      ['VRP', '', 'VRP in rupees', 499], ['Cost', '', 'Cost per piece (without GST)', 285.14], ['GST%', '', 'GST as 18 or 0.18', 18], ['Packsize', '', 'Pieces in one pack (approvals are rounded up to this)', 12],
      ['Vendor Code', '', 'Vendor code', 'V2101'], ['Vendor Name', '', 'Vendor name', 'Sunhot Thermoware'],
      ['Same model alternatives', '', 'Same text for articles that are the same design in another colour or vendor', 'CASS1500'],
      ['Different model alternatives', '', 'Same text for articles of another design at the same price point', 'GIFT499'], ['Article Status', '', 'Active or In-Active', 'Active']] },
    data: { file: 'Template_3_Full_Article_Data', sheet: 'Data', cols: [
      ['Material', 'Yes', 'Article code', '1005999'], ['Desc', '', 'Article description', 'Vacuum Flask 1L Steel'], ['MC Code', '', 'Merchandise category code', 'TH140'], ['MC Name', '', 'Merchandise category name', 'Bottles & Flasks'],
      ['Cat', '', 'Category', 'Thermoware'], ['Buy', '', 'Buyer name', 'Riya'], ['Article Status', '', 'Active or In-Active', 'Active'], ['New MRP', 'Yes', 'MRP in rupees', 599],
      ['New VRP', '', 'VRP in rupees', 599], ['New Cost', '', 'Cost per piece (without GST)', 320], ['GST%', '', 'GST as 18 or 0.18', 18], ['Pack Size', '', 'Pieces in one pack', 12],
      ['Vendor Code', '', 'Vendor code', 'V2230'], ['Vendor Name', '', 'Vendor name', 'Coolsip Steel'], ['Store Stock', '', 'Pieces in all stores', 240], ['Intransit Stock', '', 'Pieces in transit', 48],
      ['CM PPO Qty', '', 'Pending PO this month', 120], ['NM PPO Qty', '', 'Pending PO next month', 0]] },
    stores: { file: 'Template_4_Stores', sheet: 'Stores', cols: [
      ['Store Code', 'Yes', 'Site code', 'VM101'], ['Store Name', '', 'Store name', 'Gurugram Sector 14'], ['StoreEmails', '', 'Email address of the store', 'vm101.sm@example.com'],
      ['State', '', 'State', 'Haryana'], ['City', '', 'City', 'Gurugram'], ['Lead Time', '', 'Days from allocation to delivery at the store', 3], ['DC/RDC', '', 'DC or RDC that serves the store', 'RDC-NORTH']] },
    stock: { file: 'Template_5_DC_Stock', sheet: 'DC STOCK-GM', cols: [
      ['DC', '', 'DC code', 'DH19'], ['ARTICLE', 'Yes', 'Article code', '1005107'], ['TOTAL MSA -QTY', 'Yes', 'Total MSA quantity (the DC stock)', 1000],
      ['V01 & V02 -QTY', '', 'Quantity in V01 & V02', 640], ['NSO (0023) -QTY', '', 'Quantity in NSO (0023)', 60], ['HH RESERVED (0043) -QTY', '', 'Quantity in HH reserved (0043)', 300],
      ['SPECIAL BUY (0041) -QTY', '', 'Quantity in Special buy (0041)', 0], ['BEST SELLER (0042) -QTY', '', 'Quantity in Best seller (0042)', 0], ['SEA STK -QTY', '', 'Sea stock', 0]] },
    inward: { file: 'Template_6_Inwards', sheet: 'Inwards', cols: [
      ['Material', 'Yes', 'Article code', '1212013789'], ['Material Description', '', 'Article description', '99-HF-BWL-CRYSTAL-200M-6P-UG-10-26'],
      ['Quantity', 'Yes', 'Pieces received (SAP "Quantity", not "Quantity in UnE", which is in packs)', 8100], ['Merch Cat.Desc.', '', 'MC name', 'HH_C_G_BOWL'],
      ['Plnt', '', 'DC code', 'DH29'], ['SLoc', '', '0023 = NSO, 0043 = HH reserved, 0041 = Special buy, 0042 = Best seller; anything else V01 & V02', '0010'],
      ['MvT', '', 'Movement type: only 101 (goods receipt) is added', '101'], ['Mat. Doc.', '', 'Material document (a document already loaded is not counted twice)', '5025408701'],
      ['Pstng Date', '', 'Posting date (DD.MM.YYYY)', '13.10.2026']] },
    storestock: { file: 'Template_7_Store_Stock', sheet: 'Store stock', cols: [
      ['Plant', 'Yes', 'Store (site) code', 'VM101'], ['Article', 'Yes', 'Article code', '1005107'], ['Article Description', '', 'For reference only', 'Casserole 1500ml Red'], ['MRP', '', 'For reference only', 499],
      ['CL_STK_Q', 'Yes', 'Closing stock at the store', 24], ['INTRANSIT_Q', '', 'In transit to the store', 12], ['CLA_STK_Q', '', 'CLA stock (counted as in transit)', 0], ['MTD_SALE_Q', '', 'Sale this month', 30]] },
    sapappr: { file: 'Template_9_SAP_Approvals', sheet: 'Sheet1', cols: [
      ['OrderNo', 'Yes', 'Order number', 'HH02051609'], ['ApprStatus', 'Yes', 'Approved By Category / Approved By Planning / Rejected By Category / Rejected By Planning', 'Approved By Planning'],
      ['ArtCode', 'Yes', 'Article code', '1212013836'], ['ArtDesc', '', 'Article description', '99-HF-BOWL-6P-GLS'], ['MCDes', '', 'MC name', 'HH_C_G_BOWL'],
      ['Site', '', 'Store code (used when the line is not in the tracker yet)', 'HH02'], ['Name', '', 'Store name', 'BHIWANI'], ['MRP', '', 'MRP', 99],
      ['QtyWanted', '', 'Qty the store wanted', 500], ['PriceWanted', '', 'Price the store asked', 91.08], ['BookDate', '', 'Booking date', '05.10.2026'], ['DeliveryDT', '', 'Delivery date', '15.10.2026'],
      ['QtyAlloc', 'Yes for approved', 'Quantity allocated in SAP - this is what is approved', 510], ['QtyAppr', '', 'Used only when QtyAlloc is empty', 510],
      ['PriceGiven', '', 'Price approved', 91.08], ['IssueRecBy', '', 'Who approved', 'BABLU SINGH'], ['CatApprDate', '', 'Category approval date (the approval date)', '09.10.2026'],
      ['CatApprTime', '', 'Category approval time', '17:05'], ['PlanApprDate', '', 'Planning approval date', '09.10.2026'], ['DC', '', 'DC', 'DH29'], ['PONo.', '', 'PO number', '5125987975'],
      ['Remarks', '', 'Remark (a storage location in it, e.g. 0023, is used first for the stock)', 'OK-DH29-0023'], ['ReasonCAT', '', 'Reason for rejection', ''],
      ['BookedBy', '', 'Who booked', 'TEST CONTACT'], ['ContactNo', '', 'Mobile number', '9000000201'], ['PackSizeDenom', '', 'Pieces in one pack', 10]] },
    orders: { file: 'Template_8_Orders', sheet: 'Orders', cols: [
      ['Site', 'Yes', 'Store (site) code', 'VM101'], ['Name', '', 'Store name', 'Gurugram Sector 14'], ['OrderNo', 'Yes', 'Order number', 'TW26000121'], ['MerchandiseCategory', '', 'For reference only (the MC code is taken from the article files)', 'TH101'],
      ['MC Desc', '', 'MC name', 'Casserole'], ['ArticleCode', 'Yes', 'Article code', '1005107'], ['ArticleDesc', '', 'Article description', 'Casserole 1500ml Red'], ['MRP', '', 'MRP', 499],
      ['Quantity Wanted', 'Yes', 'Pieces the store wants', 500], ['Book Date', '', 'Booking date (DD.MM.YYYY)', '05.10.2026'], ['DeliveryDate', '', 'Delivery date wanted (DD.MM.YYYY)', '14.10.2026'],
      ['Price Wanted', '', 'Price per piece the store asks for (blank or 0 = MRP)', 439], ['Pak Size', '', 'Pieces in one pack', 12], ['Contact Number', '', 'Mobile number of the person who booked', '9000000201'],
      ['Booked By', '', 'Name of the person who booked', 'Test Contact F']] }
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

  root.Core = { TEMPLATES, STATUS_LABEL, STATUS_ORDER, REJECT_REASONS, LOCATIONS, LOC_KEYS, LOC_NAME, LOC_SHORT, DEFAULT_LOC_ORDER, locText, splitByOrder, autoSplit, minutesOf, locOfSloc, statusOf, build, alternates, allAlternates, freeOf, suggestSplit,
    packOf, roundPack, floorPack, marginAt, discountOf, pct, addDays, today, dayDiff, inr, rupees, when, whenLong,
    norm, ALIASES, SPECS, code, num, dateStr, findHeader, readTable, shape, offerSubject, offerText, reorderSubject, reorderText, mailHtml,
    buildEml, esc, b64utf8 };
})(typeof window !== 'undefined' ? window : globalThis);
