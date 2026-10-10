/* Allocation Desk - screens. One file, no framework: each view is a function that returns HTML,
   clicks are routed through data-act attributes, and every change goes to the database
   functions (which enforce the rules) followed by a fresh read. */
(function () {
  'use strict';
  const C = window.Core, A = window.Api, R = window.Reader, esc = C.esc, inr = C.inr, rupees = C.rupees, when = C.when, pct = C.pct;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const app = $('#app');
  const wideMQ = window.matchMedia('(min-width: 960px)');
  const S = {
    me: null, M: null, view: 'dashboard', wide: wideMQ.matches, lastSync: null, online: true, stale: false, busy: false,
    o: { q: '', status: '', flag: '', store: '', mc: '', buyer: '', sel: null, checked: new Set(), limit: 300, detail: null, sort: null, dir: 1 },
    s: { only: true, q: '', art: null, qty: {} },
    c: { q: '', scope: 'master', cat: '', results: null, loading: false, asked: '' },
    extra: {}                                        // articles looked up on the server that are not part of the everyday data
  };
  const NEED_SCHEMA = 2;
  const editor = () => !!(S.me && S.me.role === 'editor');
  const artOf = (code) => (S.M && S.M.articles[code]) || S.extra[code] || null;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const ICON = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    shortages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17.2v.3"/></svg>',
    catalogue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-4 3 2 4-4 4 4"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>'
  };
  const NAV = [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['shortages', 'Shortages'], ['catalogue', 'Articles'], ['data', 'Data']];

  /* ================= small building blocks ================= */
  const pill = (st, text) => `<span class="pill ${st}">${esc(text || C.STATUS_LABEL[st] || st)}</span>`;
  const stat = (title, value, tone) => `<div class="stat"><b class="${tone || ''}">${value}</b><span>${title}</span></div>`;
  const plural = (n, one, many) => (n === 1 ? one : many || one + 's');
  const ref = (l) => (l.line_no && l.line_no !== l.article_code ? l.order_no + ' / ' + l.line_no : l.order_no);
  function thumb(code, size, click) {
    const a = artOf(code), url = a && A.cachedUrl(a);
    const inner = a && a.image_path ? `<img data-code="${esc(code)}" alt="" ${url ? `src="${esc(url)}"` : ''}>` : '<span class="noimg">Image not uploaded</span>';
    return `<div class="thumb ${size}${click ? ' click' : ''}"${click ? ` data-act="art" data-code="${esc(code)}" title="Open article"` : ''}>${inner}</div>`;
  }
  async function hydrate() {                         // give every picture on screen its link
    const imgs = $$('img[data-code]').filter((i) => !i.getAttribute('src'));
    if (!imgs.length || !S.M) return;
    const arts = Array.from(new Set(imgs.map((i) => i.dataset.code))).map(artOf).filter((a) => a && a.image_path);
    try { await A.imageUrls(arts); } catch (e) { return; }
    $$('img[data-code]').forEach((i) => {
      if (i.getAttribute('src')) return;
      const a = artOf(i.dataset.code), u = a && A.cachedUrl(a);
      if (u) i.src = u;
    });
  }
  function toast(msg) {
    const t = $('#toast'); t.innerHTML = `<div>${esc(msg)}</div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, 2600);
  }
  function pop(html, cls) {
    const d = document.createElement('div');
    d.className = 'overlay';
    d.innerHTML = `<div class="pop ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    $('#modal').appendChild(d);
    d.close = () => d.remove();
    return d;
  }
  function tell(title, text) {
    return new Promise((res) => {
      const d = pop(`<h2>${esc(title)}</h2><pre>${esc(text)}</pre><div class="actions"><button class="btn primary" data-ok>OK</button></div>`);
      $('[data-ok]', d).onclick = () => { d.close(); res(); };
      $('[data-ok]', d).focus();
    });
  }
  /* A pop-up with a form. Resolves with {name: value} of its inputs, or null if cancelled. */
  function ask(title, bodyHtml, okLabel, opts) {
    opts = opts || {};
    return new Promise((res) => {
      const d = pop(`<form><h2>${esc(title)}</h2>${bodyHtml}<div class="actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn ${opts.danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel || 'OK')}</button></div></form>`, opts.cls);
      const done = (v) => { d.close(); res(v); };
      $('[data-cancel]', d).onclick = () => done(null);
      $('form', d).onsubmit = (e) => {
        e.preventDefault();
        const v = {};
        $$('[name]', d).forEach((i) => { v[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
        done(v);
      };
      const first = $('input,select,textarea', d); if (first && !opts.noFocus) first.focus();
    });
  }
  const confirmBox = (title, text, okLabel, danger) => ask(title, `<pre>${esc(text)}</pre>`, okLabel || 'Yes', { danger, noFocus: true }).then((v) => !!v);
  function progress(title) {
    const d = pop(`<div class="row"><div class="spinner"></div><div class="grow"><h2 style="margin:0">${esc(title)}</h2><div class="small" data-t></div></div></div>`);
    return { set: (t) => { $('[data-t]', d).textContent = t; }, close: () => d.close() };
  }
  function saveBlob(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('Could not load a part of the app (' + src + '). Check the connection and try again.'));
      document.head.appendChild(s);
    });
  }
  async function XL() { if (!window.XLSX) await loadScript('vendor/xlsx.full.min.js'); return window.XLSX; }
  const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  /* ================= sign-in screens ================= */
  const LOGO = '<img class="logo" src="icons/icon-192.png" alt="">';
  function authPage(inner) { app.innerHTML = `<div class="center"><div class="auth"><div class="card stack">${inner}</div></div></div>`; }
  function screenConfig() {
    const missing = [];
    if (!window.supabase) missing.push('vendor/supabase.js');
    if (!window.fflate) missing.push('vendor/fflate.js');
    if (!R) missing.push('reader.js');
    if (missing.length) {
      return authPage(`<h1>Allocation Desk</h1><p class="note bad">Some files of the app are missing: <b>${esc(missing.join(', '))}</b></p>
        <p>On GitHub, open your repository and check that the <b>vendor</b> and <b>icons</b> folders are there next to index.html, with their files inside. If they are not, upload everything inside the <b>allocation-desk-app</b> folder again (drag the folders too, not only the loose files).</p>
        <button class="btn" data-act="hardReload">Try again</button>`);
    }
    authPage(`${LOGO}<h1>Allocation Desk</h1><p class="muted">This copy is not connected to a database yet.</p>
      <p>On GitHub open <b>config.js</b>, click the pencil, and paste your Supabase Project URL and publishable key between the quotes. The setup guide has the steps.</p>
      <p class="small">If you already did that, wait two minutes for GitHub to publish the change, then press Ctrl + F5 (on a phone: close the tab and open the address again).</p>
      <button class="btn" data-act="hardReload">Try again</button>`);
  }
  function screenOldDb() {
    authPage(`${LOGO}<h1>One step left: update the database</h1>
      <p>This is the new version of the app, and the database still has the earlier setup.</p>
      <p>In Supabase open <b>SQL Editor</b> &gt; <b>New query</b>, paste everything from the new <b>supabase-setup.sql</b>, and click <b>Run</b>. Your orders, approvals, pictures and team are kept. Then upload the DC stock report again.</p>
      <button class="btn primary" data-act="retry">I have run it - continue</button> <button class="btn" data-act="signout">Sign out</button>`);
  }
  async function screenLogin(msg) {
    authPage(`${LOGO}<div class="row"><div class="spinner"></div><span class="muted">Connecting ...</span></div>`);
    let has = true;
    try { has = await A.rpc('has_members'); } catch (e) {
      return authPage(`${LOGO}<h1>Allocation Desk</h1><p class="note bad">${esc(e.message)}</p>
        <p class="small">If this keeps happening, check that the database setup script was run and that config.js has the right address and key.</p>
        <button class="btn" data-act="retry">Try again</button>`);
    }
    if (!has) return screenSetup(false);
    authPage(`${LOGO}<h1>Allocation Desk</h1><p class="muted">Corporate order allocation</p>
      ${msg ? `<p class="note bad">${esc(msg)}</p>` : ''}
      <form id="login" class="stack">
        <label class="f">Email<input type="email" name="email" autocomplete="username" required></label>
        <label class="f">Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary" style="width:100%">Sign in</button>
      </form>
      <p class="small">No account? Ask the editor of this tracker to add you.</p>`);
    $('#login').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, b = $('button', f); b.disabled = true; b.textContent = 'Signing in ...';
      const { error } = await A.sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) return screenLogin(A.nice(error));
      enter();
    };
  }
  function screenSetup(signedIn, msg) {
    authPage(`${LOGO}<h1>Set up Allocation Desk</h1>
      <p class="muted">Nobody has signed in yet. The first account becomes the <b>editor</b>: the person who uploads reports and approves orders. You add everyone else afterwards.</p>
      ${msg ? `<p class="note bad">${esc(msg)}</p>` : ''}
      <form id="setup" class="stack">
        <label class="f">Your name<input type="text" name="name" required></label>
        ${signedIn ? '' : `<label class="f">Email<input type="email" name="email" autocomplete="username" required></label>
        <label class="f">Choose a password (8 characters or more)<input type="password" name="password" minlength="8" autocomplete="new-password" required></label>`}
        <button class="btn primary" style="width:100%">Create the editor account</button>
      </form>`);
    $('#setup').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, b = $('button', f); b.disabled = true; b.textContent = 'Setting up ...';
      try {
        if (!signedIn) {
          const { data, error } = await A.sb.auth.signUp({ email: f.email.value.trim(), password: f.password.value });
          if (error) throw new Error(A.nice(error));
          if (!data.session) throw new Error('Supabase is waiting for an email confirmation. In Supabase open Authentication > Sign In / Providers > Email, switch "Confirm email" off, save, then try again.');
        }
        await A.rpc('bootstrap', { p_name: f.name.value.trim() });
        enter();
      } catch (err) { screenSetup(signedIn || !!(await A.sb.auth.getSession()).data.session, err.message); }
    };
  }
  function screenNoAccess(email) {
    authPage(`${LOGO}<h1>No access yet</h1><p>You are signed in as <b>${esc(email || '')}</b>, but this account is not on the team list.</p>
      <p class="muted">Ask the editor to add you from Data > Team, then sign in again.</p>
      <button class="btn" data-act="signout">Sign out</button>`);
  }
  async function boot() {
    if (!A.ready || !R || !window.fflate) return screenConfig();
    const { data } = await A.sb.auth.getSession();
    if (!data.session) return screenLogin();
    enter();
  }
  async function enter() {
    app.innerHTML = '<div class="center"><div class="spinner"></div></div>';
    try {
      S.me = await A.rpc('me');
      if (!S.me) {
        const { data } = await A.sb.auth.getUser();
        if (!(await A.rpc('has_members'))) return screenSetup(true);
        return screenNoAccess(data && data.user && data.user.email);
      }
      await reload();
      startPolling();
    } catch (e) {
      if (e.oldDb) return screenOldDb();
      if (/sign-in has expired|sign in/i.test(e.message)) { await A.sb.auth.signOut().catch(() => {}); return screenLogin(e.message); }
      authPage(`${LOGO}<h1>Allocation Desk</h1><p class="note bad">${esc(e.message)}</p><button class="btn" data-act="retry">Try again</button>`);
    }
  }

  /* ================= data in / refresh ================= */
  async function reload() {
    const snap = await A.rpc('snapshot');
    if ((snap.schema || 1) < NEED_SCHEMA) { const e = new Error('The database needs the newer setup script.'); e.oldDb = true; throw e; }
    if (snap.me) S.me = snap.me;
    S.M = C.build(snap); S.lastSync = new Date(); S.stale = false; S.online = true;
    if (S.o.sel && !S.M.byId[S.o.sel]) S.o.sel = null;
    S.o.checked.forEach((id) => { if (!S.M.byId[id]) S.o.checked.delete(id); });
    S.o.detail = null;
    render();
  }
  let poller = null;
  function startPolling() {
    if (poller) return;
    const every = (A.cfg.pollSeconds || 20) * 1000;
    const check = async () => {
      if (document.hidden || S.busy || !S.M) return;
      try {
        const rev = await A.rpc('rev');
        S.online = true;
        if (rev !== S.M.rev) {
          const el = document.activeElement;
          const typing = el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.id !== 'oq' && el.id !== 'cq';
          if (typing || $('#modal').children.length) { S.stale = true; syncLabel(); } else await reload();
        } else syncLabel();
      } catch (e) { S.online = false; syncLabel(); }
    };
    poller = setInterval(check, every);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('focus', check);
  }
  function syncText() {
    if (!S.online) return 'Offline - showing the last data';
    if (S.stale) return 'New data - tap to update';
    return S.lastSync ? 'Updated ' + when(S.lastSync).slice(7) : '';
  }
  function syncLabel() { $$('[data-sync]').forEach((e) => { e.textContent = syncText(); }); }
  async function run(fn, okMsg) {                    // do one change, then show fresh data
    if (S.busy) return;
    S.busy = true;
    try {
      const r = await fn();
      await reload();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    } catch (e) {
      await tell('Not done', e.message);
      try { await reload(); } catch (_) { /* keep what is on screen */ }
    } finally { S.busy = false; }
  }

  /* ================= frame ================= */
  const stockLine = (M) => (M.meta.stock_asof ? 'DC stock as of ' + when(M.meta.stock_asof) : 'No DC stock report loaded');
  function render() {
    if (!S.M) return;
    const keep = {};
    $$('[data-keep]').forEach((e) => { keep[e.dataset.keep] = e.scrollTop; });
    const y = window.scrollY, M = S.M;
    const views = { dashboard: vDashboard, orders: vOrders, shortages: vShortages, catalogue: vCatalogue, data: vData };
    const role = editor() ? '' : '<span class="pill view">VIEW ONLY</span>';
    app.innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand">Allocation Desk</div><div class="brandsub">CORPORATE ORDERS</div>
        ${role ? `<div style="margin-bottom:10px">${role}</div>` : ''}
        <input type="search" id="find" placeholder="Find any article ..." aria-label="Find article">
        ${NAV.map(([k, t]) => `<button class="nav ${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${ICON[k]}${t}</button>`).join('')}
        <div class="foot">${stockLine(M)}<br>${inr(M.lines.length)} order lines<br>
          ${esc(S.me.name || S.me.email)} (${editor() ? 'editor' : 'viewer'})<br><span data-sync data-act="refresh" style="cursor:pointer">${esc(syncText())}</span></div>
      </aside>
      <div class="topbar"><span class="brand">Allocation Desk</span>${role}<span class="grow"></span><span class="sync" data-sync data-act="refresh">${esc(syncText())}</span></div>
      <main data-keep="main">${views[S.view]()}</main>
      <nav class="tabs">${NAV.map(([k, t]) => `<button class="${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${ICON[k]}${t}</button>`).join('')}</nav>
    </div>`;
    $$('[data-keep]').forEach((e) => { if (keep[e.dataset.keep]) e.scrollTop = keep[e.dataset.keep]; });
    window.scrollTo(0, y);
    hydrate();
    if (S.view === 'orders' && S.o.sel && !S.o.detail) loadDetail();
    if (S.view === 'orders') packPreview();
    if (S.view === 'shortages') tally();
    if (S.view === 'catalogue' && S.c.scope === 'all') searchAll();
  }
  const setHtml = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };

  /* ================= Dashboard ================= */
  /* Value at MRP, value at the price wanted, the discount that is, and the margin left after it.
     qf(line) = the quantity to count for that line. */
  function money(lines, qf) {
    let mrpV = 0, val = 0, net = 0, cost = 0, noCost = 0;
    for (const l of lines) {
      const q = qf(l); if (!q) continue;
      mrpV += q * l.mrp; val += q * l.req_price;
      const a = S.M.articles[l.article_code];
      if (a && Number(a.cost) > 0 && a.gst != null) { net += q * l.req_price / (1 + Number(a.gst)); cost += q * Number(a.cost); } else noCost++;
    }
    return { mrpV, val, disc: mrpV ? 1 - val / mrpV : null, margin: net ? (net - cost) / net : null, marginRs: net - cost, noCost };
  }
  const FLAGS = {
    LATE: ['Delivery date at risk', (l) => l.late],
    SOON: ['Allocate today or tomorrow', (l) => l.tight],
    BELOW: ['Price below MRP', (l) => !l.price_missing && l.discount != null && l.discount > 0.0005],
    NOPRICE: ['Price not given (MRP used)', (l) => !!l.price_missing],
    OUTSIDE: ['Not in the Diwali range', (l) => !l.in_master],
    INACTIVE: ['In-Active article', (l) => l.art_status === 'In-Active'],
    SAP: ['SAP quantity changed', (l) => l.sap_new_qty != null]
  };
  function vDashboard() {
    const M = S.M, lines = M.lines, hasStock = !!M.meta.stock_asof;
    const sub = hasStock ? `DC stock as of ${when(M.meta.stock_asof)} (${esc(M.meta.stock_file || '')})` : 'No DC stock report loaded yet';
    if (!lines.length && !Object.keys(M.articles).length) {
      return `<div class="head"><h1>Dashboard</h1></div><div class="card stack"><h2>Nothing loaded yet</h2>
        <p class="muted">${editor() ? 'Go to Data and load the test data, or upload your Diwali article master, DC stock report and orders.' : 'The editor has not loaded any data yet. This screen fills in by itself once they do.'}</p>
        ${editor() ? '<div><button class="btn primary" data-act="nav" data-view="data">Open Data</button></div>' : ''}</div>`;
    }
    const by = {}; C.STATUS_ORDER.forEach((s) => { by[s] = lines.filter((l) => l.status === s); });
    const live = lines.filter((l) => l.status !== 'REJECTED');
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const req = sum(live, (l) => l.req_qty), appr = sum(live, (l) => l.approved);
    const asked = money(live, (l) => l.req_qty), given = money(live, (l) => l.approved);
    const tile = (cls, t, v, s) => `<div class="tile ${cls}"><h3>${t}</h3><b class="${String(v).length > 9 ? 'long' : ''}">${v}</b><span>${s}</span></div>`;
    const tiles = [
      tile('lilac', 'Order lines', inr(lines.length), `${inr(new Set(lines.map((l) => l.order_no)).size)} orders, ${new Set(lines.map((l) => l.store_code)).size} stores`),
      tile('peach', 'Pending', inr(by.PENDING.length), `${inr(sum(by.PENDING, (l) => l.balance))} pcs waiting`),
      tile('butter', 'Awaiting store', inr(by.AWAITING.length), `${inr(sum(lines, (l) => l.offered))} pcs of alternates held`),
      tile('mint', 'Approved', inr(by.APPROVED.length + by.PARTIAL.length), `${by.PARTIAL.length} partly approved`),
      tile('sky', 'Dispatched', inr(by.DISPATCHED.length), `${inr(sum(lines, (l) => l.dispatched))} pcs sent`),
      tile('pink', 'Rejected', inr(by.REJECTED.length), `${inr(sum(by.REJECTED, (l) => l.req_qty))} pcs`),
      tile('lilac', 'Value approved', rupees(given.val), `of ${rupees(asked.val)} ordered`),
      tile('mint', 'Margin after discount', pct(given.margin), given.disc == null ? 'nothing approved yet' : `${pct(given.disc)} average discount given`)].join('');
    const items = [];
    const go = (label, o) => `<button class="btn sm" data-act="go" data-view="${(o && o.view) || 'orders'}" data-status="${(o && o.status) || ''}" data-flag="${(o && o.flag) || ''}">${label}</button>`;
    const cnt = (k) => lines.filter(FLAGS[k][1]).length;
    if (!hasStock && lines.length) items.push(['bad', 'No DC stock report is loaded, so free stock shows as zero', editor() ? go('Upload', { view: 'data' }) : '']);
    if (cnt('SAP')) items.push(['warn', `${inr(cnt('SAP'))} ${plural(cnt('SAP'), 'line')}: quantity changed in SAP after import`, go('Review', { flag: 'SAP' })]);
    if (cnt('LATE')) items.push(['bad', `${inr(cnt('LATE'))} ${plural(cnt('LATE'), 'line')} can no longer reach the store by the date it asked for (lead time)`, go('Open', { flag: 'LATE' })]);
    if (cnt('SOON')) items.push(['warn', `${inr(cnt('SOON'))} ${plural(cnt('SOON'), 'line')} must be allocated today or tomorrow to arrive on time`, go('Open', { flag: 'SOON' })]);
    if (by.AWAITING.length) {
      const hrs = M.oldestOffer ? (Date.now() - new Date(M.oldestOffer)) / 3600e3 : 0;
      items.push(['warn', `${inr(by.AWAITING.length)} ${plural(by.AWAITING.length, 'line')} awaiting store reply on alternates (${hrs >= 1 ? 'oldest asked ' + Math.round(hrs) + ' h ago' : 'asked within the last hour'})`, go('Open', { status: 'AWAITING' })]);
    }
    const short = hasStock ? Object.entries(M.pos).filter(([, p]) => p.pending > Math.max(p.free, 0)) : [];
    if (short.length) items.push(['bad', `${inr(short.length)} ${plural(short.length, 'article')} where stores want more than the DC has free`, go(editor() ? 'Split stock' : 'Open', { view: 'shortages' })]);
    if (hasStock) Object.entries(M.pos).filter(([, p]) => p.free < 0).slice(0, 4).forEach(([c, p]) =>
      items.push(['bad', `Over-committed: ${esc(c)} ${esc((M.articles[c] || {}).description || '')} - ${inr(p.reserved)} promised, ${inr(p.dc)} at DC in the latest report`,
        `<button class="btn sm" data-act="go" data-view="orders" data-q="${esc(c)}">Open</button>`]));
    const ready = lines.filter((l) => l.approved_open > 0);
    if (ready.length) items.push(['good', `${inr(ready.length)} ${plural(ready.length, 'line')} approved and waiting for dispatch (${inr(sum(ready, (l) => l.approved_open))} pcs)`, go('Open', { status: 'APPROVED' })]);
    if (by.PENDING.length) items.push(['', `${inr(by.PENDING.length)} ${plural(by.PENDING.length, 'line')} not looked at yet`, go('Open', { status: 'PENDING' })]);
    const open = (k) => lines.filter((l) => FLAGS[k][1](l) && l.balance > 0).length;
    if (open('NOPRICE')) items.push(['', `${inr(open('NOPRICE'))} open ${plural(open('NOPRICE'), 'line')} came without a price - MRP was used`, go('Open', { flag: 'NOPRICE' })]);
    if (open('INACTIVE')) items.push(['warn', `${inr(open('INACTIVE'))} open ${plural(open('INACTIVE'), 'line')} on In-Active articles`, go('Open', { flag: 'INACTIVE' })]);
    if (open('OUTSIDE')) items.push(['', `${inr(open('OUTSIDE'))} open ${plural(open('OUTSIDE'), 'line')} on articles outside the Diwali range`, go('Open', { flag: 'OUTSIDE' })]);
    if (hasStock) {
      const age = (Date.now() - new Date(M.meta.stock_asof)) / 3600e3;
      if (age > 12) items.push(['warn', `DC stock report is ${Math.round(age)} hours old`, editor() ? go('Upload new', { view: 'data' }) : '']);
    }
    const parts = [['Approved, at DC', sum(live, (l) => l.approved_open), '#7FDDB5'], ['Dispatched', sum(live, (l) => l.dispatched), '#8EC5FF'],
      ['Offered as alternate', sum(live, (l) => l.offered), '#FFC98A'], ['Balance still open', sum(live, (l) => l.balance), '#C9C2EA'],
      ['Balance closed', sum(live.filter((l) => l.balance_closed), (l) => l.open_qty), '#FF9DBB']];
    /* discount and margin */
    const mrow = (name, m) => `<tr><td>${name}</td><td class="right">${inr(m.mrpV)}</td><td class="right b">${inr(m.val)}</td>
      <td class="right ${m.disc > 0.0005 ? 'warn b' : ''}">${pct(m.disc)}</td><td class="right b">${pct(m.margin)}</td><td class="right">${inr(m.marginRs)}</td></tr>`;
    const pend = money(live, (l) => l.balance);
    const moneyCard = `<div class="card stack"><h2>Discount given and margin after it</h2>
      <div class="tablewrap"><table><thead><tr><th></th><th class="right">At MRP</th><th class="right">At price wanted</th><th class="right">Discount</th><th class="right">Margin %</th><th class="right">Margin Rs</th></tr></thead><tbody>
      ${mrow('Ordered', asked)}${mrow('Approved so far', given)}${mrow('Still open', pend)}</tbody></table></div>
      <p class="small">Values in rupees, rejected lines left out. Margin = (price without GST - cost) / price without GST, on the cost of the ordered article.${asked.noCost ? ` ${asked.noCost} ${plural(asked.noCost, 'line')} left out of the margin because the article has no cost on file.` : ''}</p></div>`;
    /* by buyer */
    const buyers = {};
    for (const l of lines) { const k = l.buyer || '(buyer not set)'; (buyers[k] = buyers[k] || []).push(l); }
    const brow = Object.keys(buyers).sort().map((k) => {
      const ls = buyers[k], lv = ls.filter((l) => l.status !== 'REJECTED'), a = money(lv, (l) => l.req_qty), g = money(lv, (l) => l.approved);
      const need = ls.filter((l) => NEEDS.includes(l.status)).length;
      return `<tr class="pick" data-act="go" data-view="orders" data-buyer="${esc(l0(k))}"><td>${esc(k)}</td><td class="right">${inr(ls.length)}</td><td class="right ${need ? 'b' : 'muted'}">${need ? inr(need) : '-'}</td>
        <td class="right">${rupees(a.val)}</td><td class="right">${rupees(g.val)}</td><td class="right">${pct(a.disc)}</td><td class="right">${pct(g.margin == null ? a.margin : g.margin)}</td></tr>`;
    }).join('');
    const buyerCard = Object.keys(buyers).length > 1 || !buyers['(buyer not set)'] ? `<div class="card stack"><h2>By buyer</h2>
      <div class="tablewrap"><table><thead><tr><th>Buyer</th><th class="right">Lines</th><th class="right">Need action</th><th class="right">Value ordered</th><th class="right">Value approved</th><th class="right">Discount asked</th><th class="right">Margin</th></tr></thead><tbody>${brow}</tbody></table></div></div>` : '';
    short.sort((a, b) => (b[1].pending - Math.max(b[1].free, 0)) - (a[1].pending - Math.max(a[1].free, 0)));
    const altFree = (arr) => arr.reduce((t, a) => t + Math.max(0, C.freeOf(M, a.article_code)), 0);
    const shortRows = short.slice(0, 8).map(([c, p]) => {
      const gap = p.pending - Math.max(p.free, 0), al = C.alternates(M, c), sf = altFree(al.same), df = altFree(al.diff);
      return `<tr class="pick" data-act="shortOpen" data-code="${esc(c)}"><td>${esc(c)}</td><td class="w">${esc((M.articles[c] || {}).description || '')}</td>
        <td class="right">${inr(Math.max(p.free, 0))}</td><td class="right">${p.n_stores}</td><td class="right">${inr(p.pending)}</td>
        <td class="right bad b">${inr(gap)}</td><td class="right">${inr(sf)}</td><td class="right">${inr(df)}</td><td class="right">${sf + df >= gap ? 'Yes' : sf + df ? 'Partly' : 'No'}</td></tr>`;
    }).join('');
    return `<div class="head"><h1>Dashboard</h1><span class="sub">${sub}</span></div>
      <div class="tiles">${tiles}</div>
      <div class="grid2">
        <div class="card stack"><h2>Needs attention</h2>
          ${items.length ? items.map(([tone, text, btn]) => `<div class="attn"><div class="note ${tone || 'info'}">${text}</div>${btn}</div>`).join('') : '<div class="note good">Nothing needs attention.</div>'}</div>
        <div class="stack"><div class="card stack"><h2>Where the ordered quantity stands</h2><div class="bars">
          ${parts.map(([n, q, col]) => `<span>${n}</span><div class="bar"><i style="width:${req ? Math.min(100, q / req * 100) : 0}%;background:${col}"></i></div><b class="right">${inr(q)}</b><span class="small right">${req ? Math.round(q / req * 100) : 0}%</span>`).join('')}
        </div><p class="small">${inr(appr)} of ${inr(req)} pcs approved (${req ? Math.round(appr / req * 100) : 0}%). Approved quantities are in full packs, so they can be a little above what was asked.</p></div>${moneyCard}</div>
      </div>
      ${buyerCard ? `<div style="margin-top:12px">${buyerCard}</div>` : ''}
      <div class="card stack" style="margin-top:12px"><div class="row"><h2 class="grow">Biggest shortages</h2><button class="btn sm" data-act="nav" data-view="shortages">Open Shortages</button></div>
        ${short.length ? `<div class="tablewrap"><table><thead><tr><th>Article</th><th>Description</th><th class="right">DC free</th><th class="right">Stores waiting</th>
          <th class="right">Pending demand</th><th class="right">Short by</th><th class="right">Free in same design</th><th class="right">Free in other designs</th><th class="right">Covered by alternates?</th></tr></thead><tbody>${shortRows}</tbody></table></div>`
        : `<div class="note ${hasStock ? 'good' : 'info'}">${hasStock ? 'No article is short right now.' : 'Shortages appear once a DC stock report is loaded.'}</div>`}</div>`;
  }
  const l0 = (k) => (k === '(buyer not set)' ? '-' : k);

  /* ================= Orders ================= */
  const NEEDS = ['PENDING', 'AWAITING', 'PARTIAL'];
  function ordersFiltered() {
    const o = S.o, words = o.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const flag = o.flag && FLAGS[o.flag] ? FLAGS[o.flag][1] : null;
    let rows = S.M.lines.filter((l) => {
      if (o.status === 'NEEDS' && !NEEDS.includes(l.status)) return false;
      if (o.status && o.status !== 'NEEDS' && l.status !== o.status) return false;
      if (flag && !flag(l)) return false;
      if (o.store && l.store_code !== o.store) return false;
      if (o.mc && l.mc_name !== o.mc) return false;
      if (o.buyer && (l.buyer || '-') !== o.buyer) return false;
      if (words.length) {
        const hay = [l.order_no, l.store_code, l.store_name, l.city, l.state, l.article_code, l.description, l.customer, l.mc_name, l.poc_name, l.phone, l.supplied].join(' ').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (o.sort) {
      const free = (l) => C.freeOf(S.M, l.article_code), nz = (v) => (v == null ? -9 : v);
      const key = { order: (l) => l.order_no + '/' + String(l.line_no).padStart(12, '0'), article: (l) => l.description.toLowerCase(),
        req: (l) => l.req_qty, appr: (l) => l.approved, bal: (l) => l.balance, free, status: (l) => C.STATUS_ORDER.indexOf(l.status),
        price: (l) => +l.req_price, disc: (l) => nz(l.discount), margin: (l) => nz(l.margin), del: (l) => l.allocate_by || l.del_date || '9999' }[o.sort];
      rows = rows.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * o.dir; });
    }
    return rows;
  }
  function noteOf(l) {
    if (l.sap_new_qty != null) return `<span class="warn">SAP qty now ${inr(l.sap_new_qty)}</span>`;
    if (l.status === 'REJECTED') return esc(l.reject_reason || '');
    if (l.offered) return `${inr(l.offered)} pcs of alternate offered`;
    if (l.supplied && l.supplied !== l.article_code) return 'Given in ' + esc(l.supplied);
    if (l.balance_closed && l.open_qty) return `Balance ${inr(l.open_qty)} closed`;
    return '';
  }
  const priceCell = (l) => `<b>${inr(l.req_price)}</b><div class="small">${l.price_missing ? 'not given' : 'MRP ' + inr(l.mrp)}${l.discount > 0.0005 ? ` <span class="warn ltxl">-${pct(l.discount, 0)}</span>` : ''}</div>`;
  const discCell = (l) => (l.discount > 0.0005 ? `<span class="warn b">${pct(l.discount)}</span>` : '<span class="muted">-</span>');
  function delCell(l) {
    if (!l.del_date) return '<span class="muted">-</span>';
    const tone = l.late ? 'bad b' : l.tight ? 'warn b' : '';
    return `<span class="${tone}">${when(l.del_date)}</span>${l.allocate_by ? `<div class="small ${l.late ? 'bad' : ''}">${l.late ? 'late by ' + (-l.days_left) + ' d' : 'allocate by ' + when(l.allocate_by)}</div>` : ''}`;
  }
  function oListHtml() {
    const rows = ordersFiltered(), M = S.M, o = S.o, shown = rows.slice(0, o.limit), ed = editor();
    const sum = (f) => rows.reduce((t, l) => t + f(l), 0);
    setTimeout(() => setHtml('osum', `${inr(rows.length)} of ${inr(M.lines.length)} lines &nbsp;|&nbsp; ${inr(sum((l) => l.req_qty))} pcs required &nbsp;|&nbsp; ${inr(sum((l) => l.approved))} approved &nbsp;|&nbsp; ${inr(sum((l) => l.balance))} balance &nbsp;|&nbsp; ${rupees(sum((l) => l.ask_value))}`), 0);
    if (!rows.length) return `<div class="empty card">${M.lines.length ? 'No order lines match these filters.' : 'No orders loaded yet.'}</div>`;
    const more = rows.length > shown.length ? `<button class="btn more" data-act="more">Show more (${inr(rows.length - shown.length)} hidden)</button>` : '';
    const dash = (n) => (n ? inr(n) : '-');
    if (S.wide) {
      const th = (k, t, r, cls) => `<th class="${r ? 'right' : ''} ${cls || ''}" data-act="sort" data-key="${k}" style="cursor:pointer">${t}${o.sort === k ? (o.dir > 0 ? ' &#9650;' : ' &#9660;') : ''}</th>`;
      return `<div class="tablewrap" data-keep="otable"><table class="otable"><thead><tr>${ed ? '<th><input type="checkbox" data-act="chkAll" aria-label="Select all"></th>' : ''}
        ${th('order', 'Order / store')}${th('article', 'Article')}${th('req', 'Req', 1)}${th('appr', 'Appr', 1)}
        ${th('bal', 'Bal', 1)}${th('free', 'DC free', 1)}${th('status', 'Status')}${th('price', 'Price', 1)}${th('disc', 'Disc.', 1, 'xl')}${th('margin', 'Margin', 1, 'xl')}${th('del', 'Deliver by', 0, 'xl')}</tr></thead><tbody>
        ${shown.map((l) => {
          const free = C.freeOf(M, l.article_code), short = l.balance > 0 && free < l.balance, note = noteOf(l);
          return `<tr class="pick ${o.sel === l.id ? 'sel' : ''}" data-act="sel" data-id="${l.id}">
            ${ed ? `<td><input type="checkbox" data-act="chk" data-id="${l.id}" ${o.checked.has(l.id) ? 'checked' : ''} aria-label="Select line"></td>` : ''}
            <td title="${esc(l.store_name + (l.city ? ', ' + l.city : ''))}"><b>${esc(ref(l))}</b><div class="small">${esc(l.store_code)} &middot; ${when(l.order_date)}</div></td>
            <td class="art" title="${esc(l.description)}"><div class="clip">${esc(l.description || '(article details not on file)')}</div><div class="small clip">${esc(l.article_code)} &middot; ${esc(l.mc_name)}</div></td>
            <td class="right b">${inr(l.req_qty)}</td><td class="right ${l.approved ? 'good b' : 'muted'}">${dash(l.approved)}</td>
            <td class="right">${dash(l.balance)}</td><td class="right ${short ? 'bad b' : ''}">${inr(free)}</td>
            <td>${pill(l.status)}${note ? `<div class="small clip" style="max-width:150px" title="${esc(note.replace(/<[^>]+>/g, ''))}">${note}</div>` : ''}</td>
            <td class="right">${priceCell(l)}</td><td class="right xl">${discCell(l)}</td><td class="right xl">${pct(l.margin)}</td><td class="xl">${delCell(l)}</td></tr>`;
        }).join('')}</tbody></table>${more}</div>`;
    }
    return shown.map((l) => {
      const free = C.freeOf(M, l.article_code), short = l.balance > 0 && free < l.balance, note = noteOf(l);
      return `<div class="ocard ${o.sel === l.id ? 'sel' : ''}" data-act="sel" data-id="${l.id}">${thumb(l.article_code, 's')}
        <div class="grow"><div class="row"><b class="grow">${esc(ref(l))}</b>${pill(l.status)}</div>
        <div>${esc(l.description)} <span class="muted">${esc(l.article_code)}</span></div>
        <div class="small">${esc(l.store_code)} ${esc(l.store_name)} &middot; ${when(l.order_date)}${l.del_date ? ` &middot; <span class="${l.late ? 'bad' : l.tight ? 'warn' : ''}">wants ${when(l.del_date)}</span>` : ''}</div>
        <div class="nums"><span>Req <b>${inr(l.req_qty)}</b></span><span>Appr <b class="${l.approved ? 'good' : ''}">${dash(l.approved)}</b></span>
          <span>Bal <b>${dash(l.balance)}</b></span><span>DC free <b class="${short ? 'bad' : ''}">${inr(free)}</b></span>
          <span>Price <b>${inr(l.req_price)}</b>${l.discount > 0.0005 ? ` <span class="warn">-${pct(l.discount)}</span>` : ''}</span></div>
        ${note ? `<div class="small">${note}</div>` : ''}</div></div>`;
    }).join('') + more;
  }
  function vOrders() {
    const o = S.o, M = S.M;
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`;
    const stores = Array.from(new Set(M.lines.map((l) => l.store_code))).sort();
    const mcs = Array.from(new Set(M.lines.map((l) => l.mc_name).filter(Boolean))).sort();
    const buyers = Array.from(new Set(M.lines.map((l) => l.buyer || '-'))).sort();
    const bulk = editor() && S.wide ? `<span class="grow"></span><button class="btn sm" data-act="bulkApprove" title="Approves the full balance of every ticked line where the DC has enough free stock, rounded up to full packs">Approve ticked in full</button>
      <button class="btn sm" data-act="bulkDispatch">Mark ticked dispatched</button><button class="btn sm danger" data-act="bulkReject">Reject ticked ...</button>` : '';
    const detail = `<div id="odetail" class="detail ${!S.wide && o.sel ? 'sheetpage' : ''}" data-keep="odetail" ${!S.wide && !o.sel ? 'hidden' : ''}>${oDetailHtml()}</div>`;
    return `<div class="head"><h1>Orders</h1><span class="sub" id="osum"></span>${bulk}</div>
      <div class="toolbar six">
        <input type="search" id="oq" class="wide" placeholder="Search order, store, article, customer, contact ..." value="${esc(o.q)}" aria-label="Search orders">
        <select id="ostatus" aria-label="Status">${opt('', 'All statuses', o.status)}${opt('NEEDS', 'Needs action', o.status)}${C.STATUS_ORDER.map((s) => opt(s, C.STATUS_LABEL[s], o.status)).join('')}</select>
        <select id="oflag" aria-label="Flag">${opt('', 'Any flag', o.flag)}${Object.keys(FLAGS).map((k) => opt(k, FLAGS[k][0], o.flag)).join('')}</select>
        <select id="ostore" aria-label="Store">${opt('', 'All stores', o.store)}${stores.map((s) => opt(s, s + '  ' + ((M.stores[s] || {}).store_name || ''), o.store)).join('')}</select>
        <select id="omc" aria-label="MC">${opt('', 'All MCs', o.mc)}${mcs.map((m) => opt(m, m, o.mc)).join('')}</select>
        <select id="obuyer" aria-label="Buyer">${opt('', 'All buyers', o.buyer)}${buyers.map((b) => opt(b, b === '-' ? '(buyer not set)' : b, o.buyer)).join('')}</select>
      </div>
      <div class="panes"><div id="olist">${oListHtml()}</div>${detail}</div>`;
  }
  async function loadDetail() {
    const id = S.o.sel;
    try {
      const d = await A.rpc('line_detail', { p_line: id });
      if (S.o.sel !== id) return;
      S.o.detail = d;
      const el = document.getElementById('odetail');
      if (el) {                                                     // keep whatever was typed in the quantity boxes
        const y = el.scrollTop, typed = {};
        $$('input.qty', el).forEach((i) => { if (i.value !== i.defaultValue) typed[i.id || i.dataset.art] = i.value; });
        el.innerHTML = oDetailHtml(); el.scrollTop = y;
        $$('input.qty', el).forEach((i) => { const k = i.id || i.dataset.art; if (k in typed) i.value = typed[k]; });
        hydrate(); packPreview();
      }
    } catch (e) { /* the panel keeps its loading note; the next refresh retries */ }
  }
  const locChips = (loc) => `<div class="chips">${C.LOCATIONS.filter(([k]) => loc[k] || k === 'v').map(([k, t]) => `<span class="chip">${t} <b>${inr(loc[k])}</b></span>`).join('')}</div>`;
  function deliveryNote(l) {
    if (!l.del_date) return '';
    if (l.lead_time == null) return `<div class="note info">Store wants delivery by <b>${when(l.del_date)}</b>. The lead time for this store is not on file.</div>`;
    const base = `Store wants delivery by <b>${when(l.del_date)}</b>. Lead time ${l.lead_time} ${plural(l.lead_time, 'day')}${l.dc ? ' from ' + esc(l.dc) : ''}, so allocate by <b>${when(l.allocate_by)}</b>`;
    if (l.late) return `<div class="note bad">${base} - that was ${-l.days_left} ${plural(-l.days_left, 'day')} ago. If allocated today it reaches about ${when(C.addDays(C.today(), l.lead_time))}.</div>`;
    if (l.tight) return `<div class="note warn">${base} - that is ${l.days_left === 0 ? 'today' : 'tomorrow'}.</div>`;
    return `<div class="note info">${base}${l.balance > 0 ? ` (${l.days_left} days from now)` : ''}.</div>`;
  }
  function altSection(title, hint, alts, l, canAct) {
    if (!alts.length) return '';
    const M = S.M;
    return `<div class="altsec"><h3>${title}</h3><div class="small">${hint}</div></div>
      <div class="alt"><span></span><span class="h">Article</span><span class="h right">DC free</span><span class="h right">${canAct ? 'Qty' : ''}</span>
      ${alts.map((a) => {
        const af = C.freeOf(M, a.article_code), pk = C.packOf(a), max = Math.max(0, Math.min(C.floorPack(af, pk), C.roundPack(l.open_qty, pk)));
        const mg = C.marginAt(l.req_price, a.gst, a.cost), mrpDiff = Number(a.mrp) !== Number(l.mrp);
        return `${thumb(a.article_code, 's', true)}<div><b>${esc(a.article_code)}</b> ${a.status === 'In-Active' ? '<span class="badge bad">In-Active</span>' : ''}<br>${esc(a.description)}
            <div class="small"><span class="${mrpDiff ? 'warn b' : ''}">MRP ${inr(a.mrp)}</span> &middot; pack of ${pk}${mg == null ? '' : ' &middot; margin ' + pct(mg)}</div></div>
          <b class="right ${af >= pk ? 'good' : 'bad'}">${inr(af)}</b>
          ${canAct ? `<input class="qty altq" style="width:78px" type="number" inputmode="numeric" min="0" max="${max}" step="1" value="" placeholder="0" data-art="${esc(a.article_code)}" data-pack="${pk}" ${max ? '' : 'disabled'} aria-label="Quantity of ${esc(a.article_code)}">` : '<span></span>'}`;
      }).join('')}</div>`;
  }
  function oDetailHtml() {
    const M = S.M, l = S.o.sel && M.byId[S.o.sel], ed = editor();
    if (!l) return `<div class="card stack"><h2>Select an order line</h2><p class="muted">Price, margin, DC stock by location, alternates${ed ? ' and the approval box' : ''} for the selected line appear here.</p></div>`;
    const d = S.o.detail && S.o.detail.id === l.id ? S.o.detail : null;
    const a = M.articles[l.article_code] || {};
    const p = M.pos[l.article_code] || { dc: 0, loc: {}, reserved: 0, free: 0, pending: 0, n_stores: 0 };
    const free = p.free, pack = l.pack, out = [];
    const tel = (l.phone || '').replace(/\D/g, '');
    const contact = [l.poc_name ? esc(l.poc_name) : '', tel ? `<a href="tel:${esc(tel)}">${esc(l.phone)}</a>` : '', l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ''].filter(Boolean).join(' &middot; ');
    const badges = [a.status === 'In-Active' ? '<span class="badge bad">In-Active article</span>' : '', l.in_master ? '' : '<span class="badge">Not in the Diwali range</span>'].join('');
    out.push(`<div class="back"><button class="btn" data-act="unsel">&#8249; Orders</button></div>`);
    out.push(`<div class="card stack">
      <div class="row"><h2 class="grow">Order ${esc(ref(l))}</h2>${pill(l.status)}</div>
      <div class="small"><b>${esc(l.store_code)} ${esc(l.store_name)}</b>${l.city ? ', ' + esc(l.city) : ''}${l.state ? ', ' + esc(l.state) : ''}${l.customer ? ' &nbsp;|&nbsp; ' + esc(l.customer) : ''} &nbsp;|&nbsp; booked ${when(l.order_date)}</div>
      ${contact ? `<div class="small">Contact: ${contact}</div>` : ''}
      <div class="row top">${thumb(l.article_code, 'l', true)}<div class="grow"><h2>${esc(l.description || '(article details not on file)')}</h2>
        <div class="small">${esc(l.article_code)} &nbsp;|&nbsp; ${esc(l.mc_name || '-')}${l.buyer ? ' &nbsp;|&nbsp; ' + esc(l.buyer) : ''}${l.category ? ' &nbsp;|&nbsp; ' + esc(l.category) : ''}</div>
        <div class="small">Pack of ${pack}${a.vendor_name ? ' &nbsp;|&nbsp; ' + esc(a.vendor_name) : ''}</div>${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}</div></div>
      <div class="stats">${stat('MRP', inr(l.mrp))}${stat(l.price_missing ? 'Price (MRP used)' : 'Price wanted', inr(l.req_price))}${stat('Discount', l.discount > 0.0005 ? pct(l.discount) : 'None', l.discount > 0.0005 ? 'warn' : '')}${stat('Margin', pct(l.margin), l.margin != null && l.margin < 0 ? 'bad' : '')}</div>
      <div class="small">${l.margin == null ? 'Margin cannot be worked out: cost or GST for this article is not on file.' : `${l.price_missing ? 'The store gave no price, so MRP is used. ' : ''}Margin after this discount is ${pct(l.margin)}; at ${Number(a.vrp) > 0 && Number(a.vrp) !== Number(l.mrp) ? 'VRP ' + inr(a.vrp) : 'MRP'} it would be ${pct(l.base_margin)}. Order value ${rupees(l.ask_value)}${l.approved ? ', approved ' + rupees(l.value) : ''}.`}</div>
      <div class="stats">${stat('Required', inr(l.req_qty))}${stat('Approved', inr(l.approved), l.approved ? 'good' : '')}${stat('Offered', inr(l.offered), l.offered ? 'warn' : '')}${stat('Balance', inr(l.balance), l.balance ? 'bad' : '')}</div>
      ${deliveryNote(l)}</div>`);
    if (l.sap_new_qty != null) {
      out.push(`<div class="card stack"><div class="note warn">SAP now shows ${inr(l.sap_new_qty)} pcs for this line; the tracker has ${inr(l.req_qty)}. Nothing was changed automatically.</div>
        ${ed ? `<div class="row"><button class="btn primary" data-act="sapAccept">Use ${inr(l.sap_new_qty)}</button><button class="btn" data-act="sapDismiss">Keep ${inr(l.req_qty)}</button></div>` : ''}</div>`);
    }
    const others = p.pending - l.balance;
    let shortNote = '';
    if (!M.meta.stock_asof) shortNote = '<div class="note warn">No DC stock report is loaded, so nothing can be approved yet.</div>';
    else if (l.balance > 0 && p.pending > Math.max(free, 0)) {
      shortNote = `<div class="note bad">Short: ${p.n_stores} ${p.n_stores !== 1 ? 'stores are' : 'store is'} waiting for ${inr(p.pending)} pcs of this article and only ${inr(Math.max(free, 0))} are free${others > 0 ? ` (${inr(others)} pcs asked by other stores)` : ''}.</div>`;
    } else if (l.balance > 0 && others > 0) {
      shortNote = `<div class="note good">${inr(others)} pcs more are waiting on other stores' orders; free stock covers all of it.</div>`;
    }
    const canAct = ed && l.status !== 'REJECTED' && l.open_qty > 0;
    const maxOpen = C.roundPack(l.open_qty, pack), freePk = C.floorPack(free, pack), top = Math.max(0, Math.min(maxOpen, freePk));
    const dflt = maxOpen <= freePk ? l.open_qty : top;
    const ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0);
    out.push(`<div class="card stack"><h3>DC stock of the ordered article</h3>
      <div class="stats">${stat('Total at DC', inr(p.dc))}${stat('Promised', inr(p.reserved))}${stat('Free now', inr(free), free >= pack ? 'good' : 'bad')}${stat('Pending PO', ppo ? inr(ppo) : '-')}</div>
      ${p.dc ? locChips(p.loc) : ''}
      ${shortNote}
      ${canAct ? `<div class="row wrap"><span>Approve qty</span><input class="qty" id="ap-qty" type="number" inputmode="numeric" min="0" max="${top}" value="${dflt || ''}" data-pack="${pack}" ${top ? '' : 'disabled'} aria-label="Quantity to approve">
        <button class="btn primary" data-act="approve" ${top ? '' : 'disabled'}>Approve</button><span class="small" id="ap-prev"></span></div>
        <div class="small">${top ? `${inr(l.open_qty)} pcs open. Whatever is approved is rounded up to full packs of ${pack}.` : (free > 0 ? `Only ${inr(free)} pcs free - less than one pack of ${pack}. Use an alternate below.` : 'No free stock - use an alternate below.')}</div>` : ''}</div>`);
    const alts = C.alternates(M, l.article_code);
    if (alts.same.length || alts.diff.length) {
      const freeIn = (arr) => arr.reduce((t, x) => t + Math.max(0, C.freeOf(M, x.article_code)), 0);
      out.push(`<div class="card stack"><div class="row"><h2 class="grow">Alternates</h2><span class="small">${inr(freeIn(alts.same) + freeIn(alts.diff))} pcs free in ${alts.same.length + alts.diff.length}</span></div>
        ${altSection('Same design', 'Other colour or vendor of the same model', alts.same, l, canAct)}
        ${altSection('Same price, different design', 'Another model at the same MRP', alts.diff, l, canAct)}
        ${canAct ? `<div class="small" id="alt-prev"></div>
          <div class="row wrap" style="justify-content:flex-end"><button class="btn" data-act="approveAlts" title="The article is changed within this order: use when the store has already agreed">Approve alternates</button>
          <button class="btn primary" data-act="offer" title="Holds the quantities and prepares the message to the store">Offer to store and hold stock</button></div>
          <div class="right"><button class="btn link" data-act="reject" data-reorder="1">Or reject this line and ask the store to reorder in an alternate ...</button></div>` : ''}</div>`);
    } else if (canAct && l.in_master === false) {
      out.push(`<div class="card"><div class="small">No alternates are listed for this article (alternate groups come from the Diwali article master).</div></div>`);
    }
    const allocs = d ? d.allocations.filter((x) => x.state !== 'CANCELLED') : null;
    const acts = [];
    if (ed) {
      if (l.approved_open > 0) acts.push('<button class="btn" data-act="dispatch" title="Use when the allocation team has sent the stock, so it is not deducted again after the next stock report">Mark dispatched</button>');
      if (l.status === 'PARTIAL') acts.push('<button class="btn" data-act="closeBal" title="The remaining quantity will not be supplied">Close balance</button>');
      if (l.status === 'REJECTED') acts.push('<button class="btn" data-act="reopen">Reopen</button>');
      else if (l.dispatched === 0) acts.push('<button class="btn danger" data-act="reject">Reject line ...</button>');
      if (l.balance_closed) acts.push('<button class="btn" data-act="reopen">Reopen balance</button>');
    }
    out.push(`<div class="card stack"><h3>Approved on this line</h3>
      ${!allocs ? '<div class="muted">Loading ...</div>' : !allocs.length ? '<div class="muted">Nothing yet.</div>' : allocs.map((x) => {
        const kind = x.article_code === l.article_code ? 'ordered article' : 'alternate';
        const rounded = x.entered_qty != null && x.entered_qty !== x.qty ? ` <span class="small">(${inr(x.entered_qty)} asked, rounded up to full packs)</span>` : '';
        let b = '';
        if (ed && x.state === 'OFFERED') b = `<button class="btn sm primary" data-act="confirmOffer" data-alloc="${x.id}">Store confirmed</button><button class="btn sm" data-act="declineOffer" data-alloc="${x.id}">Store declined</button><button class="btn link" data-act="remsg">Message again</button>`;
        else if (ed && x.state === 'APPROVED') b = `<button class="btn link" data-act="undo" data-alloc="${x.id}">Cancel approval</button>`;
        else if (ed) b = `<button class="btn link" data-act="undo" data-alloc="${x.id}">Undo dispatch</button>`;
        return `<div class="alloc">${pill(x.state)}<div class="grow"><b>${inr(x.qty)} pcs</b> of ${esc(x.article_code)} ${esc((artOf(x.article_code) || {}).description || '')}${rounded}
          <span class="muted">(${kind}, ${when(x.created_at)}, ${esc(x.created_by || '')})</span>${b ? `<div class="row wrap" style="margin-top:6px">${b}</div>` : ''}</div></div>`;
      }).join('')}
      ${l.status === 'REJECTED' ? `<div class="note bad">Rejected: ${esc(l.reject_reason || 'no reason given')}</div>` : ''}
      ${acts.length ? `<div class="row wrap">${acts.join('')}</div>` : ''}</div>`);
    if (d && d.events.length) {
      out.push(`<div class="card stack"><h3>History</h3><div class="hist">${d.events.map((e) =>
        `<div><span class="muted">${when(e.ts)} ${esc(e.user_name || '')}</span> <b>${esc(e.action.charAt(0) + e.action.slice(1).toLowerCase())}</b> ${esc(e.detail || '')}</div>`).join('')}</div></div>`);
    }
    return out.join('');
  }
  /* What the typed quantities become once rounded up to full packs. */
  function packPreview() {
    const i = $('#ap-qty'), el = $('#ap-prev');
    if (i && el) {
      const q = Math.round(+i.value || 0), pk = +i.dataset.pack || 1, f = C.roundPack(q, pk), max = +i.max || 0;
      el.innerHTML = !q ? '' : f > max ? `<span class="bad">${inr(f)} pcs is more than can be approved (${inr(max)})</span>`
        : pk > 1 ? `= <b>${inr(f)} pcs</b> to the store (${inr(f / pk)} ${plural(f / pk, 'pack')} of ${pk})` : '';
    }
    const ap = $('#alt-prev');
    if (ap) {
      const bits = $$('.altq').map((x) => { const q = Math.round(+x.value || 0), pk = +x.dataset.pack || 1; return q ? [x.dataset.art, q, C.roundPack(q, pk), pk, +x.max || 0] : null; }).filter(Boolean);
      ap.innerHTML = bits.map(([c, q, f, pk, max]) => (f > max ? `<span class="bad">${esc(c)}: ${inr(f)} pcs is more than can be given (${inr(max)})</span>`
        : `${esc(c)}: <b>${inr(f)} pcs</b>${f !== q ? ` (${inr(q)} rounded up to ${inr(f / pk)} ${plural(f / pk, 'pack')} of ${pk})` : ''}`)).join('<br>');
    }
  }

  /* ================= Shortages ================= */
  function shortRows() {
    const M = S.M, q = S.s.q.trim().toLowerCase();
    return Object.entries(M.pos).map(([c, p]) => ({ c, p, a: M.articles[c] || {}, gap: p.pending - Math.max(p.free, 0) }))
      .filter((r) => r.p.pending > 0 && (!S.s.only || r.gap > 0))
      .filter((r) => !q || (r.c + ' ' + (r.a.description || '') + ' ' + (r.a.mc_name || '') + ' ' + (r.a.buyer || '')).toLowerCase().includes(q))
      .sort((x, y) => y.gap - x.gap);
  }
  const altFreeOf = (arr) => arr.reduce((t, a) => t + Math.max(0, C.freeOf(S.M, a.article_code)), 0);
  function vShortages() {
    const M = S.M, rows = shortRows();
    if (S.wide && (!S.s.art || !rows.some((r) => r.c === S.s.art))) S.s.art = rows.length ? rows[0].c : null;
    if (S.s.art && !M.pos[S.s.art]) S.s.art = null;
    let list;
    if (!M.meta.stock_asof) list = '<div class="empty card">Shortages appear once a DC stock report is loaded.</div>';
    else if (!rows.length) list = `<div class="empty card">${S.s.only ? 'No article is short. Every pending order line can be covered from free DC stock.' : 'No pending demand.'}</div>`;
    else if (S.wide) {
      list = `<div class="tablewrap"><table class="twoline"><thead><tr><th>Article</th><th>Description</th><th>Buyer</th><th class="right">Pack</th><th class="right">At DC</th><th class="right">Promised</th>
        <th class="right">Free</th><th class="right">Demand</th><th class="right">Stores</th><th class="right">Short by</th><th class="right">Free in<br>same design</th><th class="right">Free in<br>other designs</th></tr></thead><tbody>
        ${rows.map(({ c, p, a, gap }) => { const al = C.alternates(M, c), sf = altFreeOf(al.same), df = altFreeOf(al.diff);
          return `<tr class="pick ${S.s.art === c ? 'sel' : ''}" data-act="shortSel" data-code="${esc(c)}"><td>${esc(c)}</td><td class="w">${esc(a.description || '')}</td>
          <td>${esc(a.buyer || '')}</td><td class="right">${C.packOf(a)}</td><td class="right">${inr(p.dc)}</td><td class="right">${p.reserved ? inr(p.reserved) : '-'}</td><td class="right b ${p.free > 0 ? 'good' : 'bad'}">${inr(p.free)}</td>
          <td class="right b">${inr(p.pending)}</td><td class="right">${p.n_stores}</td><td class="right b ${gap > 0 ? 'bad' : 'muted'}">${gap > 0 ? inr(gap) : '-'}</td>
          <td class="right ${sf ? 'good' : 'muted'}">${inr(sf)}</td><td class="right ${df ? 'good' : 'muted'}">${inr(df)}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else {
      list = rows.map(({ c, p, a, gap }) => `<div class="ocard" data-act="shortSel" data-code="${esc(c)}">${thumb(c, 's')}<div class="grow">
        <div class="row"><b class="grow">${esc(a.description || c)}</b>${gap > 0 ? `<span class="pill REJECTED">Short ${inr(gap)}</span>` : ''}</div>
        <div class="small">${esc(c)} &middot; ${p.n_stores} ${plural(p.n_stores, 'store')} waiting</div>
        <div class="nums"><span>Free <b class="${p.free > 0 ? 'good' : 'bad'}">${inr(p.free)}</b></span><span>Demand <b>${inr(p.pending)}</b></span><span>In alternates <b>${inr(altFreeOf(C.allAlternates(M, c)))}</b></span></div></div></div>`).join('');
    }
    const detail = `<div id="sdetail" class="${!S.wide && S.s.art ? 'sheetpage' : ''}" ${!S.wide && !S.s.art ? 'hidden' : ''}>${sDetailHtml()}</div>`;
    return `<div class="head"><h1>Shortages</h1><span class="sub">Articles that several stores are waiting for${editor() ? ' - split the free stock here' : ''}</span></div>
      <div class="toolbar two"><input type="search" id="sq" placeholder="Search article, MC or buyer ..." value="${esc(S.s.q)}" aria-label="Search shortages">
        <label class="row" style="min-height:38px"><input type="checkbox" id="sonly" ${S.s.only ? 'checked' : ''}> Only articles that are short</label></div>
      <div class="vpanes"><div data-keep="slist">${list}</div>${detail}</div>`;
  }
  function sDetailHtml() {
    const M = S.M, c = S.s.art, ed = editor();
    if (!c) return '';
    const a = M.articles[c] || {}, p = M.pos[c], free = Math.max(p.free, 0), pack = C.packOf(a);
    const waiting = M.lines.filter((l) => l.article_code === c && l.balance > 0);
    const al = C.alternates(M, c);
    const names = (arr) => arr.map((m) => `${esc(m.description)} (${esc(m.article_code)}): <b>${inr(Math.max(0, C.freeOf(M, m.article_code)))}</b>`).join(', ');
    const q = (l) => (S.s.qty[l.id] || '');
    const input = (l) => `<input class="qty sq" type="number" inputmode="numeric" min="0" max="${Math.min(C.roundPack(l.balance, pack), C.floorPack(free, pack))}" step="${pack}" value="${q(l)}" placeholder="0" data-id="${l.id}" aria-label="Allocate to ${esc(l.store_code)}">`;
    let body;
    const hasCust = waiting.some((l) => l.customer);
    if (S.wide) {
      body = `<div class="tablewrap"><table><thead><tr><th>Order</th><th>Booked</th><th>Deliver by</th><th>Store</th>${hasCust ? '<th>Customer</th>' : ''}<th class="right">Price</th><th class="right">Disc.</th><th class="right">Required</th>
        <th class="right">Approved</th><th class="right">Balance</th>${ed ? '<th class="right">Allocate now</th>' : ''}</tr></thead><tbody>
        ${waiting.map((l) => `<tr><td>${esc(ref(l))}</td><td>${when(l.order_date)}</td><td>${delCell(l)}</td><td>${esc(l.store_code)} ${esc(l.store_name)}</td>${hasCust ? `<td>${esc(l.customer)}</td>` : ''}
          <td class="right">${inr(l.req_price)}</td><td class="right">${discCell(l)}</td><td class="right">${inr(l.req_qty)}</td><td class="right">${l.approved ? inr(l.approved) : '-'}</td><td class="right b">${inr(l.balance)}</td>
          ${ed ? `<td class="right">${input(l)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    } else {
      body = waiting.map((l) => `<div class="ocard" style="cursor:default"><div class="grow"><div class="row"><b class="grow">${esc(l.store_code)} ${esc(l.store_name)}</b><span>Balance <b>${inr(l.balance)}</b></span></div>
        <div class="small">${esc(ref(l))} &middot; ${when(l.order_date)}${l.customer ? ' &middot; ' + esc(l.customer) : ''}${l.del_date ? ' &middot; wants ' + when(l.del_date) : ''}</div>
        ${ed ? `<div class="row" style="margin-top:6px"><span class="grow small">Allocate now</span>${input(l)}</div>` : ''}</div></div>`).join('');
    }
    return `<div class="back"><button class="btn" data-act="shortUnsel">&#8249; Shortages</button></div>
      <div class="card stack"><div class="row top">${thumb(c, 'm', true)}<div class="grow"><h2>${esc(a.description || '')} (${esc(c)})</h2>
        <div class="small">Pack of ${pack}${a.buyer ? ' &nbsp;|&nbsp; ' + esc(a.buyer) : ''}</div>
        ${al.same.length ? `<div>Same design, free at DC - ${names(al.same)}</div>` : ''}${al.diff.length ? `<div>Same price, other design - ${names(al.diff)}</div>` : ''}${!al.same.length && !al.diff.length ? '<div class="muted">No alternates listed.</div>' : ''}
        ${ed ? '<div class="small">Give each store its share below, in full packs. Lines left short stay open so alternates can be offered from the Orders screen.</div>' : ''}</div></div>
      <div class="stats">${stat('Total at DC', inr(p.dc))}${stat('Promised', inr(p.reserved))}${stat('Free now', inr(p.free), p.free > 0 ? 'good' : 'bad')}${stat('Pending demand', inr(p.pending), p.pending > free ? 'bad' : '')}</div>
      ${p.dc ? locChips(p.loc) : ''}
      ${body}
      ${ed ? `<div class="row wrap"><span>Fill:</span><button class="btn sm" data-act="fill" data-m="fifo">Oldest order first</button><button class="btn sm" data-act="fill" data-m="prorata">Share in proportion</button>
        <button class="btn sm" data-act="fill" data-m="">Clear</button><span class="grow"></span><span id="stally"></span><button class="btn primary" id="sapply" data-act="applySplit">Approve these quantities</button></div>` : ''}</div>`;
  }
  function tally() {
    const el = document.getElementById('stally'); if (!el || !S.s.art) return;
    const free = Math.max(S.M.pos[S.s.art].free, 0), pack = C.packOf(S.M.articles[S.s.art]);
    const total = Object.values(S.s.qty).reduce((t, v) => t + C.roundPack(+v || 0, pack), 0), over = total > free;
    el.innerHTML = `<span class="${over ? 'bad' : 'good'}">Allocating <b>${inr(total)}</b> of <b>${inr(free)}</b> free${pack > 1 ? ' (full packs of ' + pack + ')' : ''} - ${over ? inr(total - free) + ' too many' : inr(free - total) + ' left'}</span>`;
    const b = document.getElementById('sapply'); if (b) b.disabled = !total || over;
  }

  /* ================= Articles ================= */
  function catRows() {
    const words = S.c.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const inScope = S.c.scope === 'ordered' ? (a) => !a.in_master : (a) => a.in_master;
    return Object.values(S.M.articles).filter((a) => inScope(a) && (!S.c.cat || (a.category || '') === S.c.cat) &&
      words.every((w) => [a.article_code, a.description, a.mc_name, a.category, a.buyer, a.vendor_name, a.group_same, a.group_diff].join(' ').toLowerCase().includes(w)));
  }
  function cCard(a, free) {
    const tags = [a.status === 'In-Active' ? '<span class="badge bad">In-Active</span>' : '', a.in_master ? '' : '<span class="badge">Not in Diwali range</span>'].join(' ');
    return `<div class="ccard" data-act="art" data-code="${esc(a.article_code)}">${thumb(a.article_code, '')}
      <b>${esc(a.article_code)}</b><div class="d">${esc(a.description)}</div><div class="small">Free <b class="${free > 0 ? 'good' : 'bad'}">${inr(free)}</b> &nbsp;|&nbsp; Rs ${inr(a.mrp)}</div>${tags ? `<div style="margin-top:3px">${tags}</div>` : ''}</div>`;
  }
  function cGridHtml() {
    const M = S.M, c = S.c;
    if (c.scope === 'all') {
      const total = M.counts.articles || 0;
      if (c.q.trim().length < 2) { setTimeout(() => setHtml('csum', `${inr(total)} articles on file`), 0); return `<div class="empty card">Type at least 2 letters or digits to search all ${inr(total)} articles - by code, name, MC, category, buyer or vendor.</div>`; }
      if (!c.results || c.asked !== c.q.trim()) return '<div class="empty card">Searching ...</div>';
      setTimeout(() => setHtml('csum', `${c.results.length}${c.results.length >= 120 ? '+' : ''} found in ${inr(total)} articles`), 0);
      if (!c.results.length) return '<div class="empty card">No article matches. Check the code, or load the full article data on the Data screen.</div>';
      return `<div class="cgrid">${c.results.map((a) => cCard(a, (a.dc || 0) - (a.reserved || 0))).join('')}</div>`;
    }
    const rows = catRows(), n = Object.values(M.articles).filter((a) => (c.scope === 'ordered') === !a.in_master).length;
    setTimeout(() => setHtml('csum', `${inr(rows.length)} of ${inr(n)} articles ${c.scope === 'ordered' ? 'ordered from outside the Diwali range' : 'in the Diwali range'}`), 0);
    if (!rows.length) return `<div class="empty card">${n ? 'No article matches here.' : (c.scope === 'ordered' ? 'No article outside the Diwali range has been ordered.' : 'The Diwali article master is not loaded yet.')}${(M.counts.articles || 0) > n ? ' <button class="btn sm" data-act="scopeAll">Search all articles</button>' : ''}</div>`;
    return `<div class="cgrid">${rows.slice(0, 600).map((a) => cCard(a, C.freeOf(M, a.article_code))).join('')}</div>`;
  }
  let searchTimer = null;
  function searchAll() {                             // looks the words up among every article on the server
    const q = S.c.q.trim();
    clearTimeout(searchTimer);
    if (S.c.scope !== 'all' || q.length < 2 || S.c.asked === q) return;
    searchTimer = setTimeout(async () => {
      try {
        const res = await A.rpc('article_search', { p_q: q, p_limit: 120 });
        if (S.c.q.trim() !== q) return;
        res.forEach((a) => { if (!S.M.articles[a.article_code]) S.extra[a.article_code] = a; });
        S.c.results = res; S.c.asked = q;
      } catch (e) { S.c.results = []; S.c.asked = q; }
      setHtml('cgrid', cGridHtml()); hydrate();
    }, 300);
  }
  function vCatalogue() {
    const M = S.M, cats = Array.from(new Set(Object.values(M.articles).filter((a) => (S.c.scope === 'ordered') === !a.in_master).map((a) => a.category).filter(Boolean))).sort();
    return `<div class="head"><h1>Articles</h1><span class="sub" id="csum"></span></div>
      <div class="toolbar three"><input type="search" id="cq" class="wide" placeholder="Type an article code, name, MC, buyer or vendor ..." value="${esc(S.c.q)}" aria-label="Search articles">
        <select id="cscope" aria-label="Which articles"><option value="master" ${S.c.scope === 'master' ? 'selected' : ''}>Diwali range (${inr(M.counts.master || 0)})</option><option value="ordered" ${S.c.scope === 'ordered' ? 'selected' : ''}>Ordered, outside the range (${inr(Object.values(M.articles).filter((a) => !a.in_master).length)})</option><option value="all" ${S.c.scope === 'all' ? 'selected' : ''}>All articles on file (${inr(M.counts.articles || 0)})</option></select>
        <select id="ccat" aria-label="Category" ${S.c.scope === 'all' ? 'disabled' : ''}><option value="">All categories</option>${cats.map((g) => `<option ${S.c.cat === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <p class="small" style="margin:-4px 0 10px">Open any article for its picture, DC stock by location, alternates and a deal check (discount and margin).</p>
      <div id="cgrid">${cGridHtml()}</div>`;
  }

  /* ----- one article: details, stock by location, alternates, deal check ----- */
  let artPop = null, deal = null;
  async function openArticle(code) {
    if (artPop) artPop.close();
    artPop = pop(`<div class="row"><div class="spinner"></div><span class="muted">Opening ${esc(code)} ...</span></div>`, 'big');
    const me = artPop;
    me.addEventListener('click', (e) => { if (e.target === me) me.close(); });
    let d;
    try { d = await A.rpc('article_detail', { p_article: code }); } catch (e) { d = null; }
    if (artPop !== me || !me.isConnected) return;
    const M = S.M, a = (d && d.article) || M.articles[code];
    if (!a) { $('.pop', me).innerHTML = `<h2>Article ${esc(code)}</h2><p>This article is not in the Diwali article master or the full article data.</p><div class="actions"><button class="btn" data-act="closePop">Close</button></div>`; return; }
    if (!M.articles[code]) S.extra[code] = a;
    const sites = (d && d.sites) || [], sumOf = (k) => sites.reduce((t, s) => t + (s[k] || 0), 0);
    const dc = sumOf('total'), reserved = d ? d.reserved : 0, free = dc - reserved, pack = C.packOf(a);
    const mp = M.pos[code] || { pending: 0, n_stores: 0 };
    const al = C.alternates(M, code), ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0);
    const locs = C.LOCATIONS.filter(([k]) => k === 'v' || sumOf(k));
    const kv = (k, v) => (v === '' || v == null ? '' : `<span>${k}</span><b>${v}</b>`);
    const strip = (title, arr) => (arr.length ? `<h3>${title}</h3><div class="strip">${arr.map((m) => { const f = C.freeOf(M, m.article_code);
      return `<div data-act="art" data-code="${esc(m.article_code)}">${thumb(m.article_code, '')}<div class="small">${esc(m.article_code)}</div><b class="${f > 0 ? 'good' : 'bad'}">Free ${inr(f)}</b></div>`; }).join('')}</div>` : '');
    const baseM = C.marginAt(a.mrp, a.gst, a.cost);
    deal = { a, free, pack, altCount: al.same.length + al.diff.length, ppo };
    $('.pop', me).innerHTML = `<div class="artgrid"><div>${thumb(code, 'bigimg')}
        <div class="row wrap" style="margin-top:10px">${a.image_path ? `<button class="btn sm" data-act="imgSave" data-code="${esc(code)}">Save image</button>${navigator.share ? `<button class="btn sm" data-act="imgShare" data-code="${esc(code)}">Share image</button>` : ''}` : ''}
          ${editor() ? `<button class="btn sm" data-act="imgChange" data-code="${esc(code)}">${a.image_path ? 'Change image ...' : 'Add image ...'}</button>` : ''}</div></div>
      <div class="stack"><div class="row top"><h1 class="grow" style="font-size:20px">${esc(a.description || code)}</h1><button class="btn sm" data-act="closePop">Close</button></div>
        <div>${a.status === 'In-Active' ? '<span class="badge bad">In-Active</span> ' : a.status ? '<span class="badge good">Active</span> ' : ''}${a.in_master ? '<span class="badge good">Diwali range</span>' : '<span class="badge">Not in the Diwali range</span>'}</div>
        <div class="kv">${kv('Article', esc(code))}${kv('MC', esc([a.mc_code, a.mc_name].filter(Boolean).join(' - ')))}${kv('Category', esc(a.category))}${kv('Buyer', esc(a.buyer))}
          ${kv('Vendor', esc([a.vendor_code, a.vendor_name].filter(Boolean).join(' - ')))}${kv('MRP', rupees(a.mrp))}${kv('VRP', a.vrp == null ? '' : rupees(a.vrp))}${kv('Cost', a.cost == null ? '' : 'Rs ' + Number(a.cost).toFixed(2))}
          ${kv('GST', a.gst == null ? '' : pct(a.gst, 0))}${kv('Margin at MRP', baseM == null ? '' : pct(baseM))}${kv('Pack size', pack)}
          ${kv('Same design group', esc(a.group_same))}${kv('Same price group', esc(a.group_diff))}</div>
        <h3>DC stock</h3>
        <div class="stats">${stat('Total at DC', inr(dc))}${stat('Promised', inr(reserved))}${stat('Free now', inr(free), free >= pack ? 'good' : 'bad')}${stat('Pending PO', ppo ? inr(ppo) : '-')}</div>
        ${sites.length ? `<div class="tablewrap"><table class="twoline"><thead><tr><th>DC</th><th class="right">Total</th>${locs.map(([, t]) => `<th class="right">${t.replace(' (', '<br>(')}</th>`).join('')}</tr></thead><tbody>
          ${sites.map((s) => `<tr><td>${esc(s.site_code)}</td><td class="right b">${inr(s.total)}</td>${locs.map(([k]) => `<td class="right ${s[k] ? '' : 'muted'}">${s[k] ? inr(s[k]) : '-'}</td>`).join('')}</tr>`).join('')}
          ${sites.length > 1 ? `<tr><td class="b">All DCs</td><td class="right b">${inr(dc)}</td>${locs.map(([k]) => `<td class="right b">${sumOf(k) ? inr(sumOf(k)) : '-'}</td>`).join('')}</tr>` : ''}</tbody></table></div>`
          : `<div class="note info">${M.meta.stock_asof ? 'Not in the latest DC stock report.' : 'No DC stock report is loaded.'}</div>`}
        <div class="small">${mp.pending ? `${inr(mp.pending)} pcs still wanted by ${mp.n_stores} ${plural(mp.n_stores, 'store')}. ` : ''}${a.store_stock || a.intransit ? `From the article data sheet: ${inr(a.store_stock || 0)} pcs in stores, ${inr(a.intransit || 0)} in transit${ppo ? `, pending PO ${inr(a.ppo_cm || 0)} this month and ${inr(a.ppo_nm || 0)} next` : ''}.` : ''}</div>
        ${strip('Same design (tap to open)', al.same)}${strip('Same price, different design (tap to open)', al.diff)}
        <h3>Deal check</h3>
        <div class="dealgrid">
          <label class="f">Discount %<input type="number" id="dl-disc" min="0" max="99" step="0.5" value="0" inputmode="decimal"></label>
          <label class="f">Final price (Rs)<input type="number" id="dl-price" min="0" step="0.01" value="${Number(a.mrp) || ''}" inputmode="decimal"></label>
          <label class="f">Quantity<input type="number" id="dl-qty" min="0" step="${pack}" value="" placeholder="pcs" inputmode="numeric"></label>
          <label class="f">Store code<input type="text" id="dl-store" list="dl-stores" placeholder="optional" autocomplete="off"></label>
          <datalist id="dl-stores">${Object.values(M.stores).slice(0, 1500).map((s) => `<option value="${esc(s.store_code)}">${esc(s.store_name || '')}</option>`).join('')}</datalist>
        </div>
        <div id="dl-out" class="note info"></div>
      </div></div>`;
    hydrate(); dealCalc();
  }
  function dealCalc(from) {
    const out = $('#dl-out'); if (!out || !deal) return;
    const a = deal.a, mrp = Number(a.mrp) || 0, di = $('#dl-disc'), pi = $('#dl-price');
    if (from === 'disc' && mrp) pi.value = (Math.round(mrp * (1 - (+di.value || 0) / 100) * 100) / 100).toString();
    if (from === 'price' && mrp) di.value = (Math.round((1 - (+pi.value || 0) / mrp) * 1000) / 10).toString();
    const price = +pi.value || 0, qty = Math.round(+$('#dl-qty').value || 0), fq = C.roundPack(qty, deal.pack);
    const m = C.marginAt(price, a.gst, a.cost), base = C.marginAt(mrp, a.gst, a.cost), disc = C.discountOf(price, mrp);
    const net = a.gst == null ? null : price / (1 + Number(a.gst)), per = net != null && Number(a.cost) > 0 ? net - Number(a.cost) : null;
    const L = [];
    L.push(`Discount <b>${disc == null ? '-' : pct(Math.max(disc, 0))}</b>${disc != null && mrp ? ` (Rs ${inr(mrp - price)} off MRP ${inr(mrp)})` : ''}`);
    L.push(m == null ? 'Margin cannot be worked out: cost or GST is not on file for this article.'
      : `Margin after discount <b class="${m < 0 ? 'bad' : ''}">${pct(m)}</b> (Rs ${per.toFixed(2)} a piece)${base != null ? `; at MRP it is ${pct(base)}` : ''}`);
    if (qty) {
      L.push(`Quantity in full packs <b>${inr(fq)} pcs</b> (${inr(fq / deal.pack)} ${plural(fq / deal.pack, 'pack')} of ${deal.pack})`);
      L.push(`Deal value <b>${rupees(fq * price)}</b> (${(fq * price / 1e5).toFixed(2)} lakh)${per != null ? `, margin value ${rupees(fq * per)}` : ''}`);
      L.push(fq <= deal.free ? `<span class="good">DC free stock covers it (${inr(deal.free)} free)</span>`
        : `<span class="bad">DC is short by ${inr(fq - Math.max(deal.free, 0))} pcs (${inr(Math.max(deal.free, 0))} free)</span>${deal.altCount ? ` - ${deal.altCount} ${plural(deal.altCount, 'alternate')} listed above` : ''}${deal.ppo ? `, pending PO ${inr(deal.ppo)}` : ''}`);
    }
    const sc = C.code($('#dl-store').value).toUpperCase(), st = sc && S.M.stores[sc];
    if (sc) L.push(st ? `${esc(st.store_code)} ${esc(st.store_name || '')}${st.state ? ', ' + esc(st.state) : ''}: ${st.lead_time == null ? 'lead time not on file' : `lead time <b>${st.lead_time} ${plural(st.lead_time, 'day')}</b>${st.dc ? ' from ' + esc(st.dc) : ''} - allocated today, it reaches about ${when(C.addDays(C.today(), st.lead_time))}`}` : `Store ${esc(sc)} is not in the store list`);
    out.innerHTML = L.join('<br>');
  }
  async function imageBlob(code) {
    const a = artOf(code);
    await A.imageUrls([a]);
    const r = await fetch(A.cachedUrl(a));
    if (!r.ok) throw new Error('The image could not be downloaded.');
    return r.blob();
  }

  /* ================= Data ================= */
  function vData() {
    const M = S.M, ed = editor(), n = M.counts;
    const last = (prefix) => { const e = M.imports.find((x) => (x.detail || '').startsWith(prefix)); return e ? `<span class="small">Last loaded ${when(e.ts)}</span>` : '<span class="small warn">Not loaded yet</span>'; };
    const step = (title, text, btns, status) => `<div class="card step"><div class="row wrap"><h2 class="grow">${title}</h2>${btns}</div><p class="small">${text}</p>${status ? `<p>${status}</p>` : ''}</div>`;
    const b = (label, act, extra, cls) => `<button class="btn sm ${cls || ''}" data-act="${act}" ${extra || ''}>${label}</button>`;
    const left = [];
    if (ed) {
      left.push(step('1 &nbsp;Diwali article master', 'The gifting range: article, description, MC, category, buyer, MRP, VRP, cost, GST, pack size, vendor, and the two alternate columns (same model / different model). This file wins wherever it has a value.', b('Upload file ...', 'pick', 'data-kind="master"'), last('Diwali article master')));
      left.push(step('2 &nbsp;Article images', 'Pictures named by article code (1005107.jpg). They are made smaller and stored online for everyone. An article without a picture shows "Image not uploaded".', b('Choose pictures ...', 'pickImages') + (S.wide ? b('Choose a folder ...', 'pickFolder') : ''), last('Images')));
      left.push(step('3 &nbsp;Full article data (second file)', 'The complete article sheet (DSR article-wise). Used for any article that is ordered but is not in the Diwali master, and for status, pending PO and store stock of all articles. It never overwrites what the Diwali master says.', b('Upload file ...', 'pick', 'data-kind="data"'), last('Full article data')));
      left.push(step('4 &nbsp;Stores: emails and lead times', 'Store code, name, state, city, email and lead time (days from allocation to delivery). These can come from different files: upload each one, they are merged by store code.', b('Upload file ...', 'pick', 'data-kind="stores"'), last('Store list')));
      left.push(step('5 &nbsp;DC stock report', 'The SAP DC stock download. Total MSA quantity is the DC stock; the split by location (V01 & V02, NSO, HH reserved, special buy, best seller) is kept alongside. Upload a fresh one any time: approvals stay, free stock is recalculated.', b('Upload DC stock ...', 'pick', 'data-kind="stock"', 'primary'), last('DC stock')));
      left.push(step('6 &nbsp;Orders', 'Upload the order download as often as you like. Only order lines that are not already here are added; existing lines and their approvals are never overwritten. A missing or zero price is taken as MRP.', b('Upload orders ...', 'pick', 'data-kind="orders"', 'primary'), last('Orders')));
    }
    left.push(step('Export', 'Every order line in the layout of the order tracker (approved qty, final qty to store in full packs, order value, discount, margin, reject reason, who approved), plus allocations, stock by location and the activity log.', b('Export to Excel', 'export')));
    left.push(`<div class="card stack" id="teamcard"><div class="row"><h2 class="grow">Team</h2></div><div id="team" class="muted">Loading ...</div></div>`);
    left.push(step('Your account', `Signed in as ${esc(S.me.email)} (${ed ? 'editor' : 'view only'}).`, b('Change password', 'password') + b('Sign out', 'signout')));
    if (ed) left.push(step('Try it out', 'Loads an invented range in the same file layouts as your real reports: a Diwali master with both kinds of alternates, a larger article data sheet, stores with lead times, DC stock by location and a first batch of orders. "Clear everything" removes all articles, stock, orders and approvals (the team stays).', b('Load test data', 'testdata') + b('Clear everything ...', 'wipe', '', 'danger')));
    const log = M.imports.length ? M.imports.map((e) => `<div>${when(e.ts)}  ${esc(e.user_name || '')}\n${esc(e.detail)}</div>`).join('') : 'Nothing loaded yet.';
    setTimeout(loadTeam, 0);
    return `<div class="head"><h1>Data</h1><span class="sub">${inr(n.master || 0)} articles in the Diwali range, ${inr(n.articles || 0)} on file &nbsp;|&nbsp; ${inr(Object.keys(M.stores).length)} stores &nbsp;|&nbsp; ${inr(M.lines.length)} order lines &nbsp;|&nbsp; ${M.meta.stock_asof ? 'DC stock as of ' + when(M.meta.stock_asof) + (M.meta.stock_sites ? ' (' + esc(M.meta.stock_sites) + ')' : '') : 'no DC stock report yet'}</span></div>
      <div class="steps two"><div class="steps">${left.join('')}</div><div class="card stack"><h2>Activity: loads and changes to the team</h2><div class="log">${log}</div></div></div>`;
  }
  async function loadTeam() {
    const el = document.getElementById('team'); if (!el) return;
    let team;
    try { team = await A.rpc('team'); } catch (e) { el.textContent = e.message; return; }
    const ed = editor();
    el.className = 'team';
    el.innerHTML = team.map((m) => `<div class="m"><div class="grow"><b>${esc(m.name || m.email)}</b><div class="small">${esc(m.email)}</div></div>
      ${ed && m.user_id !== S.me.user_id ? `<select data-role="${m.user_id}" aria-label="Role of ${esc(m.email)}"><option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>View only</option><option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option></select>
        <button class="btn sm danger" data-act="teamRemove" data-user="${m.user_id}" data-email="${esc(m.email)}">Remove</button>` : pill(m.role === 'editor' ? 'APPROVED' : 'PENDING', m.role === 'editor' ? 'Editor' : 'View only')}</div>`).join('') +
      (ed ? `<form id="addmember" class="formgrid" style="margin-top:6px"><label class="f">Name<input type="text" name="name" required></label><label class="f">Email<input type="email" name="email" required></label>
        <label class="f">Access<select name="role"><option value="viewer">View only</option><option value="editor">Editor</option></select></label>
        <label class="f">First password<input type="text" name="password" minlength="8" required autocomplete="off"></label><button class="btn primary sm">Add person</button></form>
        <p class="small">You choose a first password and tell the person; they can change it after signing in. More than one editor is allowed: the database checks every approval against live stock.</p>` : '');
  }

  /* ---------- reading files ---------- */
  const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const TITLES = { master: 'Diwali article master', data: 'Full article data', stores: 'Stores', stock: 'DC stock report', orders: 'Orders' };
  const firstFew = (notes, n) => (notes.length ? '\n\n' + notes.slice(0, n).join('\n') + (notes.length > n ? `\n... and ${notes.length - n} more` : '') : '');

  async function importFile(kind, file, quiet) {
    const title = TITLES[kind], prog = progress('Reading ' + file.name + ' ...');
    await tick();
    let msg;
    try {
      const rd = await R.read(new Uint8Array(await file.arrayBuffer()), kind, XL);
      const rows = C.readTable(rd.rows2d, kind, rd.header);
      const where = rd.sheets.length > 1 ? `Sheet read: "${rd.sheet}"\n` : '';
      if (kind === 'master' || kind === 'data') {
        const shaped = C.shape.articles(rows, kind), parts = chunks(shaped, 1000);
        if (!shaped.length) throw new Error('No articles were found in this file.');
        let added = 0, updated = 0;
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Saving ${inr(Math.min((i + 1) * 1000, shaped.length))} of ${inr(shaped.length)} articles ...`);
          const r = await A.rpc('import_articles', { p_rows: parts[i], p_file: file.name, p_kind: kind, p_log: false });
          added += r.added; updated += r.updated;
        }
        await A.rpc('log_import', { p_detail: `${title} '${file.name}': added ${added}, updated ${updated}` });
        const n = (f) => shaped.filter(f).length;
        msg = `${where}Articles in the file: ${inr(shaped.length)}\nAdded: ${inr(added)}\nUpdated: ${inr(updated)}\n\n` + (kind === 'master'
          ? `In a "same design" group: ${n((r) => r.group_same)}\nIn a "same price, different design" group: ${n((r) => r.group_diff)}\nWithout any alternate group: ${n((r) => !r.group_same && !r.group_diff)}` +
            (n((r) => !r.pack_size) ? `\nWithout a pack size (taken as 1): ${n((r) => !r.pack_size)}` : '') + (n((r) => !r.cost) ? `\nWithout a cost (no margin can be shown): ${n((r) => !r.cost)}` : '')
          : `In-Active: ${inr(n((r) => r.status === 'In-Active'))}\nWithout a cost: ${inr(n((r) => !r.cost))}\n\nArticles that are in the Diwali master keep the master's values.`);
      } else if (kind === 'stores') {
        const shaped = C.shape.stores(rows); let added = 0, updated = 0;
        if (!shaped.length) throw new Error('No stores were found in this file.');
        for (const part of chunks(shaped, 2000)) { const r = await A.rpc('import_stores', { p_rows: part, p_file: file.name }); added += r.added; updated += r.updated; }
        const has = (f) => rows.fields.includes(f);
        msg = `${where}Stores in the file: ${inr(shaped.length)}\nAdded: ${inr(added)}\nUpdated: ${inr(updated)}\n\nThis file gave: ${[has('store_name') && 'store name', has('email') && 'email', has('lead_time') && 'lead time', has('dc') && 'DC / RDC', has('state') && 'state', has('city') && 'city'].filter(Boolean).join(', ')}` +
          (!has('email') ? '\n(No email column here - upload the file with store emails as well.)' : '') + (!has('lead_time') ? '\n(No lead time column here - upload the lead time file as well.)' : '');
      } else if (kind === 'orders') {
        const shaped = C.shape.orders(rows), parts = chunks(shaped, 1000);
        if (!shaped.length) throw new Error('No order lines were found in this file.');
        let added = 0, skipped = 0, flagged = 0, noPrice = 0, notes = [];
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Checking ${inr(Math.min((i + 1) * 1000, shaped.length))} of ${inr(shaped.length)} order lines ...`);
          const r = await A.rpc('import_orders', { p_rows: parts[i], p_file: file.name, p_log: false });
          added += r.added; skipped += r.skipped; flagged += r.flagged; noPrice += r.no_price || 0; notes = notes.concat(r.notes || []);
        }
        await A.rpc('log_import', { p_detail: `Orders '${file.name}': added ${added}, duplicates skipped ${skipped}, quantity changed in SAP ${flagged}` });
        const uniq = Array.from(new Set(notes.concat(shaped.repeats || [])));
        msg = `${where}Order lines in the file: ${inr(shaped.length + (shaped.repeats || []).length)}\nNew order lines added: ${inr(added)}\nAlready in the tracker (skipped): ${inr(skipped)}\nQuantity changed in SAP (flagged for review): ${inr(flagged)}` +
          (noPrice ? `\nNew lines without a price (MRP used): ${inr(noPrice)}` : '') + ((shaped.repeats || []).length ? `\nRepeated inside the file (first one taken): ${shaped.repeats.length}` : '') + firstFew(uniq, 12);
      } else {
        msg = await importStock(rows, rd, file, prog, quiet);
        if (msg === null) { prog.close(); return; }
        msg = where + msg;
      }
    } catch (e) { prog.close(); await reload().catch(() => {}); await tell(title + ' was not loaded', e.message); return false; }
    prog.close();
    await reload();
    if (!quiet) await tell(title, msg);
    return true;
  }
  async function importStock(rows, rd, file, prog, quiet) {
    const shaped = C.shape.stock(rows);
    if (!shaped.length) throw new Error('The DC stock report has no usable rows.');
    const sites = Array.from(new Set(shaped.map((r) => r.s))).sort(), arts = new Set(shaped.map((r) => r.a)).size, total = shaped.reduce((t, r) => t + r.t, 0);
    const hasLoc = ['v0102', 'v01', 'v02', 'nso', 'hh', 'spl', 'best'].some((f) => rows.fields.includes(f));
    let asof = new Date(file.lastModified || Date.now());
    if (!quiet) {
      const v = await ask('DC stock report', `<div class="stack">
        <p>${inr(arts)} articles, <b>${inr(total)} pcs</b> in total, DC ${esc(sites.join(', '))}.</p>
        ${rd.reportDate ? `<p class="small">The report itself is dated: <b>${esc(rd.reportDate)}</b></p>` : ''}
        ${hasLoc ? '' : '<p class="note warn">This file has no location columns (V01 & V02, NSO ...), so only the total will be shown.</p>'}
        <label class="f">When was this report downloaded from SAP?<input type="datetime-local" name="asof" value="${localInput(asof)}" required></label>
        <p class="small">Stock dispatched before this time is taken as already out of the report. Stock marked dispatched after it is still deducted.</p></div>`, 'Load DC stock');
      if (!v) return null;
      asof = new Date(v.asof);
      if (isNaN(asof)) throw new Error('The date and time could not be read.');
    }
    const batch = await A.rpc('stock_begin'), parts = chunks(shaped, 2000);
    for (let i = 0; i < parts.length; i++) {
      prog.set(`Sending ${inr(Math.min((i + 1) * 2000, shaped.length))} of ${inr(shaped.length)} stock rows ...`);
      await A.rpc('stock_chunk', { p_batch: batch, p_rows: parts[i] });
    }
    const r = await A.rpc('stock_commit', { p_batch: batch, p_asof: asof.toISOString(), p_file: file.name });
    const M = S.M, inFile = new Set(shaped.map((x) => x.a)), missing = Object.values(M.articles).filter((a) => a.in_master && !inFile.has(a.article_code)).length;
    return `Articles with DC stock: ${inr(r.articles)}\nTotal quantity: ${inr(r.total)} pcs\nDC: ${r.sites}` +
      (M.counts.master ? `\nDiwali-range articles not in this report (stock 0): ${missing} of ${M.counts.master}` : '') + firstFew(r.notes || [], 12);
  }
  async function shrink(file) {                       // picture -> JPEG no larger than 1000 px
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('could not convert'))), 'image/jpeg', 0.85));
  }
  async function importImages(files, quiet) {
    const pics = Array.from(files).filter((f) => /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
    if (!pics.length) return tell('Article images', 'No pictures were found in what you chose.');
    const prog = progress('Uploading pictures ...'), M = S.M;
    let matched = 0, done = 0; const notes = [];
    const queue = pics.slice();
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift(), m = f.name.match(/^[A-Za-z0-9]+/), c = m ? C.code(m[0]) : '';
        if (!M.articles[c]) notes.push(`${f.name}: no article ${c || ''} in the Diwali range or on an order`);
        else {
          try { await A.uploadImage(c, await shrink(f)); matched++; } catch (e) { notes.push(f.name + ': ' + e.message); }
        }
        prog.set(`${++done} of ${pics.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    try { await A.rpc('log_import', { p_detail: `Images: ${matched} matched, ${pics.length - matched} not matched` }); } catch (e) { /* log only */ }
    prog.close();
    await reload();
    const without = Object.values(S.M.articles).filter((a) => a.in_master && !a.image_path).length;
    if (!quiet) await tell('Article images', `Pictures matched to articles: ${matched}\nNot matched: ${pics.length - matched}\nDiwali-range articles still without a picture: ${without}` + firstFew(notes, 12));
  }
  async function loadTestData() {
    if (S.M.lines.length && !(await confirmBox('Load test data', 'There is already data in the tracker. Add the test data on top of it?', 'Add test data'))) return;
    const get = async (name) => {
      const r = await fetch('testdata/' + name);
      if (!r.ok) throw new Error('The test data file ' + name + ' is missing from the app folder.');
      return new File([await r.blob()], name, { lastModified: Date.now() - 60000 });
    };
    try {
      if ((await importFile('master', await get('1_Diwali_Article_Master.xlsx'), true)) === false) return;
      const list = await (await fetch('testdata/images/index.json')).json();
      const files = [];
      for (const n of list) files.push(await get('images/' + n).then((f) => new File([f], n)));
      await importImages(files, true);
      for (const [kind, name] of [['data', '2_Full_Article_Data.xlsx'], ['stores', '3_Store_Emails.xlsx'], ['stores', '4_Lead_Time.xlsx'], ['stock', '5_DC_Stock.xlsx'], ['orders', '6_Orders_Batch1.xlsx']]) {
        if ((await importFile(kind, await get(name), true)) === false) return;
      }
      await tell('Test data loaded', `${inr(S.M.counts.master)} articles in the Diwali range (${inr(S.M.counts.articles)} on file), ${inr(Object.keys(S.M.stores).length)} stores, ${inr(S.M.lines.length)} order lines.\n\nTo see duplicates being skipped, upload 7_Orders_Batch2.xlsx (in the testdata folder of the download) under Orders.`);
    } catch (e) { await tell('Test data was not loaded', e.message); }
  }
  async function exportExcel() {
    const prog = progress('Preparing the Excel file ...');
    try {
      const X = await XL(), M = S.M, ex = await A.rpc('export_data');
      const byLine = {};
      ex.allocations.forEach((a) => { (byLine[a.line_id] = byLine[a.line_id] || []).push(a); });
      const wb = X.utils.book_new();
      const sheet = (name, head, rows) => {
        const ws = X.utils.aoa_to_sheet([head].concat(rows));
        ws['!cols'] = head.map((h, i) => ({ wch: Math.min(45, Math.max(String(h).length, ...rows.slice(0, 300).map((r) => String(r[i] == null ? '' : r[i]).length)) + 2) }));
        if (rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
        X.utils.book_append_sheet(wb, ws, name);
      };
      const r1 = (x) => (x == null ? null : Math.round(x * 1000) / 10), locs = C.LOCATIONS;
      sheet('Order lines', ['Status', 'Store Code', 'Store Name', 'State', 'City', 'POC Name', 'Ph No.', 'Customer', 'Order ID', 'Line', 'Booking Date', 'Del Date', 'Buyer', 'Category',
        'MC Name', 'Art Code', 'Desc', 'In Diwali Range', 'Article Status', 'MRP', 'Price wanted', 'Price given by store', 'Discount %', 'Margin % after discount', 'Pk size', 'Qty Wanted',
        'Approved qty (as entered)', 'Final Qty to Store', 'Order Value', 'Supplied in article(s)', 'Alternate details', 'Offered (awaiting store)', 'Dispatched Qty', 'Balance Qty',
        'Remarks / reject reason', 'Approved by', 'Lead time (days)', 'DC / RDC', 'Allocate by', 'Delivery at risk', 'DC Stock (Total MSA)', 'DC Free Now'].concat(locs.map(([, t]) => t),
        ['SAP Qty Changed', 'New SAP Qty', 'Imported At', 'Source File']),
        M.lines.map((l) => {
          const mine = (byLine[l.id] || []).filter((a) => a.state !== 'OFFERED'), alt = mine.filter((a) => a.article_code !== l.article_code);
          const p = M.pos[l.article_code] || { loc: {} };
          return [C.STATUS_LABEL[l.status], l.store_code, l.store_name, l.state, l.city, l.poc_name, l.phone, l.customer, l.order_no, l.line_no === l.article_code ? '' : l.line_no, l.order_date, l.del_date || '',
            l.buyer, l.category, l.mc_name, l.article_code, l.description, l.in_master ? 'Yes' : 'No', l.art_status, +l.mrp, +l.req_price, l.price_missing ? 'No (MRP used)' : 'Yes',
            r1(l.discount), r1(l.margin), l.pack, l.req_qty, mine.reduce((t, a) => t + (a.entered_qty == null ? a.qty : a.entered_qty), 0), l.approved, l.value,
            l.supplied || '', alt.map((a) => a.article_code + ' x ' + a.qty).join(', '), l.offered, l.dispatched, l.balance,
            l.status === 'REJECTED' ? (l.reject_reason || '') : (l.balance_closed && l.open_qty ? 'Balance closed' : ''), ex.approvers[l.id] || '', l.lead_time, l.dc, l.allocate_by || '', l.late ? 'Yes' : '',
            p.dc || 0, p.free || 0].concat(locs.map(([k]) => p.loc[k] || 0), [l.sap_new_qty != null ? 'Yes' : '', l.sap_new_qty, when(l.imported_at), l.source_file]);
        }));
      sheet('Allocations', ['Order ID', 'Line', 'Store', 'Ordered Article', 'Allocated Article', 'Type', 'Qty entered', 'Qty in full packs', 'State', 'Created', 'By', 'Decided', 'Dispatched'],
        ex.allocations.map((a) => { const l = M.byId[a.line_id] || {};
          return [l.order_no, l.line_no === l.article_code ? '' : l.line_no, l.store_code, l.article_code, a.article_code, a.article_code === l.article_code ? 'Ordered article' : 'Alternate',
            a.entered_qty == null ? a.qty : a.entered_qty, a.qty, C.STATUS_LABEL[a.state], when(a.created_at), a.created_by, when(a.decided_at), when(a.dispatched_at)]; }));
      sheet('Stock position', ['Article', 'Description', 'MC Name', 'Buyer', 'Same design group', 'Same price group', 'MRP', 'Pack', 'DC Stock (Total MSA)'].concat(locs.map(([, t]) => t),
        ['Promised', 'DC Free', 'Pending Demand', 'Stores Waiting', 'Short By', 'Pending PO']),
        Object.keys(M.pos).sort().map((c) => { const p = M.pos[c], a = M.articles[c] || {};
          return [c, a.description, a.mc_name, a.buyer, a.group_same, a.group_diff, a.mrp == null ? null : +a.mrp, C.packOf(a), p.dc].concat(locs.map(([k]) => p.loc[k] || 0),
            [p.reserved, p.free, p.pending, p.n_stores, Math.max(0, p.pending - Math.max(p.free, 0)), (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0)]); }));
      sheet('Activity log', ['When', 'User', 'Order ID', 'Line', 'Action', 'Detail'], ex.events.map((e) => [when(e.ts), e.user_name, e.order_no, e.line_no, e.action, e.detail]));
      const d = new Date(), name = `Corporate_Orders_${String(d.getDate()).padStart(2, '0')}${when(d).slice(3, 6)}_${when(d).slice(7).replace(':', '')}.xlsx`;
      saveBlob(new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
      prog.close(); toast(`Exported ${inr(M.lines.length)} order lines`);
    } catch (e) { prog.close(); await tell('Export failed', e.message); }
  }

  /* ---------- the message to the store ----------
     Two kinds: an offer (alternates are held, the store must confirm) and a reorder request
     (the line was rejected, the store places a fresh order in an alternate). */
  async function messageStore(l, o) {
    o = o || {};
    let offers, subject, text, file;
    if (o.kind === 'reorder') {
      offers = (o.alts || []).map((a) => [a, 0]);
      subject = C.reorderSubject(l); text = C.reorderText(l, offers, o.note); file = 'Reorder';
    } else {
      const d = await A.rpc('line_detail', { p_line: l.id });
      offers = d.allocations.filter((a) => a.state === 'OFFERED').map((a) => [artOf(a.article_code) || { article_code: a.article_code, description: '', mrp: 0 }, a.qty]);
      if (!offers.length) return;
      const replyBy = o.replyBy || new Date(Date.now() + 4 * 3600e3);
      subject = C.offerSubject(l, replyBy); text = C.offerText(l, offers, replyBy, o.note); file = 'Offer';
    }
    const to = o.to != null ? o.to : l.email, cc = o.cc != null ? o.cc : (localStorage.getItem('allocdesk-cc') || '');
    const mailto = 'mailto:' + encodeURIComponent(to || '') + '?' + (cc ? 'cc=' + encodeURIComponent(cc) + '&' : '') + 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    let ph = (l.phone || '').replace(/\D/g, '');
    ph = ph.length === 10 ? '91' + ph : (ph.length === 12 && ph.startsWith('91') ? ph : '');
    const dlg = pop(`<h2>Tell the store</h2><p class="small">${o.kind === 'reorder' ? 'The line is rejected. Nothing is held for the store.' : 'The stock is held.'} Send the message whichever way suits where you are; nothing is sent automatically.</p>
      ${to ? '' : '<p class="note warn">No email address is on file for this store.</p>'}
      <div class="stack" style="margin-top:10px">
        <button class="btn primary" data-m="eml" style="width:100%">Outlook draft with pictures (laptop)</button>
        <a class="btn" data-m="mailto" href="${esc(mailto)}" style="display:block;text-align:center;text-decoration:none">Open in mail app (text only)</a>
        <a class="btn" data-m="wa" href="https://wa.me/${ph}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">${ph ? `WhatsApp to ${esc(l.poc_name || 'the store contact')} (${esc(l.phone)})` : 'Send on WhatsApp'}</a>
        <button class="btn" data-m="copy" style="width:100%">Copy the message</button>
        <details><summary class="small" style="cursor:pointer">Read the message</summary><pre class="small" style="margin-top:8px">${esc('To: ' + (to || '') + '\nSubject: ' + subject + '\n\n' + text)}</pre></details>
      </div><div class="actions"><button class="btn" data-done>Done</button></div>`);
    let logged = false;
    const log = () => { if (!logged) { logged = true; A.rpc('log_email', { p_line: l.id, p_to: to || '', p_subject: subject }).catch(() => {}); } };
    $('[data-done]', dlg).onclick = () => { dlg.close(); if (logged) reload().catch(() => {}); };
    $('[data-m=mailto]', dlg).onclick = log; $('[data-m=wa]', dlg).onclick = log;
    $('[data-m=copy]', dlg).onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Message copied'); log(); } catch (e) { toast('Could not copy - open "Read the message" and copy from there'); } };
    $('[data-m=eml]', dlg).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Preparing ...';
      const images = [];
      for (const [a] of offers) {
        if (!a.image_path) continue;
        try {
          const blob = await imageBlob(a.article_code), buf = new Uint8Array(await blob.arrayBuffer()); let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          images.push({ cid: 'alt' + a.article_code, name: a.article_code + '.jpg', type: 'image/jpeg', base64: btoa(bin) });
        } catch (e) { /* the draft simply goes without that picture */ }
      }
      const got = new Set(images.map((i) => i.cid));
      const html = C.mailHtml(text, offers, (a) => got.has('alt' + a.article_code));
      saveBlob(new Blob([C.buildEml({ to, cc, subject, html, images })], { type: 'message/rfc822' }), `${file}_${l.order_no}_${l.store_code}.eml`);
      b.disabled = false; b.textContent = 'Outlook draft with pictures (laptop)';
      toast('Draft downloaded - open it and press Send'); log();
    };
  }

  /* ================= what the buttons do ================= */
  const cur = () => S.M.byId[S.o.sel];
  const altPicks = () => $$('.altq').map((i) => ({ article: i.dataset.art, qty: Math.round(+i.value || 0), pack: +i.dataset.pack || 1 })).filter((x) => x.qty > 0);
  const pickLine = (p) => { const f = C.roundPack(p.qty, p.pack); return `  ${inr(f)} pcs of ${p.article} ${(artOf(p.article) || {}).description || ''}${f !== p.qty ? ` (${inr(p.qty)} rounded up to packs of ${p.pack})` : ''}`; };
  const failures = (res) => res.filter((r) => !r.ok).map((r) => `${r.article}: ${r.error}`).join('\n');
  async function allocMany(items, st) {              // in batches, so a very large selection never hits the database time limit
    let out = [];
    for (const part of chunks(items, 300)) out = out.concat(await A.rpc('allocate_many', st ? { p_items: part, p_state: st } : { p_items: part }));
    return out;
  }
  const reasonOptions = (pick) => C.REJECT_REASONS.map((r) => `<option ${r === pick ? 'selected' : ''}>${esc(r)}</option>`).join('');
  const ACT = {
    retry: () => boot(),
    hardReload: () => location.reload(),
    signout: async () => { clearInterval(poller); poller = null; await A.sb.auth.signOut().catch(() => {}); S.M = null; S.me = null; screenLogin(); },
    refresh: () => run(async () => {}),
    nav: (el) => { S.view = el.dataset.view; if (!S.wide) { S.o.sel = null; S.s.art = null; } render(); window.scrollTo(0, 0); const m = $('main'); if (m) m.scrollTop = 0; },
    go: (el) => {
      S.view = el.dataset.view;
      if (el.dataset.view === 'orders') Object.assign(S.o, { status: el.dataset.status || '', flag: el.dataset.flag || '', q: el.dataset.q || '', buyer: el.dataset.buyer || '', store: '', mc: '', sel: null, limit: 300 });
      render();
    },
    shortOpen: (el) => { S.view = 'shortages'; S.s.art = el.dataset.code; S.s.qty = {}; render(); },
    sel: (el) => { S.o.sel = +el.dataset.id; S.o.detail = null; render(); packPreview(); },
    unsel: () => { S.o.sel = null; render(); },
    chk: (el) => { const id = +el.dataset.id; if (el.checked) S.o.checked.add(id); else S.o.checked.delete(id); },
    chkAll: (el) => { ordersFiltered().slice(0, S.o.limit).forEach((l) => { if (el.checked) S.o.checked.add(l.id); else S.o.checked.delete(l.id); }); setHtml('olist', oListHtml()); const c = $('[data-act=chkAll]'); if (c) c.checked = el.checked; },
    sort: (el) => { const k = el.dataset.key; if (S.o.sort === k) { if (S.o.dir === 1) S.o.dir = -1; else { S.o.sort = null; S.o.dir = 1; } } else { S.o.sort = k; S.o.dir = 1; } setHtml('olist', oListHtml()); },
    more: () => { S.o.limit += 300; setHtml('olist', oListHtml()); hydrate(); },
    approve: () => {
      const l = cur(), i = $('#ap-qty'), q = Math.round(+i.value || 0), f = C.roundPack(q, l.pack);
      if (q <= 0) return tell('Approve', 'Enter the quantity to approve.');
      if (f > (+i.max || 0)) return tell('Approve', `${inr(f)} pcs (${inr(q)} rounded up to full packs of ${l.pack}) is more than can be approved on this line now: ${inr(+i.max || 0)} pcs.`);
      run(() => A.rpc('allocate', { p_line: l.id, p_article: l.article_code, p_qty: q }), `Approved ${inr(f)} pcs` + (f !== q ? ` (${inr(q)} rounded up to full packs)` : ''));
    },
    approveAlts: async () => {
      const l = cur(), picks = altPicks();
      if (!picks.length) return tell('Alternates', 'Enter a quantity against at least one alternate.');
      if (!(await confirmBox('Approve alternates', 'Approve these alternates on this order (the store has already agreed)?\n\n' + picks.map(pickLine).join('\n'), 'Approve'))) return;
      run(async () => { const res = await allocMany(picks.map((p) => ({ line: l.id, article: p.article, qty: p.qty }))); const f = failures(res); if (f) throw new Error(f); }, 'Alternates approved');
    },
    offer: async () => {
      const l = cur(), picks = altPicks();
      if (!picks.length) return tell('Alternates', 'Enter a quantity against at least one alternate.');
      const v = await ask('Offer alternates to ' + (l.store_name || l.store_code), `<div class="stack">
        <p class="small">These quantities are held for the store until it replies:</p>
        <pre>${esc(picks.map(pickLine).join('\n'))}</pre>
        <label class="f">To<input type="text" name="to" value="${esc(l.email)}"></label>
        <label class="f">Cc<input type="text" name="cc" value="${esc(localStorage.getItem('allocdesk-cc') || '')}"></label>
        <label class="f">Reply needed by<input type="datetime-local" name="by" value="${localInput(new Date(Date.now() + 4 * 3600e3))}" required></label>
        <label class="f">Extra line for the store (optional)<textarea name="note" rows="2"></textarea></label></div>`, 'Hold stock');
      if (!v) return;
      localStorage.setItem('allocdesk-cc', v.cc.trim());
      S.busy = true;
      try {
        const res = await allocMany(picks.map((p) => ({ line: l.id, article: p.article, qty: p.qty })), 'OFFERED');
        await reload();
        const f = failures(res);
        if (f) await tell('Some alternates were not held', f);
        if (res.some((r) => r.ok)) await messageStore(S.M.byId[l.id], { to: v.to.trim(), cc: v.cc.trim(), replyBy: new Date(v.by), note: v.note.trim() });
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    remsg: () => messageStore(cur()),
    confirmOffer: (el) => run(() => A.rpc('confirm_offer', { p_alloc: +el.dataset.alloc }), 'Marked as confirmed by the store'),
    declineOffer: (el) => run(() => A.rpc('decline_offer', { p_alloc: +el.dataset.alloc }), 'Offer cancelled, stock released'),
    undo: (el) => run(() => A.rpc('undo_alloc', { p_alloc: +el.dataset.alloc }), 'Undone'),
    dispatch: () => run(() => A.rpc('dispatch_lines', { p_lines: [S.o.sel] }), 'Marked dispatched'),
    closeBal: () => run(() => A.rpc('close_balance', { p_line: S.o.sel }), 'Balance closed'),
    reopen: () => run(() => A.rpc('reopen_line', { p_line: S.o.sel }), 'Reopened'),
    sapAccept: () => run(() => A.rpc('sap_accept', { p_line: S.o.sel })),
    sapDismiss: () => run(() => A.rpc('sap_dismiss', { p_line: S.o.sel })),
    reject: async (el) => {
      const l = cur(), reorder = !!el.dataset.reorder;
      const alts = C.allAlternates(S.M, l.article_code).filter((a) => C.freeOf(S.M, a.article_code) >= C.packOf(a));
      const held = l.approved_open + l.offered;
      const v = await ask('Reject order line', `<div class="stack">
        <p class="small">Order ${esc(ref(l))}: ${inr(l.req_qty)} pcs of ${esc(l.article_code)} ${esc(l.description)}</p>
        ${held ? `<p class="note warn">${inr(held)} pcs approved or offered on this line will be released.</p>` : ''}
        <label class="f">Reason<select name="reason">${reasonOptions(reorder ? 'Reorder in new article' : 'Not available')}</select></label>
        <label class="f">Remark (optional)<input type="text" name="remark"></label>
        <label class="row"><input type="checkbox" name="msg" ${reorder ? 'checked' : ''}> <span>Prepare a message asking the store to reorder in an alternate${alts.length ? ` (${alts.length} with stock will be listed)` : ' (none has stock right now)'}</span></label></div>`, 'Reject line', { danger: true, noFocus: true });
      if (!v || S.busy) return;
      const reason = v.reason + (v.remark.trim() ? ' - ' + v.remark.trim() : ''), before = Object.assign({}, l, { balance: l.balance || l.req_qty });
      S.busy = true;
      try {
        await A.rpc('reject_line', { p_line: l.id, p_reason: reason });
        await reload(); toast('Line rejected');
        if (v.msg) await messageStore(before, { kind: 'reorder', alts });
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    bulkApprove: async () => {
      const ids = Array.from(S.o.checked);
      if (!ids.length) return tell('Approve ticked in full', 'Tick one or more order lines first.');
      const items = ids.map((id) => S.M.byId[id]).filter((l) => l && !l.rejected && l.open_qty > 0).map((l) => ({ line: l.id, article: l.article_code, qty: l.open_qty }));
      if (!items.length) return tell('Approve ticked in full', 'None of the ticked lines has an open balance.');
      S.busy = true;
      try {
        const res = await allocMany(items);
        S.o.checked.clear();
        await reload();
        const bad = res.filter((r) => !r.ok);
        await tell('Approve ticked in full', `Approved in full (rounded up to full packs): ${res.length - bad.length} ${plural(res.length - bad.length, 'line')}.` + (bad.length ? `\n\nNot approved (${bad.length}):\n` +
          bad.slice(0, 15).map((r) => { const l = S.M.byId[r.line] || {}; return `${ref(l)}  ${r.error}`; }).join('\n') + (bad.length > 15 ? `\n... and ${bad.length - 15} more` : '') : ''));
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    bulkDispatch: () => {
      const ids = Array.from(S.o.checked);
      if (!ids.length) return tell('Mark ticked dispatched', 'Tick one or more order lines first.');
      run(async () => { const n = await A.rpc('dispatch_lines', { p_lines: ids }); S.o.checked.clear(); return n; }, (n) => (n ? `Marked dispatched: ${n} ${plural(n, 'line')}` : 'Nothing approved was waiting for dispatch'));
    },
    bulkReject: async () => {
      const ids = Array.from(S.o.checked).filter((id) => { const l = S.M.byId[id]; return l && !l.rejected; });
      if (!ids.length) return tell('Reject ticked', 'Tick one or more order lines first.');
      const v = await ask(`Reject ${ids.length} ticked ${plural(ids.length, 'line')}`, `<div class="stack">
        <p class="small">Anything approved or offered on these lines is released. Lines that are already dispatched are left alone.</p>
        <label class="f">Reason<select name="reason">${reasonOptions('Not available')}</select></label>
        <label class="f">Remark (optional)<input type="text" name="remark"></label></div>`, 'Reject lines', { danger: true, noFocus: true });
      if (!v) return;
      run(async () => { const r = await A.rpc('reject_lines', { p_lines: ids, p_reason: v.reason + (v.remark.trim() ? ' - ' + v.remark.trim() : '') }); S.o.checked.clear(); return r; },
        (r) => `Rejected ${r.done} ${plural(r.done, 'line')}` + (r.skipped ? `, ${r.skipped} left alone (dispatched)` : ''));
    },
    shortSel: (el) => { S.s.art = el.dataset.code; S.s.qty = {}; render(); },
    shortUnsel: () => { S.s.art = null; S.s.qty = {}; render(); },
    fill: (el) => { S.s.qty = el.dataset.m ? C.suggestSplit(S.M, S.s.art, el.dataset.m) : {}; $$('.sq').forEach((i) => { i.value = S.s.qty[i.dataset.id] || ''; }); tally(); },
    applySplit: async () => {
      const items = Object.entries(S.s.qty).filter(([, q]) => +q > 0).map(([id, q]) => ({ line: +id, article: S.s.art, qty: Math.round(+q) }));
      if (!items.length) return;
      S.busy = true;
      try {
        const res = await allocMany(items);
        S.s.qty = {};
        await reload();
        const bad = res.filter((r) => !r.ok);
        if (bad.length) await tell('Some lines were not approved', bad.map((r) => { const l = S.M.byId[r.line] || {}; return `${ref(l)}: ${r.error}`; }).join('\n'));
        else toast(`Approved ${items.length} ${plural(items.length, 'line')}`);
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    art: (el) => openArticle(el.dataset.code),
    scopeAll: () => { S.c.scope = 'all'; S.c.cat = ''; render(); },
    closePop: (el) => { const o = el.closest('.overlay'); if (o) o.close(); },
    imgSave: async (el) => { try { saveBlob(await imageBlob(el.dataset.code), el.dataset.code + '.jpg'); } catch (e) { tell('Image', e.message); } },
    imgShare: async (el) => {
      try {
        const c = el.dataset.code, f = new File([await imageBlob(c)], c + '.jpg', { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: (artOf(c) || {}).description || c });
        else saveBlob(f, c + '.jpg');
      } catch (e) { if (e.name !== 'AbortError') tell('Image', e.message); }
    },
    imgChange: (el) => { pending = { kind: 'oneImage', code: el.dataset.code }; const i = $('#file-in'); i.accept = 'image/*'; i.value = ''; i.click(); },
    pick: (el) => { pending = { kind: el.dataset.kind }; const i = $('#file-in'); i.accept = '.xlsx,.xlsm,.xls,.csv,.txt'; i.value = ''; i.click(); },
    pickImages: () => { const i = $('#img-in'); i.value = ''; i.click(); },
    pickFolder: () => { const i = $('#dir-in'); i.value = ''; i.click(); },
    export: () => exportExcel(),
    testdata: () => loadTestData(),
    wipe: async () => {
      const v = await ask('Clear everything', '<p>This removes ALL articles, stock, orders and approvals for everyone. The team list stays. It cannot be undone.</p><label class="f" style="margin-top:10px">Type CLEAR to confirm<input type="text" name="word" autocomplete="off"></label>', 'Clear everything', { danger: true });
      if (v && v.word.trim().toUpperCase() === 'CLEAR') run(async () => { await A.rpc('wipe'); S.extra = {}; S.c.results = null; S.c.asked = ''; }, 'Everything was cleared');
      else if (v) tell('Not cleared', 'You did not type CLEAR, so nothing was removed.');
    },
    password: async () => {
      const v = await ask('Change password', '<label class="f">New password (8 characters or more)<input type="password" name="p" minlength="8" autocomplete="new-password" required></label>', 'Change password');
      if (!v) return;
      const { error } = await A.sb.auth.updateUser({ password: v.p });
      tell('Change password', error ? A.nice(error) : 'Your password was changed.');
    },
    teamRemove: async (el) => {
      if (await confirmBox('Remove from team', `Remove ${el.dataset.email}? They will no longer be able to see anything.`, 'Remove', true)) {
        try { await A.rpc('team_remove', { p_user: el.dataset.user }); toast('Removed'); } catch (e) { await tell('Not done', e.message); }
        loadTeam();
      }
    }
  };
  let pending = null;

  /* ================= events ================= */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'sel' && e.target.closest('input[type=checkbox]')) return;      // the tick box handles itself
    if ((el.dataset.act === 'chk' || el.dataset.act === 'chkAll')) { ACT[el.dataset.act](el); return; }
    const fn = ACT[el.dataset.act];
    if (fn) fn(el, e);
  });
  const relist = () => { S.o.limit = 300; setHtml('olist', oListHtml()); hydrate(); };
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'oq') { S.o.q = t.value; relist(); }
    else if (t.id === 'cq') { S.c.q = t.value; setHtml('cgrid', cGridHtml()); hydrate(); searchAll(); }
    else if (t.id === 'sq') { S.s.q = t.value; const a = document.activeElement, pos = t.selectionStart; render(); const n = $('#sq'); if (a === t && n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* type=search */ } } }
    else if (t.classList.contains('sq')) { const v = Math.max(0, Math.round(+t.value || 0)); if (v) S.s.qty[t.dataset.id] = v; else delete S.s.qty[t.dataset.id]; tally(); }
    else if (t.id === 'ap-qty' || t.classList.contains('altq')) packPreview();
    else if (t.id === 'dl-disc') dealCalc('disc');
    else if (t.id === 'dl-price') dealCalc('price');
    else if (t.id === 'dl-qty' || t.id === 'dl-store') dealCalc();
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'ostatus') { S.o.status = t.value; relist(); }
    else if (t.id === 'oflag') { S.o.flag = t.value; relist(); }
    else if (t.id === 'ostore') { S.o.store = t.value; relist(); }
    else if (t.id === 'omc') { S.o.mc = t.value; relist(); }
    else if (t.id === 'obuyer') { S.o.buyer = t.value; relist(); }
    else if (t.id === 'ccat') { S.c.cat = t.value; setHtml('cgrid', cGridHtml()); hydrate(); }
    else if (t.id === 'cscope') { S.c.scope = t.value; S.c.cat = ''; render(); }
    else if (t.id === 'sonly') { S.s.only = t.checked; render(); }
    else if (t.dataset.role) {
      try { await A.rpc('team_set', { p_user: t.dataset.role, p_role: t.value }); toast('Access changed'); } catch (err) { await tell('Not done', err.message); }
      loadTeam();
    } else if (t.id === 'file-in' && t.files[0] && pending) {
      const p = pending; pending = null;
      if (p.kind === 'oneImage') {
        const prog = progress('Uploading picture ...');
        try { await A.uploadImage(p.code, await shrink(t.files[0])); prog.close(); delete S.extra[p.code]; await reload(); openArticle(p.code); toast('Picture updated'); }
        catch (err) { prog.close(); tell('Picture was not uploaded', err.message); }
      } else importFile(p.kind, t.files[0]);
    } else if ((t.id === 'img-in' || t.id === 'dir-in') && t.files.length) importImages(t.files);
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'addmember') return;
    e.preventDefault();
    const f = e.target, email = f.email.value.trim().toLowerCase(), name = f.name.value.trim(), role = f.role.value, b = $('button', f);
    b.disabled = true;
    try {
      const made = await A.createAccount(email, f.password.value);
      if (made.needsConfirm) throw new Error('Supabase is waiting for an email confirmation for new accounts. In Supabase open Authentication > Sign In / Providers > Email and switch "Confirm email" off, then add the person again.');
      try { await A.rpc('team_add', { p_email: email, p_name: name, p_role: role }); }
      catch (err) {
        if (!/EXISTING_ACCOUNT/.test(err.message)) throw err;
        if (!(await confirmBox('This email already has an account', `${email} already had an account here, with a password that person chose earlier (the first password you typed was not used).\n\nGive this existing account access only if you are sure it belongs to them.`, 'Give access'))) return loadTeam();
        await A.rpc('team_add', { p_email: email, p_name: name, p_role: role, p_link_existing: true });
      }
      toast(name + ' added');
      if (made.created) await tell('Person added', `${name} can now sign in with:\n\nEmail: ${email}\nPassword: ${f.password.value}\n\nTell them to change the password after signing in (Data > Your account).`);
    } catch (err) { await tell('Person was not added', err.message); }
    loadTeam();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'find' && e.target.value.trim()) {
      const q = e.target.value.trim(), code = C.code(q);
      S.c.q = q; S.c.cat = ''; S.c.scope = 'master'; S.view = 'catalogue';
      let r = catRows();
      if (!r.length) { S.c.scope = 'ordered'; r = catRows(); }
      if (!r.length) S.c.scope = 'all';                          // not in the Diwali range or on an order: look among all articles
      render();
      if (r.length === 1) openArticle(r[0].article_code); else if (!r.length && /^\d{6,}$/.test(code)) openArticle(code);
    }
    if (e.key === 'Escape') { const o = $('#modal').lastElementChild; const c = o && $('[data-cancel],[data-done],[data-act=closePop]', o); if (c) c.click(); }
  });
  wideMQ.addEventListener('change', (e) => { S.wide = e.matches; if (S.M) render(); });
  window.addEventListener('error', (e) => { if (S.M && e.message) toast('Something went wrong: ' + e.message); });

  window.AllocDesk = { S, reload, boot, importFile };  // handy for support and for the automated checks
  boot();
})();
