/* Allocation Desk - screens. One file, no framework: each view is a function that returns HTML,
   clicks are routed through data-act attributes, and every change goes to the database
   functions (which enforce the rules) followed by a fresh read. */
(function () {
  'use strict';
  const C = window.Core, A = window.Api, R = window.Reader, esc = C.esc, inr = C.inr, rupees = C.rupees, when = C.when, pct = C.pct;
  const $ = (s, r) => (r || document).querySelector(s);
  const inr2 = (n) => { n = Number(n) || 0; return Math.abs(n - Math.round(n)) > 0.004 ? inr(Math.floor(n)) + '.' + String(Math.round((n - Math.floor(n)) * 100)).padStart(2, '0') : inr(n); };
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const app = $('#app');
  const wideMQ = window.matchMedia('(min-width: 960px)');
  const S = {
    me: null, M: null, view: 'dashboard', wide: wideMQ.matches, lastSync: null, online: true, stale: false, busy: false,
    /* o = the Pending orders screen, a = the Approved orders screen. The line open in the side panel (o.sel) is shared. */
    o: { q: '', status: '', flag: '', store: '', mc: '', buyer: '', group: 'store_order', sort: '', sel: null, checked: new Set(), limit: 300, detail: null, collapsed: false, toggled: new Set() },
    a: { q: '', flag: '', store: '', mc: '', buyer: '', group: 'store_order', sort: '', seg: 'todo', checked: new Set(), limit: 300, collapsed: false, toggled: new Set() },
    s: { only: true, q: '', art: null, qty: {} },
    c: { q: '', scope: 'master', cat: '', results: null, loading: false, asked: '' },
    /* Last year: count what was ordered or what was approved; the same days so far or the whole season; chart in value or qty */
    ly: { basis: 'ordered', period: 'same', unit: 'value', q: '', sq: '', sonly: false, open: new Set(), all: false, sum: null, stores: null, batch: null, loading: false, err: '', lq: '', lines: null, lbusy: false },
    st: { q: '', group: 'none', sort: 'pct', status: '', store: '', state: '', mc: '', buyer: '', limit: 300, collapsed: false, toggled: new Set() },
    qy: { list: null, rev: null, loading: false, err: '', q: '', form: { store: '', art: '', disc: '', price: '', qty: '', remarks: '' }, found: {}, saving: false, last: null },
    extra: {}                                        // articles looked up on the server that are not part of the everyday data
  };
  const NEED_SCHEMA = 2, LATEST_SCHEMA = 14;       // older than NEED: the app stops and asks for the script; older than LATEST: it works, minus the newest features
  const editor = () => !!(S.me && S.me.role === 'editor');
  const locsOn = () => !!S.M && S.M.schema >= 6;      // DC locations per approval and inwards need database version 6
  const ssOn = () => !!S.M && S.M.schema >= 7;        // stock at the stores needs database version 7
  const priceOn = () => !!S.M && S.M.schema >= 8;
  const sapOn = () => !!S.M && S.M.schema >= 11;      // approvals done in SAP need database version 11
  const lyOn = () => !!S.M && S.M.schema >= 13;       // last year's orders need database version 13
  const hasLy = () => lyOn() && !!S.M.meta.ly_batch;
  const qOn = () => !!S.M && S.M.schema >= 14;        // queries from the stores need database version 14
  /* What the SAP approval file said about a line, in one line of text */
  const sapText = (l) => { const x = l.sap_appr; if (!x) return '';
    return [x.label || (x.status === 'APPROVED' ? 'Approved in SAP' : 'Rejected in SAP'), x.status === 'APPROVED' && x.qty ? inr(x.qty) + ' pcs' : '', x.by, x.at ? when(x.at) : '', x.po ? 'PO ' + x.po : '', x.remarks].filter(Boolean).join(' · '); };     // approving a price with the quantity needs database version 8
  const artOf = (code) => (S.M && S.M.articles[code]) || S.extra[code] || null;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const ICON = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    shortages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17.2v.3"/></svg>',
    catalogue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-4 3 2 4-4 4 4"/></svg>',
    approved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="7" width="3" height="11" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/></svg>',
    label: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    queries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5M12 16.2v.3"/></svg>',
    lastyear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="m4 15 5-5 4 3 7-7"/><path d="m4 17 5-3 4 1 7-4" stroke-dasharray="2 3"/></svg>'
  };
  const NAV = [['dashboard', 'Dashboard'], ['orders', 'Pending'], ['approved', 'Approved'], ['shortages', 'Shortages'], ['sales', 'Sell-through'], ['catalogue', 'Articles'], ['lastyear', 'Last year'], ['queries', 'Queries'], ['data', 'Data']];
  const NAV_LONG = { orders: 'Pending orders', approved: 'Approved orders', lastyear: 'This year vs last year', sales: 'Sell-through' };

  /* ================= small building blocks ================= */
  const pill = (st, text) => `<span class="pill ${st}">${esc(text || C.STATUS_LABEL[st] || st)}</span>`;
  const stat = (title, value, tone) => `<div class="stat"><b class="${tone || ''}">${value}</b><span>${title}</span></div>`;
  const plural = (n, one, many) => (n === 1 ? one : many || one + 's');
  const ref = (l) => (l.line_item ? l.order_no + ' / ' + l.line_item : l.order_no);
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
        $$('[name]', d).forEach((i) => {
          if (i.type === 'radio') { if (i.checked) v[i.name] = i.value; else if (!(i.name in v)) v[i.name] = ''; }
          else v[i.name] = i.type === 'checkbox' ? i.checked : i.value;
        });
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
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* sharing to the app just will not be offered */ });
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
      labelFromShare();
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
    for (const st of [S.o, S.a]) st.checked.forEach((id) => { if (!S.M.byId[id]) st.checked.delete(id); });
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
  const inwardTotal = (M) => Object.values(M.pos).reduce((t, p) => t + p.inward, 0);
  const stockLine = (M) => (M.meta.stock_asof ? 'DC stock as of ' + when(M.meta.stock_asof) + (inwardTotal(M) ? '<br>+ ' + inr(inwardTotal(M)) + ' pcs inwards since' : '') : 'No DC stock report loaded');
  function render() {
    if (!S.M) return;
    const keep = {};
    $$('[data-keep]').forEach((e) => { keep[e.dataset.keep] = e.scrollTop; });
    const y = window.scrollY, M = S.M;
    const views = { dashboard: vDashboard, orders: () => vOrders('orders'), approved: () => vOrders('approved'), shortages: vShortages, sales: vSellThrough, catalogue: vCatalogue, lastyear: vLastYear, queries: vQueries, data: vData };
    const role = editor() ? '' : '<span class="pill view">VIEW ONLY</span>';
    app.innerHTML = `<div class="shell">
      <aside class="side">
        <div class="brand">Allocation Desk</div><div class="brandsub">CORPORATE ORDERS</div>
        ${role ? `<div style="margin-bottom:10px">${role}</div>` : ''}
        <input type="search" id="find" placeholder="Find any article ..." aria-label="Find article">
        <button class="btn sm labelbtn" data-act="label" title="Choose a photo of an article label (for example one a store sent on WhatsApp); the app reads the article code and shows its stock and orders">${ICON.label} Check a label</button>
        ${NAV.map(([k, t]) => `<button class="nav ${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${ICON[k]}${NAV_LONG[k] || t}</button>`).join('')}
        <div class="foot">${stockLine(M)}<br>${inr(M.lines.length)} order lines<br>
          ${esc(S.me.name || S.me.email)} (${editor() ? 'editor' : 'viewer'})<br><span data-sync data-act="refresh" style="cursor:pointer">${esc(syncText())}</span></div>
      </aside>
      <div class="topbar"><span class="brand">Allocation Desk</span>${role}<span class="grow"></span><button class="iconbtn" data-act="label" title="Check a label" aria-label="Check a label">${ICON.label}</button><span class="sync" data-sync data-act="refresh">${esc(syncText())}</span></div>
      <main data-keep="main">${views[S.view]()}</main>
      <nav class="tabs">${NAV.map(([k, t]) => `<button class="${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${ICON[k]}${t}</button>`).join('')}</nav>
    </div>`;
    $$('[data-keep]').forEach((e) => { if (keep[e.dataset.keep]) e.scrollTop = keep[e.dataset.keep]; });
    window.scrollTo(0, y);
    hydrate();
    if (LISTS.includes(S.view) && S.o.sel && !S.o.detail) loadDetail();
    if (LISTS.includes(S.view)) packPreview();
    if (S.view === 'shortages') tally();
    if (S.view === 'catalogue' && S.c.scope === 'all') searchAll();
    if (S.view === 'lastyear') lyLoad();
    if (S.view === 'queries') qLoad();
    wireCharts();
  }
  const setHtml = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };

  /* ================= Dashboard ================= */
  /* Value at MRP, value at the price wanted, the discount that is, and the margin left after it.
     qf(line) = the quantity to count for that line. */
  /* approved = count the price approved (where one was approved) instead of the price asked.
     marginMrp = the margin the same pieces would make at MRP, with no discount. */
  function money(lines, qf, approved) {
    let mrpV = 0, val = 0, net = 0, netMrp = 0, cost = 0, noCost = 0;
    for (const l of lines) {
      const q = qf(l); if (!q) continue;
      const price = approved && l.appr_price != null ? l.appr_price : l.req_price;
      mrpV += q * l.mrp; val += q * price;
      const a = S.M.articles[l.article_code];
      if (a && Number(a.cost) > 0 && a.gst != null) { net += q * price / (1 + Number(a.gst)); netMrp += q * l.mrp / (1 + Number(a.gst)); cost += q * Number(a.cost); } else noCost++;
    }
    return { mrpV, val, disc: mrpV ? 1 - val / mrpV : null, margin: net ? (net - cost) / net : null, marginMrp: netMrp ? (netMrp - cost) / netMrp : null, marginRs: net - cost, noCost };
  }
  const FLAGS = {
    LATE: ['Delivery date at risk', (l) => l.late],
    SOON: ['Allocate today or tomorrow', (l) => l.tight],
    BELOW: ['Price below MRP', (l) => !l.price_missing && l.discount != null && l.discount > 0.0005],
    NOPRICE: ['Price not given (MRP used)', (l) => !!l.price_missing],
    OUTSIDE: ['Not in the Diwali range', (l) => !l.in_master],
    INACTIVE: ['In-Active article', (l) => l.art_status === 'In-Active'],
    SAP: ['SAP quantity changed', (l) => l.sap_new_qty != null],
    DUP: ['Duplicate article in the order', (l) => l.dup_count > 0],
    STOREFULL: ['Store already holds the qty wanted (incl. alternates)', (l) => !!l.ss && l.req_qty > 0 && l.ss.family >= l.req_qty],
    STOREHAS: ['Store has stock of it or an alternate', (l) => !!l.ss && l.ss.family > 0],
    SAPDIFF: ['Differs from the SAP approval file', (l) => !!(l.sap_appr && l.sap_appr.conflict)],
    SAPDONE: ['Approved or rejected in SAP', (l) => !!l.sap_appr]
  };
  const dupText = (l) => `entered ${l.dup_count} times in the SAP export (qty ${l.dup_qty || '?'})`;
  const dupBadge = (l) => (l.dup_count > 0 ? `<span class="badge bad" title="${esc('The same article is ' + dupText(l) + '. It is taken once.')}">Duplicate article</span>` : '');
  function vDashboard() {
    const M = S.M, lines = M.lines, hasStock = !!M.meta.stock_asof;
    const inTot = inwardTotal(M), inArts = Object.values(M.pos).filter((p) => p.inward > 0).length;
    const sub = hasStock ? `DC stock as of ${when(M.meta.stock_asof)} (${esc(M.meta.stock_file || '')})${inTot ? ` + ${inr(inTot)} pcs inwards since` : ''}` : 'No DC stock report loaded yet';
    if (!lines.length && !Object.keys(M.articles).length) {
      return `<div class="head"><h1>Dashboard</h1></div><div class="card stack"><h2>Nothing loaded yet</h2>
        <p class="muted">${editor() ? 'Go to Data and load the test data, or upload your Diwali article master, DC stock report and orders.' : 'The editor has not loaded any data yet. This screen fills in by itself once they do.'}</p>
        ${editor() ? '<div><button class="btn primary" data-act="nav" data-view="data">Open Data</button></div>' : ''}</div>`;
    }
    const by = {}; C.STATUS_ORDER.forEach((s) => { by[s] = lines.filter((l) => l.status === s); });
    const live = lines.filter((l) => l.status !== 'REJECTED');
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const req = sum(live, (l) => l.req_qty), appr = sum(live, (l) => l.approved);
    const asked = money(live, (l) => l.req_qty), given = money(live, (l) => l.approved, true);
    const gap = given.margin != null && given.marginMrp != null ? (given.marginMrp - given.margin) * 100 : null;
    const tile = (cls, t, v, s) => `<div class="tile ${cls}"><h3>${t}</h3><b class="${String(v).length > 9 ? 'long' : ''}">${v}</b><span>${s}</span></div>`;
    const tiles = [
      tile('lilac', 'Order lines', inr(lines.length), `${inr(new Set(lines.map((l) => l.order_no)).size)} orders, ${new Set(lines.map((l) => l.store_code)).size} stores`),
      tile('peach', 'Pending', inr(by.PENDING.length), `${inr(sum(by.PENDING, (l) => l.balance))} pcs to approve`),
      tile('mint', 'Approved', inr(by.APPROVED.length + by.PARTIAL.length + by.DISPATCHED.length), `${by.PARTIAL.length} partly approved`),
      tile('pink', 'Rejected', inr(by.REJECTED.length), `${inr(sum(by.REJECTED, (l) => l.req_qty))} pcs`),
      tile('lilac', 'Value approved', rupees(given.val), `of ${rupees(asked.val)} ordered`),
      tile('mint', 'Margin after discount', pct(given.margin), given.disc == null ? 'on what is approved - nothing yet' : 'on what is approved, at the prices approved'),
      tile('sky', 'Margin without discount', pct(given.marginMrp), gap == null ? 'the same pieces sold at MRP' : `at MRP; ${gap.toFixed(1)} points more than after discount`),
      tile('butter', 'Discount given', given.disc == null ? '-' : pct(given.disc), given.disc == null ? 'nothing approved yet' : `Rs ${inr(given.mrpV - given.val)} below MRP on what is approved`)].join('');
    const items = [];
    const go = (label, o) => `<button class="btn sm" data-act="go" data-view="${(o && o.view) || 'orders'}" data-status="${(o && o.status) || ''}" data-flag="${(o && o.flag) || ''}">${label}</button>`;
    const cnt = (k) => lines.filter(FLAGS[k][1]).length;
    if (!hasStock && lines.length) items.push(['bad', 'No DC stock report is loaded, so the balance DC quantity shows as zero', editor() ? go('Upload', { view: 'data' }) : '']);
    if (cnt('DUP')) {
      const ords = Array.from(new Set(lines.filter(FLAGS.DUP[1]).map((l) => l.order_no)));
      items.push(['bad', `Duplicate article in ${inr(ords.length)} ${plural(ords.length, 'order')}: <b>${ords.slice(0, 8).map(esc).join(', ')}</b>${ords.length > 8 ? ` and ${ords.length - 8} more` : ''}. The same article is entered more than once; each is taken once.`, go('Open', { flag: 'DUP' })]);
    }
    const sapDiff = cnt('SAPDIFF');
    if (sapDiff) items.push(['bad', `${inr(sapDiff)} ${plural(sapDiff, 'line')}: the SAP approval file says something different from this tracker - nothing was changed on ${sapDiff === 1 ? 'it' : 'them'}, please check`, go('Open', { flag: 'SAPDIFF' })]);
    const fullAtStore = lines.filter((l) => NEEDS.includes(l.status) && FLAGS.STOREFULL[1](l)).length;
    if (fullAtStore) items.push(['warn', `${inr(fullAtStore)} pending ${plural(fullAtStore, 'line')}: the store already holds at least the quantity it wants, in the article or its alternates (closing stock + in transit)`, go('Open', { flag: 'STOREFULL' })]);
    if (cnt('SAP')) items.push(['warn', `${inr(cnt('SAP'))} ${plural(cnt('SAP'), 'line')}: quantity changed in SAP after import`, go('Review', { flag: 'SAP' })]);
    if (cnt('LATE')) items.push(['bad', `${inr(cnt('LATE'))} ${plural(cnt('LATE'), 'line')} can no longer reach the store by the date it asked for (lead time)`, go('Open', { flag: 'LATE' })]);
    if (cnt('SOON')) items.push(['warn', `${inr(cnt('SOON'))} ${plural(cnt('SOON'), 'line')} must be allocated today or tomorrow to arrive on time`, go('Open', { flag: 'SOON' })]);
    if (by.AWAITING.length) {
      const hrs = M.oldestOffer ? (Date.now() - new Date(M.oldestOffer)) / 3600e3 : 0;
      items.push(['warn', `${inr(by.AWAITING.length)} ${plural(by.AWAITING.length, 'line')} awaiting store reply on alternates (${hrs >= 1 ? 'oldest asked ' + Math.round(hrs) + ' h ago' : 'asked within the last hour'})`, go('Open', { status: 'AWAITING' })]);
    }
    const short = hasStock ? Object.entries(M.pos).filter(([, p]) => p.pending > Math.max(p.free, 0)) : [];
    if (short.length) items.push(['bad', `${inr(short.length)} ${plural(short.length, 'article')} where stores want more than the balance DC quantity`, go(editor() ? 'Share out' : 'Open', { view: 'shortages' })]);
    if (hasStock) Object.entries(M.pos).filter(([, p]) => p.free < 0).slice(0, 4).forEach(([c, p]) =>
      items.push(['bad', `Over-committed: ${esc(c)} ${esc((M.articles[c] || {}).description || '')} - ${inr(p.reserved)} allocated to orders, only ${inr(p.dc)} at the DC in the latest report`,
        `<button class="btn sm" data-act="go" data-view="approved" data-q="${esc(c)}">Open</button>`]));
    if (inTot) items.push(['good', `${inr(inTot)} pcs of inwards received after the stock report are added to the DC stock (${inr(inArts)} ${plural(inArts, 'article')})`, editor() ? go('Open', { view: 'data' }) : '']);
    const negLoc = hasStock ? Object.entries(M.pos).filter(([, p]) => p.free >= 0 && C.LOC_KEYS.some((k) => p.locFree[k] < 0)) : [];
    if (negLoc.length && locsOn()) items.push(['warn', `${inr(negLoc.length)} ${plural(negLoc.length, 'article')}: more is approved from a DC location than that location holds now (${negLoc.slice(0, 5).map(([c]) => esc(c)).join(', ')}${negLoc.length > 5 ? ' ...' : ''}). Open the approval and change its location.`,
      `<button class="btn sm" data-act="go" data-view="approved" data-q="${esc(negLoc[0][0])}">Open</button>`]);
    if (by.PENDING.length) items.push(['', `${inr(by.PENDING.length)} ${plural(by.PENDING.length, 'line')} not looked at yet`, go('Open', { status: 'PENDING' })]);
    const open = (k) => lines.filter((l) => FLAGS[k][1](l) && l.balance > 0).length;
    if (open('NOPRICE')) items.push(['', `${inr(open('NOPRICE'))} pending ${plural(open('NOPRICE'), 'line')} came without a price - MRP was used`, go('Open', { flag: 'NOPRICE' })]);
    if (open('INACTIVE')) items.push(['warn', `${inr(open('INACTIVE'))} pending ${plural(open('INACTIVE'), 'line')} on In-Active articles`, go('Open', { flag: 'INACTIVE' })]);
    if (open('OUTSIDE')) items.push(['', `${inr(open('OUTSIDE'))} pending ${plural(open('OUTSIDE'), 'line')} on articles outside the Diwali range`, go('Open', { flag: 'OUTSIDE' })]);
    if (hasStock) {
      const age = (Date.now() - new Date(M.meta.stock_asof)) / 3600e3;
      if (age > 12) items.push(['warn', `DC stock report is ${Math.round(age)} hours old`, editor() ? go('Upload new', { view: 'data' }) : '']);
    }
    const parts = [['Approved', sum(live, (l) => l.approved), '#7FDDB5'], ['Pending, not yet approved', sum(live, (l) => l.balance), '#C9C2EA'],
      ['Rejected', sum(by.REJECTED, (l) => l.req_qty), '#FF9DBB']];
    const reqAll = sum(lines, (l) => l.req_qty);
    /* discount and margin */
    const mrow = (name, m) => `<tr><td>${name}</td><td class="right">${inr(m.mrpV)}</td><td class="right b">${inr(m.val)}</td>
      <td class="right ${m.disc > 0.0005 ? 'warn b' : ''}">${pct(m.disc)}</td><td class="right">${pct(m.marginMrp)}</td><td class="right b">${pct(m.margin)}</td>
      <td class="right ${m.margin != null && m.marginMrp != null && m.marginMrp - m.margin > 0.0005 ? 'warn' : 'muted'}">${m.margin != null && m.marginMrp != null ? (m.marginMrp - m.margin > 0.0005 ? '-' + ((m.marginMrp - m.margin) * 100).toFixed(1) + ' pts' : '-') : '-'}</td><td class="right">${inr(m.marginRs)}</td></tr>`;
    const pend = money(live, (l) => l.balance);
    const moneyCard = `<div class="card stack"><h2>Discount given, and margin with and without it</h2>
      <div class="tablewrap"><table class="tight twoline fit"><thead><tr><th></th><th class="right">At MRP<br>(Rs)</th><th class="right">At the price<br>(Rs)</th><th class="right">Discount</th><th class="right">Margin %<br>without discount</th><th class="right">Margin %<br>after discount</th><th class="right">Margin lost<br>to discount</th><th class="right">Margin<br>(Rs)</th></tr></thead><tbody>
      ${mrow('Ordered', asked)}${mrow('Approved so far', given)}${mrow('Still pending', pend)}</tbody></table></div>
      <p class="small">Values in rupees, rejected lines left out. "Ordered" and "Still pending" use the price the store asked; "Approved so far" uses the price approved. Margin without discount = the same pieces at MRP. Margin = (price without GST - cost) / price without GST, on the cost of the ordered article.${asked.noCost ? ` ${asked.noCost} ${plural(asked.noCost, 'line')} left out of the margin because the article has no cost on file.` : ''}</p></div>`;
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
      const a = M.articles[c] || {}, ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0);
      return `<tr class="pick" data-act="shortOpen" data-code="${esc(c)}"><td class="w">${esc(a.mc_name || '')}</td><td class="right">${inr(a.mrp)}</td><td>${esc(c)}</td><td class="w">${esc(a.description || '')}</td>
        <td class="right">${inr(Math.max(p.free, 0))}</td><td class="right">${p.n_stores}</td><td class="right">${inr(p.pending)}</td>
        <td class="right bad b">${inr(gap)}</td><td class="right">${ppo ? inr(ppo) : '-'}</td><td class="right">${inr(sf)}</td><td class="right">${inr(df)}</td><td class="right">${sf + df >= gap ? 'Yes' : sf + df ? 'Partly' : 'No'}</td></tr>`;
    }).join('');
    return `<div class="head"><h1>Dashboard</h1><span class="sub">${sub}</span></div>
      <div class="tiles">${tiles}</div>
      <div class="grid2">
        <div class="card stack"><h2>Needs attention</h2>
          ${items.length ? items.map(([tone, text, btn]) => `<div class="attn"><div class="note ${tone || 'info'}">${text}</div>${btn}</div>`).join('') : '<div class="note good">Nothing needs attention.</div>'}</div>
        <div class="stack"><div class="card stack"><h2>Where the ordered quantity stands</h2><div class="bars">
          ${parts.map(([n, q, col]) => `<span>${n}</span><div class="bar"><i style="width:${reqAll ? Math.min(100, q / reqAll * 100) : 0}%;background:${col}"></i></div><b class="right">${inr(q)}</b><span class="small right">${reqAll ? Math.round(q / reqAll * 100) : 0}%</span>`).join('')}
        </div><p class="small">${inr(appr)} of ${inr(req)} pcs approved (${req ? Math.round(appr / req * 100) : 0}%), not counting rejected lines; the bars are out of all ${inr(reqAll)} pcs ordered. Approved quantities are in full packs, so they can be a little above what was asked.</p></div>${moneyCard}</div>
      </div>
      ${lyDashCard()}
      ${buyerCard ? `<div style="margin-top:12px">${buyerCard}</div>` : ''}
      <div class="card stack" style="margin-top:12px"><div class="row"><h2 class="grow">Biggest shortages</h2><button class="btn sm" data-act="nav" data-view="shortages">Open Shortages</button></div>
        ${short.length ? `<div class="tablewrap"><table><thead><tr><th>MC</th><th class="right">MRP</th><th>Article</th><th>Description</th><th class="right">Balance DC qty</th><th class="right">Stores waiting</th>
          <th class="right">Pending order qty</th><th class="right">Short by</th><th class="right">Pending PO</th><th class="right">Balance in same design</th><th class="right">Balance in other designs</th><th class="right">Covered by alternates?</th></tr></thead><tbody>${shortRows}</tbody></table></div>`
        : `<div class="note ${hasStock ? 'good' : 'info'}">${hasStock ? 'No article is short right now.' : 'Shortages appear once a DC stock report is loaded.'}</div>`}</div>`;
  }
  const l0 = (k) => (k === '(buyer not set)' ? '-' : k);




  /* ================= Check a label =================
     A photo of an article label (forwarded from a store on WhatsApp) is read on this phone or laptop - the photo goes
     nowhere - and the article code on it is looked up: one card with the DC position, the stores waiting, the stores'
     own stock and sale, alternates, last year and queries. Ways in: Share from WhatsApp to the installed app, the
     "Check a label" button (choose the photo), or paste / drop an image on a laptop. */
  let ocrWorker = null, labelPop = null;
  async function ocrReady(say) {
    if (!window.Tesseract) { say('Loading the label reader (first time only) ...'); await loadScript('vendor/ocr/tesseract.min.js'); }
    if (!ocrWorker) {
      say('Starting the label reader ...');
      const base = new URL('vendor/ocr/', location.href).href;
      ocrWorker = await window.Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base.replace(/\/$/, ''), gzip: true });
    }
    return ocrWorker;
  }
  /* the photo, made grey and big enough for small print */
  async function labelCanvas(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This file could not be opened as a picture.')); i.src = url; });
      const big = Math.max(img.naturalWidth, img.naturalHeight), k = big < 1600 ? Math.min(2.5, 1600 / big) : big > 3000 ? 3000 / big : 1;
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.25)'; g.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  /* every number on the label that could be an article code, in the order they appear (barcodes and dates left out) */
  function labelCandidates(text) {
    const out = [];
    for (const raw of String(text || '').split(/[^0-9A-Za-z|]+/)) {
      if (raw.length < 6 || raw.length > 14) continue;
      const digits = (raw.match(/\d/g) || []).length;
      if (digits < raw.length - 2) continue;                                                // a word, not a number
      const n = raw.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
      if (!/^\d{6,10}$/.test(n) || /^890\d+/.test(n) && n.length > 10) continue;
      if (!out.includes(n)) out.push(n);
    }
    return out;
  }
  /* which of them are articles on file: the everyday data first, then a look-up on the server */
  async function labelResolve(cands) {
    const found = [];
    for (const c of cands) if (S.M.articles[c]) found.push(c);
    for (const c of cands.filter((x) => !found.includes(x)).slice(0, 8)) {
      try { const r = await A.rpc('article_search', { p_q: c, p_limit: 10 }); const hit = (r || []).find((x) => x.article_code === c); if (hit) { S.extra[c] = S.extra[c] || hit; found.push(c); } } catch (e) { /* not found */ }
    }
    if (found.length) return { found };
    const near = [];                                                                          // one digit misread
    for (const c of cands) for (const code of Object.keys(S.M.articles)) {
      if (code.length !== c.length) continue;
      let d = 0; for (let i = 0; i < c.length && d < 2; i++) if (c[i] !== code[i]) d++;
      if (d === 1 && !near.includes(code)) near.push(code);
    }
    return { found, near: near.slice(0, 6) };
  }
  function labelStart() { const i = $('#label-in'); i.value = ''; i.click(); }
  async function checkLabel(blob, from) {
    if (!S.M) return;
    if (labelPop) labelPop.close();
    const pv = URL.createObjectURL(blob);
    labelPop = pop(`<div class="row top"><img class="lblimg" src="${pv}" alt="The label"><div class="grow stack"><h2 style="margin:0">Check a label</h2>
      <div class="row"><div class="spinner"></div><span class="muted" id="lbl-say">Reading the label ...</span></div></div></div>`, 'big labelpop');
    const me = labelPop, say = (t) => { const e = $('#lbl-say', me); if (e) e.textContent = t; };
    me.addEventListener('click', (e) => { if (e.target === me) me.close(); });
    let cands = [], res = { found: [] };
    try {
      const w = await ocrReady(say), canvas = await labelCanvas(blob);
      /* labels are laid out in different ways: read it as a page first, then as one block, then as loose words */
      for (const [i, psm] of ['3', '6', '11'].entries()) {
        say(i ? 'Reading it another way ...' : 'Reading the label ...');
        await w.setParameters({ tessedit_pageseg_mode: psm });
        const { data } = await w.recognize(canvas);
        const more = labelCandidates(data.text).filter((c) => !cands.includes(c));
        cands = cands.concat(more);
        if (!more.length) continue;
        say('Looking up the article ...');
        res = await labelResolve(cands);
        if (res.found.length || !me.isConnected) break;
      }
    } catch (e) { if (!me.isConnected) return; $('.pop', me).innerHTML = labelShell(pv, `<div class="note bad">${esc(e.message || String(e))}</div>${labelTypeBox()}`); return; }
    if (!me.isConnected) return;
    me.dataset.found = res.found.join(',');
    if (!res.found.length) {
      $('.pop', me).innerHTML = labelShell(pv, `<div class="note warn">No article code from the article files could be read on this picture${cands.length ? ` (numbers read: ${cands.slice(0, 6).map(esc).join(', ')})` : ''}.</div>
        ${res.near && res.near.length ? `<div>Did you mean: ${res.near.map((c) => `<button class="btn sm" data-act="labelShow" data-code="${c}">${c}</button>`).join(' ')}</div>` : ''}${labelTypeBox()}`);
      return;
    }
    labelShow(res.found[0], pv);
    void from;
  }
  const labelShell = (pv, inner) => `<div class="row top lblhead"><img class="lblimg" src="${pv}" alt="The label"><div class="grow stack"><div class="row"><h2 class="grow" style="margin:0">Check a label</h2><button class="btn sm" data-act="closePop">Close</button></div>${inner}</div></div>`;
  const labelTypeBox = () => `<form class="row wrap" id="lbl-type"><label class="f grow">Or type the article code<input name="code" inputmode="numeric" autocomplete="off" placeholder="e.g. 1210009817"></label><button class="btn primary">Show</button></form>`;
  async function labelShow(code, pv) {
    const me = labelPop; if (!me || !me.isConnected) return;
    pv = pv || ($('.lblimg', me) || {}).src || '';
    const found = (me.dataset.found || '').split(',').filter(Boolean);
    $('.pop', me).innerHTML = labelShell(pv, `<div class="row"><div class="spinner"></div><span class="muted">Getting ${esc(code)} ...</span></div>`);
    let d = null;
    try { d = await A.rpc('article_detail', { p_article: code }); } catch (e) { d = null; }
    if (qOn() && !S.qy.list) await qLoad(true).catch(() => {});
    if (!me.isConnected) return;
    $('.pop', me).innerHTML = labelShell(pv, (found.length > 1 ? `<div class="row wrap"><span class="small">Article codes on this picture:</span>${found.map((c) => `<button class="btn sm ${c === code ? 'primary' : ''}" data-act="labelShow" data-code="${c}">${c}</button>`).join('')}</div>` : '') + labelCardHtml(code, d));
    hydrate();
  }
  function labelCardHtml(code, d) {
    const M = S.M, a = (d && d.article) || M.articles[code] || S.extra[code];
    if (!a) return `<div class="note warn">Article ${esc(code)} is not in the article files.</div>${labelTypeBox()}`;
    const sites = (d && d.sites) || [], inw = (d && d.inwards) || [];
    const report = sites.reduce((t, s) => t + (s.total || 0), 0), inTot = inw.reduce((t, i) => t + i.qty, 0), dc = report + inTot, reserved = d ? d.reserved : 0, free = dc - reserved;
    const ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0), pack = C.packOf(a);
    const lines = M.lines.filter((l) => l.article_code === code);
    const waiting = lines.filter((l) => l.balance > 0).sort((x, y) => (x.order_date || '').localeCompare(y.order_date || ''));
    const pend = waiting.reduce((t, l) => t + l.balance, 0), short = Math.max(0, pend - Math.max(free, 0));
    const appr = lines.filter((l) => l.approved > 0), apprQty = appr.reduce((t, l) => t + l.approved, 0);
    const stores = (arr) => new Set(arr.map((l) => l.store_code)).size;
    const al = M.articles[code] ? C.alternates(M, code) : { same: [], diff: [] };
    const altFree = (arr) => arr.map((x) => [x, Math.max(0, C.freeOf(M, x.article_code))]).filter(([, f]) => f > 0).sort((x, y) => y[1] - x[1]);
    const sameF = altFree(al.same), diffF = altFree(al.diff), sumF = (arr) => arr.reduce((t, [, f]) => t + f, 0);
    const ly = d && d.ly && d.ly.lines ? d.ly : null, qs = (S.qy.list || []).filter((q) => q.article_code === code);
    const asof = M.meta.stock_asof ? when(M.meta.stock_asof) : '';
    /* the summary, in plain words */
    const say = [];
    say.push(!M.meta.stock_asof ? 'No DC stock report is loaded yet.'
      : `<b>Balance DC qty ${inr(free)} pcs</b>${dc ? ` (DC has ${inr(dc)}${reserved ? `, ${inr(reserved)} already allocated to orders` : ''})` : ' - none at the DC'}.`);
    if (waiting.length) say.push(`<b>${inr(stores(waiting))} ${plural(stores(waiting), 'store')} waiting</b> for ${inr(pend)} pcs${short ? ` - <span class="bad b">short by ${inr(short)}</span>` : M.meta.stock_asof ? ' - <span class="good b">the DC can cover it</span>' : ''}.`);
    else say.push('No store is waiting for this article.');
    if (apprQty) say.push(`${inr(apprQty)} pcs approved so far for ${inr(stores(appr))} ${plural(stores(appr), 'store')}.`);
    if (ppo) say.push(`Pending PO ${inr(ppo)} pcs - not in the DC stock until it arrives.`);
    if (sameF.length || diffF.length) say.push(`Alternates with balance: ${sameF.length ? `same design ${inr(sumF(sameF))} pcs` : ''}${sameF.length && diffF.length ? ', ' : ''}${diffF.length ? `same price, other design ${inr(sumF(diffF))} pcs` : ''}.`);
    else if (short) say.push('No alternate has balance at the DC.');
    if (ly) say.push(`Last year: ${inr(ly.lines)} order ${plural(ly.lines, 'line')} from ${inr(ly.stores)} ${plural(ly.stores, 'store')}, ${inr(ly.wq)} pcs wanted, ${inr(ly.fq)} approved.`);
    if (qs.length) say.push(`${inr(qs.length)} ${plural(qs.length, 'query', 'queries')} logged for this article (${inr(qs.reduce((t, q) => t + q.qty, 0))} pcs).`);
    const ssCell = (l) => (l.ss ? `<td class="right">${inr(l.ss.own.closing)}</td><td class="right">${inr(l.ss.own.transit)}</td><td class="right">${inr(l.ss.own.mtd)}</td>` : '<td></td><td></td><td></td>');
    const wait = waiting.length ? `<h3>Stores waiting</h3><div class="tablewrap"><table class="tight"><thead><tr><th>Store</th><th>Order</th><th class="right">Qty<br>wanted</th><th class="right">Pending<br>qty</th><th>Deliver by</th>${M.hasStoreStock ? '<th class="right">Store<br>closing</th><th class="right">In<br>transit</th><th class="right">MTD<br>sale</th>' : ''}</tr></thead><tbody>
      ${waiting.slice(0, 30).map((l) => `<tr><td><b>${esc(l.store_code)}</b> <span class="small">${esc(l.store_name)}</span></td><td class="small">${esc(ref(l))}</td><td class="right">${inr(l.req_qty)}</td><td class="right b">${inr(l.balance)}</td><td class="small">${delCell(l)}</td>${M.hasStoreStock ? ssCell(l) : ''}</tr>`).join('')}</tbody></table></div>${waiting.length > 30 ? `<p class="small">... and ${waiting.length - 30} more.</p>` : ''}` : '';
    const alts = sameF.length || diffF.length ? `<h3>Alternates with balance</h3><div class="small">${sameF.concat(diffF).slice(0, 6).map(([x, f]) => `<span class="nowrap"><b>${esc(x.article_code)}</b> ${esc(x.description || '')}: <b class="good">${inr(f)}</b></span>`).join(' &nbsp;|&nbsp; ')}</div>` : '';
    const qList = qs.length ? `<h3>Queries logged</h3><div class="small">${qs.slice(0, 5).map((q) => `${when(q.created_at)} &middot; <b>${esc(q.store_code)}</b> ${esc(q.store_name || '')} &middot; ${inr(q.qty)} pcs at Rs ${inr2(Number(q.price))} &middot; ${esc(q.by_name || '')}`).join('<br>')}</div>` : '';
    return `<div class="lblart">${thumb(code, 's')}<div class="grow"><div class="mcname">${esc(a.mc_name || '')}${a.mrp != null ? ' &nbsp;|&nbsp; MRP ' + inr2(Number(a.mrp)) : ''}</div><div><b class="acode">${esc(code)}</b> ${esc(a.description || '')}</div>
        <div class="small">Pack of ${pack}${a.status === 'In-Active' ? ' &middot; <span class="bad">In-Active</span>' : ''}${a.in_master ? '' : ' &middot; not in the Diwali range'}${asof ? ` &middot; DC stock as of ${asof}` : ''}</div></div></div>
      <div class="lblsay">${say.map((x) => `<div>${x}</div>`).join('')}</div>
      <div class="stats five">${stat('Total DC qty', inr(dc))}${stat('Allocated', inr(reserved))}${stat('Balance DC qty', inr(free), free > 0 ? 'good' : 'bad')}${stat('Pending qty', inr(pend), short ? 'bad' : '')}${stat('Pending PO', ppo ? inr(ppo) : '-')}</div>
      ${wait}${alts}${qList}
      <div class="row wrap" style="margin-top:12px"><button class="btn" data-act="labelOpenArt" data-code="${esc(code)}">Open article</button>${waiting.length ? `<button class="btn" data-act="labelOrders" data-code="${esc(code)}">See the pending orders</button>` : ''}${qOn() ? `<button class="btn primary" data-act="labelQuery" data-code="${esc(code)}">Log a query</button>` : ''}</div>`;
  }
  /* a photo shared to the installed app arrives through sw.js */
  async function labelFromShare() {
    if (!/[?&]shared=1/.test(location.search)) return;
    history.replaceState(null, '', location.pathname);
    let blob = null;
    try { const box = await caches.open('allocdesk-shared'), r = await box.match('shared-image'); if (r) { blob = await r.blob(); await box.delete('shared-image'); } } catch (e) { blob = null; }
    if (blob && blob.size) checkLabel(blob, 'share'); else tell('Check a label', 'No picture came through. Share the photo itself (not a link or a message), or use Check a label and choose it.');
  }

  /* ================= Sell-through: approved qty against the store's stock and MTD sale =================
     One row per store + article that has an approved (or dispatched) quantity. Closing stock, in transit (in transit + CLA)
     and MTD sale come from the store stock report (Data > 7). An approved alternate counts under its own article. */
  const stPct = (r) => (r.appr > 0 ? r.mtd / r.appr : null);
  function stRows() {
    const M = S.M, map = new Map();
    for (const l of M.lines) {
      if (!(l.approved > 0)) continue;
      const k = l.store_code + '|' + l.article_code;
      let r = map.get(k);
      if (!r) {
        const a = M.articles[l.article_code] || {}, st = M.stores[l.store_code] || {}, own = l.ss ? l.ss.own : { closing: 0, transit: 0, mtd: 0 };
        r = { store: l.store_code, sname: l.store_name || st.store_name || '', state: st.state || '', mc: l.mc_name || a.mc_name || '', art: l.article_code, desc: l.description || a.description || '',
          mrp: Number(l.mrp) || Number(a.mrp) || 0, appr: 0, value: 0, orders: new Set(), closing: own.closing, transit: own.transit, mtd: own.mtd, buyer: a.buyer || '' };
        map.set(k, r);
      }
      r.appr += l.approved; r.value += Number(l.value) || 0; r.orders.add(l.order_no);
    }
    return Array.from(map.values());
  }
  const ST_SORTS = { pct: 'Sold % (lowest first)', pct_high: 'Sold % (highest first)', appr: 'Approved qty (most first)', mtd: 'MTD sale (most first)', closing: 'Closing stock (most first)',
    store: 'Store code', mc: 'MC name', article: 'Article code', mrp: 'MRP (high to low)' };
  /* Group by: [label, key of a row, the heading: [big, name, small]] */
  const ST_GROUPS = {
    none: ['No grouping', null],
    store: ['Store', (r) => r.store, (r) => [r.store, r.sname, r.state]],
    state: ['State', (r) => r.state || '(state not on file)', (r) => [r.state || '(state not on file)', '', '']],
    mc: ['MC', (r) => r.mc.toUpperCase() || '(MC NOT GIVEN)', (r) => [r.mc || '(MC not given)', '', '']],
    mc_mrp: ['MC, then MRP', (r) => (r.mc.toUpperCase() || '(MC NOT GIVEN)') + '|' + r.mrp, (r) => [r.mc || '(MC not given)', 'MRP ' + inr2(r.mrp), '']],
    article: ['Article', (r) => r.art, (r) => [r.art, r.desc, r.mc]],
    buyer: ['Buyer', (r) => r.buyer || '(buyer not set)', (r) => [r.buyer || '(buyer not set)', '', '']]
  };
  const ST_STATUS = { nosale: ['No sale yet', (r) => r.mtd <= 0], slow: ['Slow (sold under 50%)', (r) => r.mtd > 0 && stPct(r) < 0.5],
    selling: ['Selling (50% to 99%)', (r) => stPct(r) >= 0.5 && stPct(r) < 1], sold: ['Sold all (100% or more)', (r) => stPct(r) >= 1] };
  const stSum = (rows) => rows.reduce((t, r) => { t.appr += r.appr; t.value += r.value; t.closing += r.closing; t.transit += r.transit; t.mtd += r.mtd; return t; },
    { appr: 0, value: 0, closing: 0, transit: 0, mtd: 0, store: '', mc: '', art: '', mrp: 0 });
  const ST_CMP = { pct: (a, b) => (stPct(a) ?? 9) - (stPct(b) ?? 9) || b.appr - a.appr, pct_high: (a, b) => (stPct(b) ?? -1) - (stPct(a) ?? -1) || b.appr - a.appr,
    appr: (a, b) => b.appr - a.appr, mtd: (a, b) => b.mtd - a.mtd, closing: (a, b) => b.closing - a.closing, store: (a, b) => a.store.localeCompare(b.store) || a.art.localeCompare(b.art),
    mc: (a, b) => a.mc.localeCompare(b.mc) || a.mrp - b.mrp || a.art.localeCompare(b.art), article: (a, b) => a.art.localeCompare(b.art) || a.store.localeCompare(b.store), mrp: (a, b) => b.mrp - a.mrp || a.art.localeCompare(b.art) };
  /* the rows that pass the search and the filters (store + article level), sorted */
  function stFiltered() {
    const T = S.st, words = T.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return stRows().filter((r) => (!words.length || words.every((w) => [r.store, r.sname, r.state, r.mc, r.art, r.desc, r.buyer].join(' ').toLowerCase().includes(w)))
      && (!T.status || ST_STATUS[T.status][1](r)) && (!T.store || r.store === T.store) && (!T.mc || r.mc === T.mc) && (!T.state || (r.state || '-') === T.state) && (!T.buyer || (r.buyer || '-') === T.buyer))
      .sort(ST_CMP[T.sort] || ST_CMP.pct);
  }
  function stActive() {
    const T = S.st, out = [];
    if (T.q.trim()) out.push(['q', 'Search: ' + T.q.trim()]);
    if (T.status) out.push(['status', ST_STATUS[T.status][0]]);
    if (T.store) out.push(['store', 'Store: ' + T.store + ' ' + ((S.M.stores[T.store] || {}).store_name || '')]);
    if (T.state) out.push(['state', 'State: ' + (T.state === '-' ? '(not on file)' : T.state)]);
    if (T.mc) out.push(['mc', 'MC: ' + T.mc]);
    if (T.buyer) out.push(['buyer', 'Buyer: ' + (T.buyer === '-' ? '(not set)' : T.buyer)]);
    return out;
  }
  const stChips = () => { const f = stActive();
    return f.length ? `<span class="small">Filters on:</span>${f.map(([k, t]) => `<button class="fchip" data-act="stClear" data-key="${k}" title="Remove this filter">${esc(t)} <b>&#10005;</b></button>`).join('')}
      <button class="btn link" data-act="stClearAll">Clear all filters</button>` : ''; };
  const stBadge = (r) => { const p = stPct(r);
    return r.mtd <= 0 ? '<span class="pill REJECTED">No sale yet</span>' : p >= 1 ? '<span class="pill APPROVED">Sold all</span>' : p >= 0.5 ? '<span class="pill PARTIAL">Selling</span>' : '<span class="pill AWAITING">Slow</span>'; };
  const stPctCell = (r) => { const p = stPct(r); return `<td class="right nowrap"><div class="stbar"><i style="width:${Math.min(100, Math.round((p || 0) * 100))}%"></i></div><b>${p == null ? '-' : Math.round(p * 100) + '%'}</b></td>`; };
  function stTableHtml() {
    const T = S.st, rows = stFiltered(), G = ST_GROUPS[T.group] || ST_GROUPS.none;
    if (!rows.length) return `<div class="empty card">${stRows().length ? 'Nothing matches these filters. <button class="btn sm" data-act="stClearAll">Clear all filters</button>' : 'Nothing is approved yet.'}</div>`;
    const tot = stSum(rows), nums = (x) => `<td class="right b big">${inr(x.appr)}</td><td class="right">${inr(x.closing)}</td><td class="right">${inr(x.transit)}</td><td class="right b big">${inr(x.mtd)}</td>${stPctCell(x)}`;
    const row = (r) => `<tr><td><b>${esc(r.store)}</b> <span class="small">${esc(r.sname)}</span>${r.state ? `<div class="small muted">${esc(r.state)}</div>` : ''}</td><td class="small">${esc(r.mc)}</td>
      <td class="artcell"><b class="nowrap pick" data-act="art" data-code="${esc(r.art)}">${esc(r.art)}</b><div class="small">${esc(r.desc)}</div></td><td class="right">${inr2(r.mrp)}</td>${nums(r)}<td>${stBadge(r)}</td></tr>`;
    let body = '', shown = 0, hidden = 0;
    if (!G[1]) {
      const part = rows.slice(0, T.limit); shown = part.length; hidden = rows.length - shown; body = part.map(row).join('');
    } else {
      const m = new Map();
      for (const r of rows) { const k = G[1](r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
      const groups = Array.from(m, ([key, rs]) => Object.assign(stSum(rs), { key, rs, head: G[2](rs[0]), store: rs[0].store, mc: rs[0].mc, art: rs[0].art, mrp: rs[0].mrp }));
      const byTotal = ['pct', 'pct_high', 'appr', 'mtd', 'closing', 'mrp'].includes(T.sort);
      groups.sort((a, b) => (byTotal ? (ST_CMP[T.sort])(a, b) : 0) || a.key.localeCompare(b.key));
      for (const g of groups) {
        if (shown >= T.limit) { hidden += g.rs.length; continue; }
        const closed = T.collapsed !== T.toggled.has(g.key), [big, name, small] = g.head;
        const nSt = new Set(g.rs.map((r) => r.store)).size, nArt = new Set(g.rs.map((r) => r.art)).size;
        const counts = [T.group === 'store' ? '' : `${nSt} ${plural(nSt, 'store')}`, T.group === 'article' ? '' : `${nArt} ${plural(nArt, 'article')}`].filter(Boolean).join(' &middot; ');
        body += `<tr class="stg ${closed ? 'closed' : ''}" data-act="stToggle" data-key="${esc(g.key)}" title="${closed ? 'Show' : 'Hide'} the lines under this heading"><td colspan="4"><span class="chev">${closed ? '&#9656;' : '&#9662;'}</span> <b>${esc(big)}</b>${name ? ` <span class="sname">${esc(name)}</span>` : ''}${small ? ` <span class="small muted">${esc(small)}</span>` : ''} <span class="small muted">&middot; ${counts}</span></td>${nums(g)}<td></td></tr>`;
        if (!closed) { body += g.rs.map(row).join(''); shown += g.rs.length; }
      }
    }
    return `<div class="tablewrap"><table class="tight sttable"><thead><tr><th>Store</th><th>MC</th><th>Article</th><th class="right">MRP</th><th class="right">Approved<br>order qty</th><th class="right">Closing<br>stock</th><th class="right">In<br>transit</th><th class="right">MTD<br>sale</th><th class="right">Sold<br>(MTD sale / approved)</th><th></th></tr></thead><tbody>
      <tr class="tot"><td colspan="4"><b>Total</b> <span class="small">${inr(rows.length)} store-article ${plural(rows.length, 'line')}, ${inr(new Set(rows.map((r) => r.store)).size)} stores</span></td>${nums(tot)}<td></td></tr>${body}</tbody></table></div>
      ${hidden ? `<div class="row" style="margin-top:8px"><span class="small grow">${inr(hidden)} more ${plural(hidden, 'line')} not shown.</span><button class="btn sm" data-act="stMore">Show more</button></div>` : ''}`;
  }
  function vSellThrough() {
    const M = S.M, T = S.st;
    const head = `<div class="head"><h1>Sell-through</h1><span class="sub">Approved order qty at each store against the store's stock and its sale this month (MTD)</span></div>`;
    if (!M.hasStoreStock) return head + `<div class="card stack"><h2>The store stock report is not loaded</h2><p>This screen uses the closing stock, in transit and MTD sale from the store stock report. ${editor() ? 'Upload it under Data, step 7.' : 'Ask the editor to upload it (Data, step 7).'}</p>${editor() ? '<div><button class="btn primary" data-act="nav" data-view="data">Open Data</button></div>' : ''}</div>`;
    const all = stRows();
    if (!all.length) return head + '<div class="card"><div class="empty">Nothing is approved yet. Approved lines show here with the store\'s stock and sale.</div></div>';
    const ta = all.reduce((t, r) => t + r.appr, 0), tm = all.reduce((t, r) => t + r.mtd, 0), cnt = (k) => all.filter(ST_STATUS[k][1]).length;
    const tile = (cls, t, v, s, k) => `<div class="tile ${cls}${k ? ' pick' : ''}" ${k ? `data-act="stTile" data-k="${k}" title="Show only these"` : ''}><h3>${t}</h3><b>${v}</b><span>${s}</span></div>`;
    const tiles = `<div class="tiles st4">${tile('lilac', 'Approved qty', inr(ta) + ' pcs', `${inr(all.length)} store-article lines, ${inr(new Set(all.map((r) => r.store)).size)} stores`)}
      ${tile('mint', 'MTD sale', inr(tm) + ' pcs', `${ta ? Math.round(tm / ta * 100) : 0}% of the approved qty; ${inr(cnt('sold'))} lines sold all`, 'sold')}
      ${tile('butter', 'Slow (under 50%)', inr(cnt('slow')), 'store-article lines - tap to see them', 'slow')}${tile('pink', 'No sale yet', inr(cnt('nosale')), 'store-article lines - tap to see them', 'nosale')}</div>`;
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`;
    const uniq = (f) => Array.from(new Set(all.map(f))).sort(), keep = (arr, v) => (v && !arr.includes(v) ? arr.concat([v]) : arr);
    const stores = uniq((r) => r.store), mcs = uniq((r) => r.mc).filter(Boolean), states = uniq((r) => r.state || '-'), buyers = uniq((r) => r.buyer || '-');
    const grouped = !!(ST_GROUPS[T.group] || [])[1];
    return head + `<p class="small" style="margin:-4px 0 10px">Store stock report loaded ${when(M.meta.sstock_loaded)} (${esc(M.meta.sstock_file || '')}). MTD sale is the store's whole sale of the article this month (corporate and regular), so a line approved last month, or an article the store also sells off the shelf, can read differently.</p>
      ${tiles}
      <div class="toolbar eight" style="margin-top:12px">
        <input type="search" id="stq" class="wide search" placeholder="Search store, state, MC, article ..." value="${esc(T.q)}" aria-label="Search">
        <select id="stgroup" class="gsel" aria-label="Group by" title="How the lines are grouped">${Object.keys(ST_GROUPS).map((k) => opt(k, 'Group by: ' + ST_GROUPS[k][0], T.group)).join('')}</select>
        <select id="stsort" class="gsel" aria-label="Sort by" title="The order of the lines (and of the groups)">${Object.keys(ST_SORTS).map((k) => opt(k, 'Sort by: ' + ST_SORTS[k], T.sort)).join('')}</select>
        <select id="ststatus" aria-label="Sale status">${opt('', 'Any sale status', T.status)}${Object.keys(ST_STATUS).map((k) => opt(k, ST_STATUS[k][0], T.status)).join('')}</select>
        <select id="ststore" aria-label="Store">${opt('', 'All stores', T.store)}${keep(stores, T.store).map((s) => opt(s, s + '  ' + ((M.stores[s] || {}).store_name || ''), T.store)).join('')}</select>
        <select id="ststate" aria-label="State">${opt('', 'All states', T.state)}${keep(states, T.state).map((s) => opt(s, s === '-' ? '(state not on file)' : s, T.state)).join('')}</select>
        <select id="stmc" aria-label="MC">${opt('', 'All MCs', T.mc)}${keep(mcs, T.mc).map((m) => opt(m, m, T.mc)).join('')}</select>
        <select id="stbuyer" aria-label="Buyer">${opt('', 'All buyers', T.buyer)}${keep(buyers, T.buyer).map((b) => opt(b, b === '-' ? '(buyer not set)' : b, T.buyer)).join('')}</select>
      </div>
      <div class="row wrap chipsbar" id="stchips">${stChips()}</div>
      <div class="row wrap bulkbar">${grouped ? `<button class="btn sm" data-act="stCollapse">${T.collapsed ? 'Open all groups' : 'Close all groups (summary only)'}</button>` : ''}
        <button class="btn sm" data-act="stExport" title="Excel file of exactly the lines listed below">Export these lines to Excel</button><span class="grow"></span></div>
      <div id="stlist">${stTableHtml()}</div>`;
  }
  function exportSellThrough() {
    const rows = stFiltered(), G = ST_GROUPS[S.st.group] || ST_GROUPS.none;
    if (!rows.length) return tell('Export', 'There is nothing to export here.');
    const pc = (r) => (stPct(r) == null ? '' : Math.round(stPct(r) * 1000) / 10), status = (r) => (r.mtd <= 0 ? 'No sale yet' : stPct(r) >= 1 ? 'Sold all' : stPct(r) >= 0.5 ? 'Selling' : 'Slow');
    return excelFile('Sell_Through', false, (sheet) => {
      sheet('Sell-through', ['Store Code', 'Store Name', 'State', 'MC Name', 'Article Code', 'Description', 'MRP', 'Buyer', 'Approved Order Qty', 'Approved Value', 'Closing Stock', 'In Transit', 'MTD Sale', 'Sold % (MTD sale / approved)', 'Status', 'Orders'],
        rows.map((r) => [r.store, r.sname, r.state, r.mc, r.art, r.desc, r.mrp, r.buyer, r.appr, Math.round(r.value), r.closing, r.transit, r.mtd, pc(r), status(r), Array.from(r.orders).join(', ')]));
      if (G[1]) {
        const m = new Map(); for (const r of rows) { const k = G[1](r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
        sheet(('By ' + G[0]).slice(0, 31), [G[0], 'Name', 'Stores', 'Articles', 'Approved Order Qty', 'Closing Stock', 'In Transit', 'MTD Sale', 'Sold %'],
          Array.from(m.values()).map((rs) => { const t = stSum(rs), h = G[2](rs[0]); return [h[0], h[1], new Set(rs.map((r) => r.store)).size, new Set(rs.map((r) => r.art)).size, t.appr, t.closing, t.transit, t.mtd, pc(t)]; }));
      }
      return `Exported ${inr(rows.length)} ${plural(rows.length, 'line')}` + (stActive().length ? ' (the filters you have on were applied)' : '');
    });
  }

  /* ================= Queries from the stores =================
     Anyone on the team, view-only people too, logs what a store asks for: store, article, discount or final price, quantity.
     Store and article details fill in by themselves; who logged it and when are set by the database. */
  const QBLANK = () => ({ store: '', art: '', disc: '', price: '', qty: '', remarks: '' });
  async function qLoad(force) {
    const Q = S.qy;
    if (!qOn() || Q.loading || (!force && Q.list && Q.rev === S.M.rev)) return;
    Q.loading = true; Q.rev = S.M.rev;
    try { Q.list = await A.rpc('queries_list', { p_limit: 50000 }) || []; Q.err = ''; } catch (e) { Q.err = e.message; }
    finally { Q.loading = false; }
    if (S.view === 'queries') setHtml('qlist', qListHtml());
  }
  /* the article for a code: the everyday data first, then anything looked up on the server */
  const qArt = (code) => (code ? artOf(code) || (S.qy.found[code] === undefined ? undefined : S.qy.found[code]) : null);
  async function qFindArt(code) {
    if (!code || artOf(code) || S.qy.found[code] !== undefined) return;
    try {
      const r = await A.rpc('article_search', { p_q: code, p_limit: 20 });
      const hit = (r || []).find((x) => x.article_code === code) || null;
      S.qy.found[code] = hit;
      if (hit) S.extra[code] = S.extra[code] || hit;
    } catch (e) { S.qy.found[code] = null; }
    if (C.code($('#qf-art') && $('#qf-art').value) === code) qInfo();
  }
  /* what is shown next to the boxes, worked out from what is typed */
  function qCalc() {
    const f = S.qy.form, sc = C.code(f.store).toUpperCase(), st = sc ? S.M.stores[sc] : null, ac = C.code(f.art), a = ac ? qArt(ac) : null;
    const mrp = a ? Number(a.mrp) || 0 : 0, price = +f.price || 0, qty = Math.round(+f.qty || 0);
    return { sc, st, ac, a, mrp, price, qty, value: Math.round(price * qty * 100) / 100, disc: mrp && price ? (1 - price / mrp) * 100 : null };
  }
  function qInfo() {
    const x = qCalc(), f = S.qy.form;
    setHtml('qf-store-info', (!x.sc ? '<span class="muted">Type the store code</span>' : x.st
      ? `<b>${esc(x.st.store_name || '')}</b><span>${x.st.state ? esc(x.st.state) : '<span class="warn">State not in the store list</span>'}</span><span>Lead time ${x.st.lead_time == null ? '<span class="warn">not in the store list</span>' : `<b>${x.st.lead_time} ${plural(x.st.lead_time, 'day')}</b>`}${x.st.dc ? ' from ' + esc(x.st.dc) : ''}</span>`
      : `<span class="bad">Store ${esc(x.sc)} is not in the store list</span>`) +
      (x.st && (!x.st.state || x.st.lead_time == null) ? `<div class="small muted" style="flex-basis:100%">${editor() ? 'Upload the lead-time store list under Data &gt; 4 Stores to fill this in.' : 'The editor can fill this in by uploading the lead-time store list (Data &gt; 4 Stores).'}</div>` : ''));
    setHtml('qf-art-info', !x.ac ? '<span class="muted">Type the article code</span>' : x.a === undefined ? '<span class="muted">Looking it up ...</span>' : x.a
      ? `<b>${esc(x.a.description || '')}</b><span>MRP <b>Rs ${inr2(x.mrp)}</b></span><span>${esc(x.a.mc_name || '')}</span>`
      : `<span class="bad">Article ${esc(x.ac)} is not in the article files</span>`);
    const over = x.mrp && x.price > x.mrp + 0.004;
    setHtml('qf-sum', `<span>Discount <b>${x.disc == null ? '-' : x.disc.toFixed(2) + '%'}</b></span><span>Final price <b>${x.price ? 'Rs ' + inr2(x.price) : '-'}</b></span><span>Quantity <b>${x.qty ? inr(x.qty) + ' pcs' : '-'}</b></span>
      <span class="big">Order value <b>${x.price && x.qty ? 'Rs ' + inr2(x.value) : '-'}</b></span>${over ? '<span class="bad">The final price is above MRP</span>' : ''}`);
    const ok = x.st && x.a && x.price > 0 && !over && x.qty > 0;
    const b = $('#qf-go'); if (b) b.disabled = !ok || S.qy.saving;
    if (x.ac && x.a === undefined) qFindArt(x.ac);
    void f;
  }
  /* discount and final price fill each other in; whichever was typed last wins */
  function qTyped(t) {
    const f = S.qy.form, map = { 'qf-store': 'store', 'qf-art': 'art', 'qf-disc': 'disc', 'qf-price': 'price', 'qf-qty': 'qty', 'qf-rem': 'remarks' };
    f[map[t.id]] = t.value;
    const x = qCalc();
    if (t.id === 'qf-disc' && x.mrp) { const d = +t.value; f.price = t.value === '' ? '' : String(Math.round(x.mrp * (1 - d / 100) * 100) / 100); $('#qf-price').value = f.price; }
    if (t.id === 'qf-price' && x.mrp) { f.disc = t.value === '' ? '' : String(Math.round((1 - (+t.value || 0) / x.mrp) * 10000) / 100); $('#qf-disc').value = f.disc; }
    if (t.id === 'qf-art' && x.mrp && (f.disc !== '' || f.price !== '')) {          // a new article: keep the discount, work the price out again
      if (f.disc !== '') { f.price = String(Math.round(x.mrp * (1 - (+f.disc || 0) / 100) * 100) / 100); $('#qf-price').value = f.price; }
    }
    qInfo();
  }
  async function qSubmit() {
    const Q = S.qy, x = qCalc();
    if (Q.saving || !(x.st && x.a && x.price > 0 && x.qty > 0)) return;
    Q.saving = true; qInfo();
    try {
      const r = await A.rpc('query_add', { p: { store: x.sc, article: x.ac, price: Math.round(x.price * 100) / 100, qty: x.qty, remarks: Q.form.remarks } });
      Q.form = Object.assign(QBLANK(), { store: Q.form.store });                  // the next query is often from the same store
      Q.last = r.id;
      toast(`Query logged: ${r.store_code} ${r.article_code}, ${inr(r.qty)} pcs, Rs ${inr2(Number(r.value))}`);
      Q.saving = false;
      await reload();
      await qLoad(true);
      const a = $('#qf-art'); if (a) a.focus();
    } catch (e) { Q.saving = false; qInfo(); await tell('Query not logged', e.message); }
  }
  function qRows() {
    const Q = S.qy, words = Q.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (Q.list || []).filter((r) => !words.length || words.every((w) => [r.store_code, r.store_name, r.state, r.article_code, r.description, r.mc_name, r.by_name, r.remarks].join(' ').toLowerCase().includes(w)));
  }
  function qListHtml() {
    const Q = S.qy, ed = editor();
    if (!Q.list) return `<div class="empty card">${Q.err ? esc(Q.err) : 'Loading the queries ...'}</div>`;
    const rows = qRows();
    if (!rows.length) return `<div class="empty card">${Q.list.length ? 'No query matches the search.' : 'No query logged yet.'}</div>`;
    const tv = rows.reduce((t, r) => t + Number(r.value || 0), 0), tq = rows.reduce((t, r) => t + (r.qty || 0), 0);
    const shown = rows.slice(0, 500);
    return `<div class="small" style="margin-bottom:6px">${inr(rows.length)} ${plural(rows.length, 'query', 'queries')}${rows.length < Q.list.length ? ` of ${inr(Q.list.length)}` : ''} &middot; ${inr(tq)} pcs &middot; order value <b>Rs ${inr(Math.round(tv))}</b></div>
      <div class="tablewrap"><table class="tight qtable"><thead><tr><th>Logged</th><th>Store</th><th>Article</th><th class="right">MRP</th><th class="right">Discount</th><th class="right">Final price</th><th class="right">Qty</th><th class="right">Order value</th><th>Remarks</th><th></th></tr></thead><tbody>
      ${shown.map((r) => `<tr class="${r.id === Q.last ? 'new' : ''}"><td class="nowrap">${when(r.created_at)}<div class="small">${esc(r.by_name || '')}</div></td>
        <td><b>${esc(r.store_code)}</b> <span class="small">${esc(r.store_name || '')}</span><div class="small">${esc(r.state || '')}${r.lead_time != null ? ` &middot; lead time ${r.lead_time} ${plural(r.lead_time, 'day')}` : ''}</div></td>
        <td class="artcell"><b class="nowrap">${esc(r.article_code)}</b><div class="small">${esc(r.description || '')}</div><div class="small muted">${esc(r.mc_name || '')}</div></td>
        <td class="right">${r.mrp == null ? '-' : inr2(Number(r.mrp))}</td><td class="right">${r.discount == null ? '-' : (Number(r.discount) * 100).toFixed(2) + '%'}</td>
        <td class="right b">${inr2(Number(r.price))}</td><td class="right b">${inr(r.qty)}</td><td class="right b">${inr2(Number(r.value))}</td>
        <td class="w small">${esc(r.remarks || '')}</td><td>${r.mine || ed ? `<button class="btn sm ghost" data-act="qDel" data-id="${r.id}" title="Remove this query">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<p class="small">Showing the newest 500; Export to Excel has all ${inr(rows.length)}.</p>` : ''}`;
  }
  function vQueries() {
    const Q = S.qy, f = Q.form;
    if (!qOn()) return `<div class="head"><h1>Queries</h1></div><div class="card"><div class="note warn">Queries need the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.</div></div>`;
    setTimeout(qInfo, 0);
    const stores = Object.values(S.M.stores);
    return `<div class="head"><h1>Queries</h1><span class="sub">What the stores ask for. Everyone on the team can log a query here, view-only too.</span></div>
      <div class="card stack qform"><h2>Log a query</h2>
        <div class="qgrid">
          <label class="f">Store code<input id="qf-store" type="text" list="qf-stores" autocomplete="off" value="${esc(f.store)}" placeholder="e.g. HD02"></label>
          <div class="qinfo" id="qf-store-info"></div>
          <label class="f">Article code<input id="qf-art" type="text" inputmode="numeric" autocomplete="off" value="${esc(f.art)}" placeholder="e.g. 1212013789"></label>
          <div class="qinfo" id="qf-art-info"></div>
        </div>
        <datalist id="qf-stores">${stores.slice(0, 3000).map((s) => `<option value="${esc(s.store_code)}">${esc(s.store_name || '')}</option>`).join('')}</datalist>
        <div class="qgrid4">
          <label class="f">Discount %<input id="qf-disc" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(f.disc)}" placeholder="or type the price"></label>
          <label class="f">Final price (Rs)<input id="qf-price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(f.price)}" placeholder="or type the discount"></label>
          <label class="f">Quantity (pcs)<input id="qf-qty" type="number" min="1" step="1" inputmode="numeric" value="${esc(f.qty)}"></label>
          <label class="f">Remarks (optional)<input id="qf-rem" type="text" maxlength="500" value="${esc(f.remarks)}"></label>
        </div>
        <div class="qsum" id="qf-sum"></div>
        <div class="row wrap"><span class="small grow">Logged in your name (${esc(S.me.name || S.me.email)}), with the date and time, when you press Submit.</span>
          <button class="btn" data-act="qClear">Clear</button><button class="btn primary" id="qf-go" data-act="qSubmit" disabled>Submit</button></div></div>
      <div class="card stack" style="margin-top:12px"><div class="row wrap"><h2 class="grow">All queries</h2><input type="search" id="qq" placeholder="Search store, article, MC, person ..." value="${esc(Q.q)}" style="max-width:300px"><button class="btn sm" data-act="qExport">Export to Excel</button></div>
        <div id="qlist">${qListHtml()}</div></div>`;
  }
  function exportQueries() {
    const Q = S.qy;
    if (!Q.list || !Q.list.length) return tell('Export', 'There are no queries to export.');
    const rows = qRows();
    return excelFile('Store_Queries', false, (sheet) => {
      sheet('Queries', ['Logged on', 'Time', 'Logged by', 'Store Code', 'Store Name', 'State', 'Lead Time (days)', 'Article Code', 'Description', 'MC Name', 'MRP', 'Discount %', 'Final Price', 'Qty', 'Order Value', 'Remarks'],
        rows.map((r) => { const d = new Date(r.created_at), p2 = (n) => String(n).padStart(2, '0');
          return [`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, `${p2(d.getHours())}:${p2(d.getMinutes())}`, r.by_name, r.store_code, r.store_name, r.state, r.lead_time, r.article_code, r.description, r.mc_name,
            r.mrp == null ? null : Number(r.mrp), r.discount == null ? null : Math.round(Number(r.discount) * 10000) / 100, Number(r.price), r.qty, Number(r.value), r.remarks || '']; }));
      return `Exported ${inr(rows.length)} ${plural(rows.length, 'query', 'queries')}` + (rows.length < Q.list.length ? ' (the search you have on was applied)' : '');
    });
  }

  /* ================= This year against last year =================
     Day k of a season is D-(30-k); D-30 is 20 Sep 2025 last year and 9 Oct 2026 this year (changeable).
     "Same days so far" compares D-30 up to yesterday's D-day in both years, cumulatively. */
  const LYC = '#C2761C', TYC = '#5B3FD1';
  const BASIS = { ordered: ['wq', 'wv', 'ordered'], approved: ['fq', 'fv', 'approved'] };
  const crore = (v) => { v = Number(v) || 0; const a = Math.abs(v); return a >= 1e7 ? 'Rs ' + (v / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? 'Rs ' + (v / 1e5).toFixed(2) + ' L' : 'Rs ' + inr(Math.round(v)); };
  const pcsShort = (v) => { v = Number(v) || 0; return Math.abs(v) >= 1e5 ? (v / 1e5).toFixed(2) + ' L pcs' : inr(Math.round(v)) + ' pcs'; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dmy = (ymd, yr) => (ymd ? +ymd.slice(8, 10) + ' ' + MON[+ymd.slice(5, 7) - 1] + (yr ? ' ' + ymd.slice(0, 4) : '') : '');
  const growNum = (ty, ly) => C.growth(ty, ly);
  const growHtml = (ty, ly) => { const g = C.growth(ty, ly); return g == null ? `<span class="muted">${ty > 0 ? 'new' : '-'}</span>` : `<span class="${g >= 0 ? 'good' : 'bad'} b">${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%</span>`; };
  const growText = (ty, ly) => { const g = C.growth(ty, ly); return g == null ? (ty > 0 ? 'new' : '') : (g >= 0 ? '+' : '') + (g * 100).toFixed(1) + '%'; };
  const axisFmt = (v, key) => { const t = key.endsWith('v') ? crore(v).replace('Rs ', '') : pcsShort(v).replace(' pcs', ''); return t.replace(/\.0+ /, ' ').replace(/(\.\d)0 /, '$1 '); };
  const lyCut = (SE) => (S.ly.period === 'all' ? 30 : SE.upto);
  const span = (a, b) => (a === b ? dmy(a, true) : a.slice(0, 7) === b.slice(0, 7) ? +a.slice(8, 10) + '-' + dmy(b, true) : dmy(a) + ' - ' + dmy(b, true));
  const lyRange = (SE, cut) => (cut < 0 ? '' : { ly: span(SE.ly0, SE.lyDate(cut)), ty: span(SE.ty0, SE.tyDate(cut)) });
  function lyLoad() {
    const L = S.ly;
    if (!hasLy()) return;
    if (L.batch !== S.M.meta.ly_batch) { L.sum = null; L.stores = null; L.lines = null; L.err = ''; }
    if (L.sum || L.loading || L.err) return;
    L.loading = true;
    const want = S.M.meta.ly_batch;
    Promise.all([A.rpc('ly_summary'), A.rpc('ly_stores')])
      .then(([a, b]) => { L.sum = a || []; L.stores = b || []; L.batch = want; })
      .catch((e) => { L.err = e.message; })
      .finally(() => { L.loading = false; if (S.view === 'lastyear') render(); });
  }
  /* The k of a booking day in a season: before D-30 counts on D-30. */
  const kOf = (d0, ymd) => Math.max(0, C.dayDiff(d0, ymd));
  /* This year's line, counted the same way as last year: ordered = the order line as booked (qty x price wanted, rejected or not);
     approved = what is approved on it, at the price approved (an approved alternate counts under its own article). */
  const tyQV = (l, basis) => (basis === 'ordered' ? (l.parent_id ? [0, 0] : [l.sap_qty, l.sap_qty * l.req_price]) : [l.approved, Number(l.value) || 0]);
  const tyIn = (SE, l, cut) => (S.ly.period === 'all' ? true : !!l.order_date && kOf(SE.ty0, l.order_date) <= cut);

  /* A cumulative line chart: last year all 31 days, this year up to the last complete day. Hover shows the D-day. */
  function seasonChart(SE, key, opt) {
    opt = opt || {};
    const W = S.wide ? 1000 : 420, H = opt.h || (S.wide ? 300 : 260), pl = S.wide ? 76 : 58, pr = S.wide ? 92 : 70, pt = 16, pb = 30, n = SE.lyCum.length - 1;
    const ly = SE.lyCum.map((d) => d[key]), last = Math.max(-1, Math.min(n, opt.upto != null ? opt.upto : SE.upto)), ty = SE.tyCum.slice(0, last + 1).map((d) => d[key]);
    const top = Math.max(1, ...ly, ...ty);
    const mag = Math.pow(10, Math.floor(Math.log10(top / 4))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => top / s <= 4.5) || mag * 10, ymax = Math.ceil(top / step) * step;
    const x = (k) => pl + k * (W - pl - pr) / n, y = (v) => pt + (H - pt - pb) * (1 - v / ymax);
    const fmt = key.endsWith('v') ? crore : pcsShort;
    let g = '';
    for (let v = 0; v <= ymax + step / 2; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#ECE7F8" stroke-width="1"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${esc(v ? axisFmt(v, key) : '0')}</text>`;
    for (let k = 0; k <= n; k += S.wide ? 5 : 10) g += `<text x="${x(k)}" y="${H - 8}" text-anchor="middle" class="ax">D-${30 - k}</text>`;
    const path = (arr) => arr.map((v, k) => (k ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const endLbl = (arr, col, name) => { const k = arr.length - 1; return k < 0 ? '' : `<circle cx="${x(k)}" cy="${y(arr[k])}" r="4.5" fill="${col}" stroke="#fff" stroke-width="2"/>`; };
    /* direct labels at the right edge (this year's at its own end), pushed apart when they would touch */
    let lyY = y(ly[n]), tyY = ty.length ? y(ty[ty.length - 1]) : null;
    const tyX = ty.length ? x(ty.length - 1) + 8 : 0;
    if (tyY != null && Math.abs(tyY - lyY) < 14 && tyX > W - pr - 40) { if (tyY < lyY) tyY = lyY - 14; else tyY = lyY + 14; }
    const lbl = `<text x="${x(n) + 8}" y="${lyY + 4}" class="dl">Last year</text>` + (ty.length ? `<text x="${tyX}" y="${tyY + 4}" class="dl b">This year</text>` : '');
    const mark = last >= 0 && last < n ? `<line x1="${x(last)}" x2="${x(last)}" y1="${pt}" y2="${H - pb}" stroke="#CFC6EE" stroke-dasharray="3 3"/>` : '';
    const data = JSON.stringify({ k: key, n, last, ly, ty, lyd: Array.from({ length: n + 1 }, (_, k) => SE.lyDate(k)), tyd: Array.from({ length: n + 1 }, (_, k) => SE.tyDate(k)), pl, pr, W });
    return `<div class="lychart${opt.mini ? ' mini' : ''}" data-chart='${esc(data)}'>
      <div class="legend"><span><i style="background:${TYC}"></i>This year (from ${esc(dmy(SE.ty0, true))})</span><span><i style="background:${LYC}"></i>Last year (from ${esc(dmy(SE.ly0, true))})</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative ${key.endsWith('v') ? 'value' : 'quantity'} by D-day, this year against last year">${g}${mark}
        <path d="${path(ly)}" fill="none" stroke="${LYC}" stroke-width="2" stroke-linejoin="round"/>${ty.length ? `<path d="${path(ty)}" fill="none" stroke="${TYC}" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
        ${endLbl(ly, LYC)}${endLbl(ty, TYC)}${lbl}
        <line class="xh" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="#2E2A4A" stroke-opacity=".35" style="display:none"/>
        <rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}" fill="transparent" class="hit"/></svg>
      <div class="tip" hidden></div></div>`;
  }
  /* hover: a crosshair and the two years' totals on that D-day */
  function wireCharts() {
    $$('.lychart').forEach((box) => {
      if (box.dataset.wired) return; box.dataset.wired = '1';
      const d = JSON.parse(box.dataset.chart), svg = $('svg', box), tip = $('.tip', box), xh = $('.xh', svg), fmt = d.k.endsWith('v') ? (v) => 'Rs ' + inr(Math.round(v)) : (v) => inr(Math.round(v)) + ' pcs';
      const move = (ev) => {
        const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * d.W / r.width;
        const k = Math.max(0, Math.min(d.n, Math.round((sx - d.pl) / ((d.W - d.pl - d.pr) / d.n))));
        const px = d.pl + k * (d.W - d.pl - d.pr) / d.n;
        xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.style.display = '';
        const t = k <= d.last ? d.ty[k] : null;
        tip.innerHTML = `<b>D-${30 - k}</b> &middot; total so far<div><i style="background:${TYC}"></i>This year (to ${dmy(d.tyd[k])}): <b>${t == null ? 'not yet' : fmt(t)}</b></div><div><i style="background:${LYC}"></i>Last year (to ${dmy(d.lyd[k])}): <b>${fmt(d.ly[k])}</b></div>${t != null && d.ly[k] > 0 ? `<div>Change: <b>${growText(t, d.ly[k])}</b></div>` : ''}`;
        tip.hidden = false;
        const bx = box.getBoundingClientRect(), left = px * r.width / d.W + (r.left - bx.left);
        tip.style.left = Math.max(0, Math.min(bx.width - tip.offsetWidth, left + 12 > bx.width - tip.offsetWidth ? left - tip.offsetWidth - 12 : left + 12)) + 'px';
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', () => { tip.hidden = true; xh.style.display = 'none'; });
    });
  }

  /* The dashboard card: the order trend this year against last year, up to yesterday */
  function lyDashCard() {
    if (!lyOn()) return '';
    if (!hasLy()) return editor() ? `<div class="card stack" style="margin-top:12px"><div class="row"><h2 class="grow">Orders vs last year</h2></div><div class="note info">Load last year's order tracker (Data, step 10) to follow this year's orders against last year, day by day from D-30.</div><div><button class="btn sm" data-act="nav" data-view="data">Open Data</button></div></div>` : '';
    const SE = C.season(S.M, S.M.lyDaily), u = SE.upto;
    if (u < 0) return `<div class="card stack" style="margin-top:12px"><h2>Orders vs last year</h2><div class="note info">D-30 this year is ${esc(dmy(SE.ty0, true))}. The comparison with last year (from ${esc(dmy(SE.ly0, true))}) starts the day after.</div></div>`;
    const ly = SE.lyCum[u], ty = SE.tyCum[u], r = lyRange(SE, u);
    const big = (t, a, b, f) => `<div class="lybig"><span>${t}</span><b>${f(b)}</b><span class="small">last year ${f(a)}</span><span>${growHtml(b, a)}</span></div>`;
    return `<div class="card stack" style="margin-top:12px"><div class="row wrap"><h2 class="grow">Orders vs last year, ${SE.label(0)} to ${SE.label(u)}</h2><button class="btn sm" data-act="nav" data-view="lastyear">Open</button></div>
      <p class="small">Total so far: this year ${esc(r.ty)}, last year ${esc(r.ly)} (the same D-days, up to yesterday). Ordered = qty wanted at the price wanted, rejected lines included.</p>
      <div class="lybigs">${big('Value ordered', ly.wv, ty.wv, crore)}${big('Qty ordered', ly.wq, ty.wq, pcsShort)}${big('Orders', ly.o, ty.o, inr)}${big('Value approved', ly.fv, ty.fv, crore)}</div>
      ${seasonChart(SE, 'wv', { h: 190, mini: true })}</div>`;
  }

  function vLastYear() {
    const M = S.M, ed = editor(), L = S.ly;
    const head = (sub) => `<div class="head"><h1>This year vs last year</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
    if (!lyOn()) return head('') + `<div class="card"><div class="note warn">This needs the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.</div></div>`;
    if (!hasLy()) return head('') + `<div class="card stack"><h2>Last year's orders are not loaded yet</h2><p>Upload last year's corporate order tracker under Data, step 10. This page then compares this year's orders with last year's: day by day from D-30, by MC and MRP, and by store.</p>
      ${ed ? '<div><button class="btn primary" data-act="nav" data-view="data">Open Data</button></div>' : '<p class="muted">Ask the editor to load it.</p>'}</div>`;
    const SE = C.season(M, M.lyDaily), cut = lyCut(SE), [qk, vk, word] = BASIS[L.basis], r = lyRange(SE, cut);
    const lyN = M.lyDaily.reduce((t, x) => t + x[1], 0);
    const sub = `Last year: ${esc(M.meta.ly_file || '')} (${inr(lyN)} lines). D-30 = <b>${esc(dmy(SE.ly0, true))}</b> last year and <b>${esc(dmy(SE.ty0, true))}</b> this year.`;
    const segs = (act, cur, opts) => `<div class="segs">${opts.map(([k, t]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${t}</button>`).join('')}</div>`;
    const controls = `<div class="row wrap lyctl">${segs('lyPeriod', L.period, [['same', SE.upto >= 0 ? `Same days so far (${SE.label(0)} to ${SE.label(Math.max(0, SE.upto))})` : 'Same days so far'], ['all', 'Whole season']])}
      ${segs('lyBasis', L.basis, [['ordered', 'Ordered'], ['approved', 'Approved']])}<span class="grow"></span>
      ${ed ? '<button class="btn sm" data-act="lySeason">Change D-30 dates ...</button>' : ''}<button class="btn sm" data-act="lyExport">Export to Excel</button></div>`;
    if (cut < 0) return head(sub) + controls + `<div class="card"><div class="note info">D-30 this year is ${esc(dmy(SE.ty0, true))}. The day-by-day comparison starts the day after, once a full day of orders is in. Choose "Whole season" to see last year's season in full.</div></div>`;
    const LY = SE.lyCum[cut], TY = SE.tyCum[cut];
    /* the headline table */
    const kr = (t, a, b, f, note) => `<tr><td>${t}${note ? `<div class="small">${note}</div>` : ''}</td><td class="right num">${f(a)}</td><td class="right num b">${f(b)}</td><td class="right">${growHtml(b, a)}</td></tr>`;
    const rs = (v) => 'Rs ' + inr(Math.round(v)), pcs = (v) => inr(Math.round(v)), pc = (v) => (v == null ? '-' : (v * 100).toFixed(1) + '%');
    const share = (x) => (x.wv ? x.fv / x.wv : null), avg = (x) => (x.o ? x.wv / x.o : 0);
    const kpi = `<div class="card stack"><h2>${L.period === 'all' ? 'Whole season' : `Total so far, ${SE.label(0)} to ${SE.label(cut)}`}</h2>
      <div class="tablewrap"><table class="lykpi"><thead><tr><th></th><th class="right">Last year<div class="small">${esc(r.ly)}</div></th><th class="right">This year<div class="small">${esc(r.ty)}${L.period === 'all' ? ', so far' : ''}</div></th><th class="right">Change</th></tr></thead><tbody>
      ${kr('Orders', LY.o, TY.o, pcs)}${kr('Order lines', LY.n, TY.n, pcs)}${kr('Qty ordered (pcs)', LY.wq, TY.wq, pcs)}${kr('Value ordered', LY.wv, TY.wv, rs, 'qty wanted x price wanted')}
      ${kr('Qty approved (pcs)', LY.fq, TY.fq, pcs)}${kr('Value approved', LY.fv, TY.fv, rs, 'at the price approved')}
      <tr><td>Approved, as a share of the value ordered</td><td class="right num">${pc(share(LY))}</td><td class="right num b">${pc(share(TY))}</td><td class="right muted">${share(LY) != null && share(TY) != null ? ((share(TY) - share(LY)) * 100 >= 0 ? '+' : '') + ((share(TY) - share(LY)) * 100).toFixed(1) + ' pts' : '-'}</td></tr>
      ${kr('Average order value', avg(LY), avg(TY), rs)}</tbody></table></div>
      <p class="small">Last year's approvals are final; this year's are still being made, so "approved" this year grows as pending orders are decided.${SE.tyBefore ? ` ${inr(SE.tyBefore)} ${plural(SE.tyBefore, 'line')} this year ${SE.tyBefore === 1 ? 'was' : 'were'} booked before ${esc(dmy(SE.ty0))}; ${SE.tyBefore === 1 ? 'it counts' : 'they count'} on D-30.` : ''}${SE.lyBefore ? ` ${inr(SE.lyBefore)} last-year ${plural(SE.lyBefore, 'line')} booked before ${esc(dmy(SE.ly0))} count on D-30.` : ''}${SE.lyAfter ? ` ${inr(SE.lyAfter)} last-year ${plural(SE.lyAfter, 'line')} booked after D-0 ${SE.lyAfter === 1 ? 'is' : 'are'} not in the D-day figures.` : ''}${SE.tyAfter ? ` ${inr(SE.tyAfter)} ${plural(SE.tyAfter, 'line')} this year booked after D-0 ${SE.tyAfter === 1 ? 'is' : 'are'} not in the D-day figures.` : ''}</p></div>`;
    /* chart */
    const ck = L.unit === 'value' ? vk : qk;
    const chart = `<div class="card stack"><div class="row wrap"><h2 class="grow">${L.unit === 'value' ? 'Value' : 'Quantity'} ${word}, total so far by D-day</h2>${segs('lyUnit', L.unit, [['value', 'Value'], ['qty', 'Qty']])}</div>
      ${seasonChart(SE, ck)}<p class="small">Each point is the total from D-30 up to that day. The dotted line is yesterday (${esc(SE.label(Math.max(0, SE.upto)))}), the last full day this year.</p></div>`;
    /* day by day */
    const rows = [];
    for (let k = 0; k <= 30; k++) {
      const done = k <= SE.upto, today = k === SE.kToday, a = SE.lyCum[k], b = SE.tyCum[k], ad = SE.lyDay[k], bd = SE.tyDay[k];
      const tyc = (v, f) => (done ? f(v) : today ? `<span class="muted">${f(v)} so far</span>` : '');
      rows.push(`<tr class="${k === SE.upto ? 'hl' : ''}${!done && !today ? ' later' : ''}"><td class="b nowrap">${SE.label(k)}</td><td class="nowrap">${dmy(SE.lyDate(k))}</td><td class="nowrap">${dmy(SE.tyDate(k))}</td>
        <td class="right">${rs(ad[vk])}</td><td class="right">${tyc(bd[vk], rs)}</td>
        <td class="right">${pcs(a[qk])}</td><td class="right b">${tyc(b[qk], pcs)}</td><td class="right">${done ? growHtml(b[qk], a[qk]) : ''}</td>
        <td class="right">${rs(a[vk])}</td><td class="right b">${tyc(b[vk], rs)}</td><td class="right">${done ? growHtml(b[vk], a[vk]) : ''}</td></tr>`);
    }
    const dayCard = `<div class="card stack"><h2>Day by day (${word})</h2>
      <div class="tablewrap"><table class="tight lyday"><thead><tr><th>D-day</th><th>Last year</th><th>This year</th><th class="right">Value that day<br>last year</th><th class="right">Value that day<br>this year</th>
        <th class="right">Qty so far<br>last year</th><th class="right">Qty so far<br>this year</th><th class="right">Qty<br>change</th><th class="right">Value so far<br>last year (Rs)</th><th class="right">Value so far<br>this year (Rs)</th><th class="right">Value<br>change</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
      <p class="small">"So far" = from D-30 up to that day. The highlighted row is yesterday, the latest full day; today's figures show as "so far".</p></div>`;
    /* by MC and MRP */
    const wait = !L.sum ? `<div class="note info">${L.err ? esc(L.err) : 'Loading last year ...'}</div>` : '';
    const mcs = lyByMc(SE, cut), q = L.q.trim().toLowerCase(), shown = q ? mcs.filter((g) => g.mc.toLowerCase().includes(q)) : mcs;
    const tot = mcs.reduce((t, g) => { for (const k in t) t[k] += g.t[k]; return t; }, { lq: 0, tq: 0, lv: 0, tv: 0 });
    const mrow = (cls, label, x, attrs) => `<tr class="${cls}" ${attrs || ''}><td>${label}</td><td class="right">${pcs(x.lq)}</td><td class="right b">${pcs(x.tq)}</td><td class="right">${growHtml(x.tq, x.lq)}</td>
      <td class="right">${rs(x.lv)}</td><td class="right b">${rs(x.tv)}</td><td class="right">${growHtml(x.tv, x.lv)}</td></tr>`;
    const body = shown.map((g) => { const open = L.all || L.open.has(g.key);
      return mrow('mc pick', `<span class="caret">${open ? '&#9662;' : '&#9656;'}</span> <b>${esc(g.mc)}</b> <span class="small">${g.rows.length} MRP${g.rows.length === 1 ? '' : 's'}</span>`, g.t, `data-act="lyMc" data-mc="${esc(g.key)}"`) +
        (open ? g.rows.map((x) => mrow('mrp', `<span class="ind">MRP Rs ${inr2(x.mrp)}</span>`, x)).join('') : ''); }).join('');
    const mcCard = `<div class="card stack"><div class="row wrap"><h2 class="grow">By MC and MRP (${word})</h2>
        <input type="search" id="lymq" placeholder="Find an MC ..." value="${esc(L.q)}" style="max-width:240px"><button class="btn sm" data-act="lyAll">${L.all ? 'Close all' : 'Open all MRPs'}</button></div>
      ${wait}<div class="tablewrap"><table class="tight lymc"><thead><tr><th>MC / MRP</th><th class="right">Qty<br>last year</th><th class="right">Qty<br>this year</th><th class="right">Qty<br>change</th><th class="right">Value last year<br>(Rs)</th><th class="right">Value this year<br>(Rs)</th><th class="right">Value<br>change</th></tr></thead>
      <tbody>${mrow('tot', '<b>All MCs</b>', tot)}${body || `<tr><td colspan="7" class="muted">${L.loading ? 'Loading last year ...' : L.err ? esc(L.err) : 'No MC matches.'}</td></tr>`}</tbody></table></div>
      <p class="small">${L.period === 'all' ? 'Whole season, both years.' : `${esc(r.ly)} last year against ${esc(r.ty)} this year.`} Tap an MC to see its MRPs. MCs are matched by name; this year's MC comes from the order line or the article.</p></div>`;
    /* by store */
    const st = lyByStore(SE, cut), sq = L.sq.trim().toLowerCase();
    const missing = st.filter((x) => x.lyAll > 0 && !x.tyAll), missV = missing.reduce((t, x) => t + x.lyAllV, 0);
    let srows = st.filter((x) => (!L.sonly || (x.lyAll > 0 && !x.tyAll)) && (!sq || (x.s + ' ' + x.name).toLowerCase().includes(sq)));
    const more = srows.length > 300; srows = srows.slice(0, 300);
    const storeCard = `<div class="card stack"><div class="row wrap"><h2 class="grow">By store (${word})</h2>
        <input type="search" id="lysq" placeholder="Find a store ..." value="${esc(L.sq)}" style="max-width:220px">
        <label class="row small"><input type="checkbox" id="lysonly" ${L.sonly ? 'checked' : ''}> Ordered last year, nothing yet this year</label></div>
      ${wait}${missing.length && L.stores ? `<div class="note warn"><b>${inr(missing.length)} ${plural(missing.length, 'store')}</b> ordered last year (${esc(crore(missV))} ${word} over the whole season) and ${missing.length === 1 ? 'has' : 'have'} not ordered anything this year yet.</div>` : ''}
      <div class="tablewrap"><table class="tight lystore"><thead><tr><th>Store</th><th class="right">Lines<br>last year</th><th class="right">Lines<br>this year</th><th class="right">Value last year<br>(Rs)</th><th class="right">Value this year<br>(Rs)</th><th class="right">Change</th></tr></thead>
      <tbody>${srows.map((x) => `<tr><td><b>${esc(x.s)}</b> <span class="small">${esc(x.name)}</span></td><td class="right">${inr(x.ln)}</td><td class="right b">${inr(x.tn)}</td><td class="right">${rs(x.lv)}</td><td class="right b">${rs(x.tv)}</td><td class="right">${growHtml(x.tv, x.lv)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">${L.loading ? 'Loading last year ...' : 'No store matches.'}</td></tr>`}</tbody></table></div>
      ${more ? '<p class="small">Showing the first 300 stores; use the search box or Export for the rest.</p>' : ''}<p class="small">${L.period === 'all' ? 'Whole season, both years.' : `${esc(r.ly)} last year against ${esc(r.ty)} this year.`} Sorted by last year's value.</p></div>`;
    /* last year's lines */
    const lines = L.lines;
    const lineCard = `<div class="card stack"><h2>Look up last year's orders</h2>
      <div class="row wrap"><input type="search" id="lylq" placeholder="Article, order, store, MC ... then Enter" value="${esc(L.lq)}" style="max-width:360px"><button class="btn sm" data-act="lyFind">Find</button></div>
      ${lines ? (lines.length ? `<div class="tablewrap"><table class="tight lylines"><thead><tr><th>Booked</th><th>Order</th><th>Store</th><th>Article</th><th>MC</th><th class="right">MRP</th><th class="right">Qty wanted</th><th class="right">Price wanted</th><th class="right">Final qty</th><th class="right">Order value</th><th>Status</th></tr></thead><tbody>
        ${lines.map((x) => `<tr><td class="nowrap">${esc(dmy(x.book_date, true))}<div class="small">${SE ? SE.label(Math.min(30, kOf(SE.ly0, x.book_date))) : ''}</div></td><td class="nowrap">${esc(x.order_no)}</td><td><b>${esc(x.store_code || '')}</b><div class="small">${esc(x.store_name || '')}</div></td>
          <td class="artcell"><b class="nowrap">${esc(x.article_code)}</b><div class="small">${esc(x.description || '')}</div></td><td class="small">${esc(x.mc_name || '')}</td><td class="right">${x.mrp == null ? '' : inr2(x.mrp)}</td>
          <td class="right b">${inr(x.req_qty)}</td><td class="right">${x.req_price == null ? '' : inr2(x.req_price)}</td><td class="right b">${inr(x.final_qty || 0)}</td><td class="right">${inr(Math.round(x.order_value || 0))}</td>
          <td><span class="small">${esc(x.status || '')}</span>${x.remarks && x.remarks !== x.status ? `<div class="small muted">${esc(x.remarks)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>${lines.length >= 200 ? '<p class="small">The first 200 lines are shown; type more words to narrow it down.</p>' : ''}`
        : '<div class="note info">Nothing found in last year\'s orders.</div>') : '<p class="small">Search last year\'s order lines - for example an article code, to see which stores took it and how much.</p>'}</div>`;
    return head(sub) + controls + `<div class="lystack">${kpi}${chart}${dayCard}${mcCard}${storeCard}${lineCard}</div>`;
  }
  /* MC -> MRP rows: {key, mc, t: {lq, tq, lv, tv}, rows: [{mrp, lq, tq, lv, tv}]} sorted by the bigger of the two years' values */
  function lyByMc(SE, cut) {
    const L = S.ly, all = L.period === 'all', groups = new Map(), z = () => ({ lq: 0, tq: 0, lv: 0, tv: 0 });
    const slot = (mc, mrp) => {
      const name = String(mc || '').trim() || '(MC not given)', key = name.toUpperCase();
      let g = groups.get(key); if (!g) { g = { key, mc: name, t: z(), m: new Map() }; groups.set(key, g); }
      const p = Math.round((Number(mrp) || 0) * 100) / 100;
      let x = g.m.get(p); if (!x) { x = Object.assign({ mrp: p }, z()); g.m.set(p, x); }
      return [g, x];
    };
    const ord = L.basis === 'ordered';
    for (const x of L.sum || []) {
      if (!all && kOf(SE.ly0, x[0]) > cut) continue;
      const q = +(ord ? x[4] : x[6]) || 0, v = +(ord ? x[5] : x[7]) || 0; if (!q && !v) continue;
      const [g, m] = slot(x[1], x[2]); g.t.lq += q; g.t.lv += v; m.lq += q; m.lv += v;
    }
    for (const l of S.M.lines) {
      if (!tyIn(SE, l, cut)) continue;
      const [q, v] = tyQV(l, L.basis); if (!q && !v) continue;
      const a = S.M.articles[l.article_code] || {};
      const [g, m] = slot(l.mc_name || a.mc_name, l.mrp); g.t.tq += q; g.t.tv += v; m.tq += q; m.tv += v;
    }
    return Array.from(groups.values()).map((g) => Object.assign(g, { rows: Array.from(g.m.values()).sort((a, b) => a.mrp - b.mrp) }))
      .sort((a, b) => Math.max(b.t.lv, b.t.tv) - Math.max(a.t.lv, a.t.tv) || a.mc.localeCompare(b.mc));
  }
  /* Stores: in the period (ln, lv / tn, tv) and over the whole season (lyAll lines, lyAllV value / tyAll lines) */
  function lyByStore(SE, cut) {
    const L = S.ly, all = L.period === 'all', ord = L.basis === 'ordered', m = new Map();
    const at = (code, name) => { const s = String(code || '').toUpperCase() || '(no store)'; let x = m.get(s); if (!x) { x = { s, name: name || '', ln: 0, lv: 0, tn: 0, tv: 0, lyAll: 0, lyAllV: 0, tyAll: 0 }; m.set(s, x); } if (!x.name && name) x.name = name; return x; };
    for (const r of L.stores || []) {
      const x = at(r[0], r[1]), v = +(ord ? r[5] : r[7]) || 0;
      x.lyAll += r[3]; x.lyAllV += v;
      if (all || kOf(SE.ly0, r[2]) <= cut) { x.ln += r[3]; x.lv += v; }
    }
    for (const l of S.M.lines) {
      const x = at(l.store_code, l.store_name);
      if (!l.parent_id) x.tyAll++;
      if (!tyIn(SE, l, cut)) continue;
      if (!l.parent_id) x.tn++;
      x.tv += tyQV(l, L.basis)[1];
    }
    return Array.from(m.values()).sort((a, b) => b.lv - a.lv || b.tv - a.tv || a.s.localeCompare(b.s));
  }
  async function lyFind() {
    const L = S.ly, q = L.lq.trim();
    if (!q) { L.lines = null; render(); return; }
    if (L.lbusy) return; L.lbusy = true;
    try { L.lines = await A.rpc('ly_search', { p_q: q, p_limit: 200 }) || []; } catch (e) { await tell('Not found', e.message); }
    finally { L.lbusy = false; }
    render();
  }
  function exportLastYear() {
    const M = S.M, SE = C.season(M, M.lyDaily), cut = lyCut(SE), L = S.ly, [qk, vk, word] = BASIS[L.basis];
    if (cut < 0) return tell('Export', 'The comparison starts the day after D-30 this year.');
    return excelFile('Last_Year_vs_This_Year', false, (sheet) => {
      const LY = SE.lyCum[cut], TY = SE.tyCum[cut], r = lyRange(SE, cut);
      const k = (t, f) => [t, Math.round(LY[f]), Math.round(TY[f]), growNum(TY[f], LY[f]) == null ? '' : Math.round(growNum(TY[f], LY[f]) * 1000) / 10];
      sheet('Summary', ['', 'Last year ' + r.ly, 'This year ' + r.ty, 'Change %'], [k('Orders', 'o'), k('Order lines', 'n'), k('Qty ordered', 'wq'), k('Value ordered (Rs)', 'wv'), k('Qty approved', 'fq'), k('Value approved (Rs)', 'fv')]);
      const days = [];
      for (let i = 0; i <= 30; i++) {
        const done = i <= SE.upto || i === SE.kToday;
        days.push([SE.label(i), SE.lyDate(i), SE.tyDate(i), Math.round(SE.lyDay[i].wq), done ? Math.round(SE.tyDay[i].wq) : '', Math.round(SE.lyDay[i].wv), done ? Math.round(SE.tyDay[i].wv) : '',
          Math.round(SE.lyDay[i].fq), done ? Math.round(SE.tyDay[i].fq) : '', Math.round(SE.lyDay[i].fv), done ? Math.round(SE.tyDay[i].fv) : '',
          Math.round(SE.lyCum[i].wv), done ? Math.round(SE.tyCum[i].wv) : '', Math.round(SE.lyCum[i].fv), done ? Math.round(SE.tyCum[i].fv) : '', i === SE.kToday ? 'today, so far' : '']);
      }
      sheet('By D-day', ['D-day', 'Last year date', 'This year date', 'Qty ordered LY', 'Qty ordered TY', 'Value ordered LY', 'Value ordered TY', 'Qty approved LY', 'Qty approved TY', 'Value approved LY', 'Value approved TY',
        'Value ordered so far LY', 'Value ordered so far TY', 'Value approved so far LY', 'Value approved so far TY', 'Note'], days);
      const mc = [];
      for (const g of lyByMc(SE, cut)) for (const x of g.rows) mc.push([g.mc, x.mrp, Math.round(x.lq), Math.round(x.tq), growNum(x.tq, x.lq) == null ? '' : Math.round(growNum(x.tq, x.lq) * 1000) / 10, Math.round(x.lv), Math.round(x.tv), growNum(x.tv, x.lv) == null ? '' : Math.round(growNum(x.tv, x.lv) * 1000) / 10]);
      sheet('By MC and MRP', ['MC', 'MRP', `Qty ${word} LY`, `Qty ${word} TY`, 'Qty change %', `Value ${word} LY`, `Value ${word} TY`, 'Value change %'], mc);
      sheet('By store', ['Store', 'Store name', 'Lines LY', 'Lines TY', `Value ${word} LY`, `Value ${word} TY`, 'Change %', 'Ordered last year, nothing yet this year'],
        lyByStore(SE, cut).map((x) => [x.s, x.name, x.ln, x.tn, Math.round(x.lv), Math.round(x.tv), growNum(x.tv, x.lv) == null ? '' : Math.round(growNum(x.tv, x.lv) * 1000) / 10, x.lyAll > 0 && !x.tyAll ? 'Yes' : '']));
      return `Exported: ${L.period === 'all' ? 'whole season' : r.ly + ' against ' + r.ty}, ${word}`;
    });
  }

  /* ================= Order lists: Pending orders and Approved orders =================
     Both screens are the same kind of list: order lines, filtered, then grouped the way the
     user picks (store, order, MC, article, booking date ...). A line that is fully approved
     leaves Pending orders and shows under Approved orders. */
  const NEEDS = ['PENDING', 'AWAITING', 'PARTIAL'];
  const LISTS = ['orders', 'approved'];
  const sec = (view) => ((view || S.view) === 'approved' ? S.a : S.o);
  const SEGS = { todo: ['Approved', (l) => l.approved_open > 0], done: ['Dispatched', (l) => l.dispatched > 0], rej: ['Rejected', (l) => l.status === 'REJECTED'] };
  const ticks = (view) => editor() && S.wide && ((view || S.view) !== 'approved' || S.a.seg === 'todo');   // tick boxes: Pending orders, and Approved (to mark dispatched)
  const baseLines = (view) => (view === 'approved' ? S.M.lines.filter(SEGS[S.a.seg][1]) : S.M.lines.filter((l) => NEEDS.includes(l.status)));
  function ordersFiltered(view) {
    view = view === 'approved' || (!view && S.view === 'approved') ? 'approved' : 'orders';
    const o = sec(view), words = o.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const flag = o.flag && FLAGS[o.flag] ? FLAGS[o.flag][1] : null;
    return baseLines(view).filter((l) => {
      if (view === 'orders' && o.status && l.status !== o.status) return false;
      if (flag && !flag(l)) return false;
      if (o.store && l.store_code !== o.store) return false;
      if (o.mc && l.mc_name !== o.mc) return false;
      if (o.buyer && (l.buyer || '-') !== o.buyer) return false;
      if (words.length) {
        const hay = [l.order_no, l.store_code, l.store_name, l.city, l.state, l.article_code, l.description, l.orig_article, l.orig_desc, l.customer, l.mc_code, l.mc_name, l.poc_name, l.phone, l.supplied].join(' ').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }
  /* The filters that are switched on, each with a cross to remove it. */
  function activeFilters(view) {
    const o = sec(view), out = [];
    if (o.q.trim()) out.push(['q', 'Search: ' + o.q.trim()]);
    if (view === 'orders' && o.status) out.push(['status', 'Status: ' + C.STATUS_LABEL[o.status]]);
    if (o.flag && FLAGS[o.flag]) out.push(['flag', FLAGS[o.flag][0]]);
    if (o.store) out.push(['store', 'Store: ' + o.store + ' ' + ((S.M.stores[o.store] || {}).store_name || '')]);
    if (o.mc) out.push(['mc', 'MC: ' + o.mc]);
    if (o.buyer) out.push(['buyer', 'Buyer: ' + (o.buyer === '-' ? '(not set)' : o.buyer)]);
    return out;
  }
  function chipsHtml(view) {
    const f = activeFilters(view);
    return f.length ? `<span class="small">Filters on:</span>${f.map(([k, t]) => `<button class="fchip" data-act="clearFilter" data-key="${k}" title="Remove this filter">${esc(t)} <b>&#10005;</b></button>`).join('')}
      <button class="btn link" data-act="clearFilters">Clear all filters</button>` : '';
  }
  function noteOf(l) {
    if (l.sap_appr && l.sap_appr.conflict) return `<span class="bad">Differs from SAP: ${esc(l.sap_appr.conflict)}</span>`;
    if (l.sap_appr && l.status !== 'PENDING') { const x = l.sap_appr; return `<span class="sapnote">${esc([(x.label || '').replace(/^(Approved|Rejected) By (\w+)$/i, '$1 by $2') + ' in SAP', x.by, x.at ? when(x.at).slice(0, 6) : '', x.po ? 'PO ' + x.po : ''].filter(Boolean).join(' · '))}</span>`; }
    if (l.sap_new_qty != null) return `<span class="warn">SAP qty now ${inr(l.sap_new_qty)}</span>`;
    if (l.status === 'REJECTED') return esc(l.reject_reason || '');
    if (l.offered) return `${inr(l.offered)} pcs of alternate offered`;
    if (l.supplied && l.supplied !== l.article_code) return 'Given in ' + esc(l.supplied);
    if (l.balance_closed && l.open_qty) return `${inr(l.open_qty)} pcs will not be supplied`;
    return '';
  }
  const discCell = (l) => (l.discount > 0.0005 ? `<span class="warn b">${pct(l.discount)}</span>` : '<span class="muted">-</span>');
  function delCell(l) {
    if (!l.del_date) return '<span class="muted">-</span>';
    const tone = l.late ? 'bad b' : l.tight ? 'warn b' : '';
    return `<span class="${tone}">${when(l.del_date)}</span>${l.allocate_by ? `<div class="small ${l.late ? 'bad' : ''}">${l.late ? 'late by ' + (-l.days_left) + ' d' : 'allocate by ' + when(l.allocate_by)}</div>` : ''}`;
  }
  const uniqOf = (L, fn) => Array.from(new Set(L.map(fn).filter((v) => v !== '' && v != null)));
  const dayLong = (d) => (d ? when(d) + ' ' + String(d).slice(0, 4) : 'No date given');
  const mrpsOf = (L) => 'MRP ' + uniqOf(L, (l) => l.mrp).sort((a, b) => a - b).map(inr).join(', ');
  /* The ways to group. hide = the row columns that the group heading already says:
     so = store and order, mc, mrp, art = article. h1 gives [big label, name, small print]. */
  const GROUPS = {
    store_order: { label: 'Store, then order', hide: 'so', k1: (l) => l.store_code, k2: (l) => l.order_no,
      h1: (L) => [L[0].store_code, L[0].store_name || '(store not in the store list)', [L[0].city, L[0].state].filter(Boolean).join(', ')] },
    order: { label: 'Order number', hide: 'so', k1: (l) => l.order_no,
      h1: (L) => ['Order ' + L[0].order_no, L[0].store_code + ' ' + L[0].store_name, 'Booked ' + when(L[0].order_date) + (L[0].del_date ? ', delivery wanted ' + when(L[0].del_date) : '')] },
    mc: { label: 'MC', hide: 'mc', k1: (l) => l.mc_name || '', h1: (L) => [L[0].mc_name || '(MC not known)', '', mrpsOf(L)] },
    mc_mrp: { label: 'MC, then MRP', hide: 'mc mrp', k1: (l) => l.mc_name || '', k2: (l) => String(Math.round(l.mrp * 100)).padStart(12, '0'),
      h1: (L) => [L[0].mc_name || '(MC not known)', '', mrpsOf(L)], h2: (L) => 'MRP ' + inr(L[0].mrp) },
    article: { label: 'Article', hide: 'mc mrp art', k1: (l) => l.article_code,
      h1: (L) => { const l = L[0], p = S.M.pos[l.article_code] || {}; return [l.article_code, l.description || '(article details not on file)',
        `${l.mc_name || '-'} | MRP ${inr(l.mrp)} | pack of ${l.pack} | Balance DC qty ${inr(p.free || 0)}`]; } },
    booked: { label: 'Booking date', hide: '', k1: (l) => l.order_date || '', h1: (L) => ['Booked ' + dayLong(L[0].order_date), '', ''] },
    delivery: { label: 'Delivery date wanted', hide: '', k1: (l) => l.del_date || '', h1: (L) => ['Delivery wanted ' + dayLong(L[0].del_date), '', ''] },
    buyer: { label: 'Buyer', hide: '', k1: (l) => l.buyer || '', h1: (L) => [L[0].buyer || '(buyer not set)', '', ''] },
    none: { label: 'No grouping (one list)', hide: '', k1: () => '' }
  };
  const rowOrder = (a, b) => a.store_code.localeCompare(b.store_code) || a.order_no.localeCompare(b.order_no) || (a.mc_name || '').localeCompare(b.mc_name || '') || a.mrp - b.mrp || a.description.localeCompare(b.description);
  /* Sort orders for the lists. Within each group the lines follow it, and the groups themselves come in the order of their first line. */
  const cmpStr = (f) => (a, b) => String(f(a) || '').localeCompare(String(f(b) || ''), undefined, { numeric: true });
  const cmpDate = (f, desc) => (a, b) => { const x = f(a) || '', y = f(b) || ''; return !x !== !y ? (x ? -1 : 1) : (desc ? y.localeCompare(x) : x.localeCompare(y)); };   // lines without a date go last
  const SORTS = {
    '': ['Store, then order (usual)', null],
    booked: ['Booking date - oldest first', cmpDate((l) => l.order_date)], booked_new: ['Booking date - newest first', cmpDate((l) => l.order_date, true)],
    delivery: ['Delivery date - soonest first', cmpDate((l) => l.del_date)], allocate: ['Allocate-by date - soonest first', cmpDate((l) => l.allocate_by)],
    article: ['Article code', cmpStr((l) => l.article_code)], mc: ['MC name', cmpStr((l) => l.mc_name)],
    mrp: ['MRP - low to high', (a, b) => a.mrp - b.mrp], mrp_high: ['MRP - high to low', (a, b) => b.mrp - a.mrp],
    store: ['Store code', cmpStr((l) => l.store_code)], order: ['Order number', cmpStr((l) => l.order_no)],
    qty: ['Qty wanted - largest first', (a, b) => b.req_qty - a.req_qty], value: ['Order value - largest first', (a, b) => b.ask_value - a.ask_value],
    short: ['Most short at the DC first', (a, b) => (Math.max(0, b.balance - Math.max(0, C.freeOf(S.M, b.article_code)))) - (Math.max(0, a.balance - Math.max(0, C.freeOf(S.M, a.article_code))))]
  };
  const sortCmp = (o) => { const f = (SORTS[o.sort] || SORTS[''])[1]; return f ? (a, b) => f(a, b) || rowOrder(a, b) : null; };
  function buildGroups(rows, g, cmp) {
    const top = new Map();
    for (const l of rows) {
      const k = g.k1(l); let G = top.get(k);
      if (!G) top.set(k, G = { key: k, lines: [], blocks: new Map() });
      G.lines.push(l);
      const k2 = g.k2 ? g.k2(l) : ''; let B = G.blocks.get(k2);
      if (!B) G.blocks.set(k2, B = { key: k2, lines: [] });
      B.lines.push(l);
    }
    const list = Array.from(top.values()).sort((a, b) => a.key.localeCompare(b.key));
    for (const G of list) {
      G.blocks = Array.from(G.blocks.values());
      for (const B of G.blocks) B.lines.sort(cmp || rowOrder);
      if (cmp) { G.blocks.sort((a, b) => cmp(a.lines[0], b.lines[0])); G.lines = G.blocks.reduce((t, B) => t.concat(B.lines), []); }
      else G.blocks.sort(g.k2 === GROUPS.store_order.k2 ? (a, b) => (a.lines[0].order_date || '').localeCompare(b.lines[0].order_date || '') || a.key.localeCompare(b.key) : (a, b) => a.key.localeCompare(b.key));
    }
    if (cmp) list.sort((a, b) => cmp(a.lines[0], b.lines[0]));
    return list;
  }
  /* What can be approved on this line right now, in full packs (0 = nothing). */
  const approvable = (l) => Math.max(0, Math.min(C.roundPack(l.open_qty, l.pack), C.floorPack(C.freeOf(S.M, l.article_code), l.pack)));
  /* The most that can be approved on a line: whatever the DC has, in full packs - even more than the store wants
     (the app warns first). Before database version 9 the limit was the quantity the store wants. */
  const canGive = (l) => Math.max(0, S.M.schema >= 9 ? C.floorPack(C.freeOf(S.M, l.article_code), l.pack) : approvable(l));
  /* Asks before approving more than the store wants. f = the quantity in full packs. Resolves true to go ahead. */
  async function overOk(l, f) {
    const want = C.roundPack(l.open_qty, l.pack);
    if (f <= want) return true;
    return confirmBox('More than the store wants', `${l.store_code} ${l.store_name}, order ${l.order_no}\n${l.article_code} ${l.description}\n\nThe store wants ${inr(l.open_qty)} pcs${l.approved ? ` more (${inr(l.approved)} already approved)` : ''}.\nYou are approving ${inr(f)} pcs - ${inr(f - l.open_qty)} pcs more than wanted.\n\nApprove ${inr(f)} pcs anyway?`, `Approve ${inr(f)} pcs`);
  }
  /* Which columns a list shows: the group heading already carries some of them. */
  /* Which columns a list shows. One row per order line: the article (code in bold, description in small print under it),
     then the numbers in large type, each in its own clearly named column. The group heading already carries some details. */
  function columnsFor(view, hide, ed) {
    const h = new Set(hide.split(' '));
    return { chk: ed && (view !== 'approved' || S.a.seg === 'todo'), so: !h.has('so'), art: !h.has('art'), mcIn: !h.has('mc'), mrpIn: !h.has('mrp'),
      ss: view !== 'approved' && !!S.M.hasStoreStock };
  }
  function tableHead(view, c, ed) {
    const W = (w) => `<col style="width:${w}">`, TH = (t, sub, cls) => `<th class="${cls || ''}">${t}${sub ? `<span class="thsub">${sub}</span>` : ''}</th>`;
    let cols = (c.chk ? W('36px') : '') + (c.so ? '<col>' : '') + (c.art ? W(c.so ? '190px' : '230px') : '') + (c.so ? '' : W('104px')) + W('84px') + W('94px');
    let th = (c.chk ? '<th></th>' : '') + (c.so ? TH('Store / order', 'booked, delivery') : '') + (c.art ? TH('Article') : '') + (c.so ? '' : TH('Booked', 'delivery')) +
      TH('Qty wanted', 'pcs', 'right') + (view === 'approved' ? TH('Price', 'Rs per pc', 'right') : TH('Price wanted', 'Rs per pc', 'right'));
    if (view === 'approved') {             // fixed widths that fit a laptop screen; the article column takes what is left
      cols = (c.chk ? W('36px') : '') + (c.so ? W('180px') : '') + (c.art ? '<col>' : '') + (c.so ? '' : (c.art ? W('104px') : '<col>')) + W('80px') + W('92px') +
        W('90px') + (locsOn() ? W('130px') : '') + W('96px') + W('132px') + W(ed && locsOn() ? '96px' : '84px');
      th += TH('Approved', 'pcs', 'right') + (locsOn() ? TH('Taken from', 'DC location') : '') + TH('Value', 'Rs', 'right') + TH('Status') + '<th></th>';
    } else {
      cols += W('92px') + (c.ss ? W('98px') + W('78px') : '') + W(ed ? (priceOn() ? '226px' : '192px') : '120px');
      th += TH('Balance DC qty', 'free to approve', 'right') + (c.ss ? TH('Store stock', 'closing + in transit', 'right') + TH('Store sale', 'this month', 'right') : '') + (ed ? TH('Approve', priceOn() ? 'qty &nbsp; &middot; &nbsp; price Rs' : 'pcs') : TH('Status'));
    }
    if (!c.so && view !== 'approved') cols = cols.replace(c.art ? W('230px') : W('104px'), '<col>');      // the article column (or the dates, when grouped by article) takes the spare room
    return `<colgroup>${cols}</colgroup><thead><tr>${th}</tr></thead>`;
  }
  /* Stock at the ordering store: the article itself, and what its alternates add. */
  function ssHtml(l, compact) {
    if (!l.ss) return '';
    const o = l.ss.own, alt = l.ss.altTotal;
    const bits = [`At store <b class="${o.total > 0 ? '' : 'muted'}">${inr(o.total)}</b>${o.transit ? ` <span class="muted">(${inr(o.closing)} + ${inr(o.transit)} in transit)</span>` : ''}`, `MTD sale <b>${inr(o.mtd)}</b>`];
    if (alt > 0) bits.push(`alternates <b>${inr(alt)}</b>`);
    return `<div class="small sstk ${l.req_qty > 0 && l.ss.family >= l.req_qty ? 'full' : ''}" title="${esc(ssTitle(l))}">${bits.join(compact ? ' &middot; ' : ' &middot; ')}</div>`;
  }
  function ssCell(l) {
    if (!l.ss) return '<td></td><td></td>';
    const o = l.ss.own, full = l.req_qty > 0 && l.ss.family >= l.req_qty, alt = l.ss.altTotal;
    return `<td class="big right ${full ? 'warnc' : ''}" title="${esc(ssTitle(l))}"><b class="${o.total > 0 ? '' : 'zero'}">${inr(o.total)}</b>
        ${o.transit ? `<div class="small">${inr(o.transit)} in transit</div>` : ''}${alt > 0 ? `<div class="small ${full ? 'warn b' : ''}">+ ${inr(alt)} in alternates</div>` : ''}</td>
      <td class="big right"><b class="${(o.mtd || l.ss.familyMtd) ? '' : 'zero'}">${inr(o.mtd)}</b>${l.ss.familyMtd > o.mtd ? `<div class="small">+ ${inr(l.ss.familyMtd - o.mtd)} alternates</div>` : ''}</td>`;
  }
  function ssTitle(l) {
    const o = l.ss.own, L = [`Stock at ${l.store_code}: closing ${o.closing}, in transit (incl. CLA) ${o.transit}, sale this month ${o.mtd}`];
    l.ss.alts.forEach((x) => L.push(`${x.code} ${(S.M.articles[x.code] || {}).description || ''}: ${x.total} (closing ${x.closing}, in transit ${x.transit}), MTD sale ${x.mtd}`));
    return L.join('\n');
  }
  const lineTags = (l) => [dupBadge(l), l.orig_article ? `<span class="badge alt" title="${esc('The store ordered ' + l.orig_article + ' ' + l.orig_desc)}">In place of ${esc(l.orig_article)}</span>` : '',
    l.art_status === 'In-Active' ? '<span class="badge bad">In-Active</span>' : '',
    l.late ? '<span class="badge bad" title="The allocate-by date has passed">Late</span>' : l.tight ? '<span class="badge warn">Allocate now</span>' : '',
    l.ss && l.req_qty > 0 && l.ss.family >= l.req_qty && NEEDS.includes(l.status) ? `<span class="badge warn" title="${esc(ssTitle(l))}">Store holds ${inr(l.ss.family)}</span>` : ''].filter(Boolean).join(' ');
  /* Where an approval of f pcs would be taken from if nothing is chosen: the standing order of locations. */
  function fromHtml(article, f) {
    if (!locsOn() || !f) return '';
    const sp = C.autoSplit(S.M, article, f);
    return sp.left ? `<span class="warn">${inr(sp.left)} pcs are only in a location set aside: choose</span>` : 'from <b>' + esc(C.locText(sp.use, true)) + '</b>';
  }
  function lineRow(l, view, c, ed) {
    const M = S.M, o = sec(view), free = C.freeOf(M, l.article_code), short = l.balance > 0 && free < l.balance, note = noteOf(l), tags = lineTags(l);
    const dates = `<div class="dt"><i>Booked</i> ${when(l.order_date) || '-'}</div><div class="dt ${l.late ? 'bad b' : l.tight ? 'warn b' : ''}"><i>Delivery</i> ${l.del_date ? when(l.del_date) : '-'}</div>`;
    const meta = [c.mcIn ? esc(l.mc_name || '') : '', c.mrpIn ? 'MRP ' + inr(l.mrp) : ''].filter(Boolean).join(' &middot; ');
    const cells = (c.chk ? `<td class="chk"><input type="checkbox" data-act="chk" data-id="${l.id}" ${o.checked.has(l.id) ? 'checked' : ''} aria-label="Tick this line"></td>` : '') +
      (c.so ? `<td class="so"><b>${esc(l.store_code)}</b> ${esc(l.store_name)}<div class="ordno">${esc(ref(l))}</div>${dates}</td>` : '') +
      (c.art ? `<td class="art ${l.dup_count > 0 ? 'dup' : ''}"><div class="acode">${esc(l.article_code)}</div><div class="adesc">${esc(l.description || '(article details not on file)')}</div>${meta ? `<div class="ameta">${meta}</div>` : ''}${tags ? `<div class="atags">${tags}</div>` : ''}</td>` : '') +
      (c.so ? '' : `<td class="dates">${dates}${c.art || !tags ? '' : `<div class="atags">${tags}</div>`}</td>`) +
      `<td class="big right"><b>${inr(l.req_qty)}</b>${l.pack > 1 ? `<div class="small">packs of ${l.pack}</div>` : ''}</td>` +
      (view === 'approved' && l.appr_price != null
        ? `<td class="big right"><b class="${l.price_changed ? 'warnt' : ''}">${inr2(l.appr_price)}</b><div class="small">${l.price_changed ? `approved; store asked ${inr2(l.req_price)}` : 'as the store asked'}</div></td>`
        : `<td class="big right"><b>${inr2(l.req_price)}</b><div class="small ${l.discount > 0.0005 && !l.price_missing ? 'warn' : ''}">${l.price_missing ? 'not given, MRP used' : l.discount > 0.0005 ? pct(l.discount) + ' below MRP' : 'at MRP'}</div>${l.approved && l.price_changed ? `<div class="small warn">approved at ${inr2(l.appr_price)}</div>` : ''}</td>`);
    const details = `<button class="btn link" data-act="sel" data-id="${l.id}" title="Stock by location, alternates, history${ed ? ', reject, cancel' : ''}">Details</button>`;
    const wrap = (cls, rest) => `<tbody class="ol pick ${S.o.sel === l.id ? 'sel' : ''} ${cls}" data-act="sel" data-id="${l.id}"><tr>${cells}${rest}</tr></tbody>`;
    if (view === 'approved') {
      const more = [l.dispatched ? `${inr(l.dispatched)} dispatched` : '', l.balance ? `${inr(l.balance)} still pending` : ''].filter(Boolean).join(', ');
      return wrap(l.status === 'REJECTED' ? 'rej' : '', `<td class="big right"><b class="${l.approved ? 'good' : 'zero'}">${l.approved ? inr(l.approved) : '-'}</b>${more ? `<div class="small">${more}</div>` : ''}</td>
        ${locsOn() ? `<td class="from">${C.locText(l.locs) ? esc(C.locText(l.locs)) : l.sap_appr && l.sap_appr.status === 'APPROVED' ? `<span class="sapnote">In SAP${l.sap_appr.dc ? ' &middot; ' + esc(l.sap_appr.dc) : ''}</span>${l.sap_appr.remarks ? `<div class="small">${esc(l.sap_appr.remarks)}</div>` : ''}` : '<span class="muted">-</span>'}</td>` : ''}
        <td class="big right"><b>${l.approved ? inr(l.value) : '-'}</b></td><td>${pill(l.status)}${note ? `<div class="small">${note}</div>` : ''}</td>
        <td class="acts"><div class="rowlinks">${details.replace('>Details<', ed && l.approved_open > 0 && locsOn() && C.locText(l.locs) ? '>Details / change<' : '>Details<')}</div></td>`);
    }
    const canAct = ed && l.open_qty > 0, top = canAct ? approvable(l) : 0, need = C.roundPack(l.open_qty, l.pack), maxQ = canAct ? canGive(l) : 0;
    const dflt = top ? (need <= top ? l.open_qty : top) : 0, f = C.roundPack(dflt, l.pack);
    const prev = !dflt ? '' : need > top ? `<span class="warn">only ${inr(top)} of ${inr(l.open_qty)} can be given</span>` : f !== dflt ? `rounded up to <b>${inr(f)} pcs</b> (${inr(f / l.pack)} ${plural(f / l.pack, 'pack')})` : '';
    const state = l.status === 'PENDING' && !note ? '' : `<div class="rowstate">${pill(l.status)}${l.approved ? ` <span class="small"><b class="good">${inr(l.approved)} approved</b>${l.balance ? `, ${inr(l.balance)} pending` : ''}</span>` : ''}${note ? `<div class="small">${note}</div>` : ''}</div>`;
    const bal = `<td class="big right ${short ? 'badc' : ''}"><b>${inr(free)}</b>${short ? `<div class="small">short of ${inr(l.balance)}</div>` : ''}</td>`;
    const last = !ed ? `<td>${pill(l.status)}${l.approved ? `<div class="small"><b class="good">${inr(l.approved)} approved</b></div>` : ''}${note ? `<div class="small">${note}</div>` : ''}<div class="rowlinks">${details}</div></td>`
      : `<td class="apcell">${state}${top ? `<div class="row"><input class="qty rowq" type="number" inputmode="numeric" min="1" max="${maxQ}" value="${dflt}" data-want="${l.open_qty}" placeholder="Qty" data-id="${l.id}" data-pack="${l.pack}" aria-label="Quantity to approve for ${esc(l.article_code)}">${priceOn() ? `<input class="qty rowp" type="number" inputmode="decimal" min="0.01" step="0.01" max="${l.mrp || ''}" value="${l.req_price}" data-id="${l.id}" data-asked="${l.req_price}" title="Price per piece to approve (the store asked Rs ${l.req_price})" aria-label="Price to approve for ${esc(l.article_code)}">` : ''}<button class="btn sm primary" data-act="rowApprove" data-id="${l.id}">Approve</button></div><div class="small rowprev">${prev}</div>${locsOn() ? `<div class="small rowloc"><span class="rowfrom">${fromHtml(l.article_code, f)}</span> <button class="btn link" data-act="rowLocs" data-id="${l.id}" title="Choose which DC location(s) this approval is taken from">Choose</button></div>` : ''}`
        : canAct ? '<div class="small bad">No balance at DC</div>' : ''}
        <div class="rowlinks">${details.replace('>Details<', canAct && !top && C.allAlternates(M, l.article_code).length ? '>See alternates<' : '>Details<')} <button class="btn link del" data-act="delLine" data-id="${l.id}" title="Delete this line from the tracker">Delete</button></div></td>`;
    return wrap('', bal + (c.ss ? ssCell(l) : '') + last);
  }
  function lineCard(l, view) {                       // the same line on a phone
    const free = C.freeOf(S.M, l.article_code), short = l.balance > 0 && free < l.balance, note = noteOf(l), tags = lineTags(l);
    return `<div class="ocard ${S.o.sel === l.id ? 'sel' : ''}" data-act="sel" data-id="${l.id}">${thumb(l.article_code, 's')}
      <div class="grow"><div class="row"><span class="mcname grow">${esc(l.mc_name || '-')}</span>${pill(l.status)}</div>
      <div><b>${esc(l.description || '(article details not on file)')}</b> <span class="muted">${esc(l.article_code)}</span> ${tags}</div>
      <div class="small"><b>${esc(l.store_code)}</b> ${esc(l.store_name)} &middot; ${esc(ref(l))} &middot; booked ${when(l.order_date)}${l.del_date ? ` &middot; <span class="${l.late ? 'bad' : l.tight ? 'warn' : ''}">delivery ${when(l.del_date)}</span>` : ''}</div>
      <div class="nums"><span>MRP <b>${inr(l.mrp)}</b></span><span>Price wanted <b>${inr(l.req_price)}</b>${l.discount > 0.0005 ? ` <span class="warn">-${pct(l.discount)}</span>` : ''}</span><span>Qty wanted <b>${inr(l.req_qty)}</b></span>
        <span>Approved <b class="${l.approved ? 'good' : ''}">${l.approved ? inr(l.approved) : '-'}</b></span>${view === 'approved' ? '' : `<span>Balance DC qty <b class="${short ? 'bad' : ''}">${inr(free)}</b></span>`}</div>
      ${view === 'approved' ? '' : ssHtml(l)}${locsOn() && C.locText(l.locs) ? `<div class="small">Taken from ${esc(C.locText(l.locs))}</div>` : ''}${note ? `<div class="small">${note}</div>` : ''}</div></div>`;
  }
  /* The heading of one order inside a store. */
  function orderHead(L, view, ed, idx, n) {
    const f = L[0], dels = uniqOf(L, (l) => l.del_date).sort(), late = L.some((l) => l.late), tight = L.some((l) => l.tight);
    const tel = (f.phone || '').replace(/\D/g, '');
    const who = f.poc_name || tel ? `<span>Booked by <b>${esc(f.poc_name || '')}</b>${tel ? ` <a href="tel:${esc(tel)}">${esc(f.phone)}</a>` : ''}</span>` : '';
    const value = L.reduce((t, l) => t + (l.status === 'REJECTED' ? 0 : l.ask_value), 0);
    return `<div class="ohead">${ticks(view) ? `<input type="checkbox" data-act="chkOrder" ${L.every((l) => sec(view).checked.has(l.id)) ? 'checked' : ''} title="Tick every line of this order here" aria-label="Tick every line of order ${esc(f.order_no)}">` : ''}
        ${n > 1 ? `<span class="onum">Order ${idx + 1} of ${n}</span>` : ''}<span class="ono ${L.some((l) => l.dup_count > 0) ? 'bad' : ''}">Order ${esc(f.order_no)}</span><span>Booked ${when(f.order_date)}</span>
        ${dels.length ? `<span class="${late ? 'bad b' : tight ? 'warn b' : ''}">Delivery wanted ${when(dels[0])}${dels.length > 1 ? ' onwards' : ''}${f.allocate_by && dels.length === 1 ? ` <span class="small">(allocate by ${when(f.allocate_by)})</span>` : ''}</span>` : ''}
        ${who}<span class="grow"></span><span class="osum">${L.length} ${plural(L.length, 'article')} &middot; ${rupees(value)}</span></div>
      <div class="ometa"><span><i>MC</i> ${uniqOf(L, (l) => l.mc_name).map(esc).join(', ') || '-'}</span><span><i>MRP</i> ${uniqOf(L, (l) => l.mrp).sort((a, b) => a - b).map(inr).join(', ')}</span></div>`;
  }
  function blockHtml(B, g, view, c, ed, first, idx, n) {
    const L = B.lines, band = g === GROUPS.store_order ? ` oc${idx % 3}` : '';
    const head = g === GROUPS.store_order ? orderHead(L, view, ed, idx, n)
      : g.h2 ? `<div class="ohead">${ticks(view) ? '<input type="checkbox" data-act="chkOrder" title="Tick every line under this heading" aria-label="Tick every line under this heading">' : ''}<span class="ono">${esc(g.h2(L))}</span><span class="grow"></span><span class="osum">${L.length} ${plural(L.length, 'line')}</span></div>` : '';
    if (!S.wide) return `<div class="oblock${band}">${head}${L.map((l) => lineCard(l, view)).join('')}</div>`;
    return `<div class="oblock${band}">${head}<table class="otable ${first ? '' : 'nohead'}">${tableHead(view, c, ed)}${L.map((l) => lineRow(l, view, c, ed)).join('')}</table></div>`;
  }
  function oListHtml(view) {
    view = view || S.view;
    const rows = ordersFiltered(view), M = S.M, o = sec(view), ed = editor(), g = GROUPS[o.group] || GROUPS.store_order, base = baseLines(view);
    const sum = (f) => rows.reduce((t, l) => t + f(l), 0);
    setTimeout(() => {
      setHtml('osum', view === 'approved'
        ? `${inr(rows.length)} of ${inr(base.length)} lines &nbsp;|&nbsp; ${inr(sum((l) => l.approved))} pcs approved &nbsp;|&nbsp; ${inr(sum((l) => l.dispatched))} dispatched &nbsp;|&nbsp; ${rupees(sum((l) => l.value))}`
        : `${inr(rows.length)} of ${inr(base.length)} pending lines &nbsp;|&nbsp; ${inr(sum((l) => l.req_qty))} pcs wanted &nbsp;|&nbsp; ${inr(sum((l) => l.approved))} approved &nbsp;|&nbsp; ${inr(sum((l) => l.balance))} pending &nbsp;|&nbsp; ${rupees(sum((l) => l.ask_value))}`);
      setHtml('ochips', chipsHtml(view));
      const ex = document.getElementById('oexport'); if (ex) ex.textContent = `Export these ${inr(rows.length)} ${plural(rows.length, 'line')} to Excel`;
    }, 0);
    if (!rows.length) {
      return `<div class="empty card">${base.length ? 'No order lines match these filters. <button class="btn sm" data-act="clearFilters">Clear all filters</button>'
        : view === 'approved' ? { todo: 'No approved lines here.', done: 'Nothing is dispatched yet. Lines move here when a newer DC stock report is loaded and you say the approved stock has left the DC.', rej: 'Nothing is rejected.' }[S.a.seg]
        : M.lines.length ? 'Nothing is pending. Every order line is approved, dispatched or rejected.' : 'No orders loaded yet.'}</div>`;
    }
    const groups = buildGroups(rows, g, sortCmp(o)), c = columnsFor(view, g.hide, ed);
    let shown = 0, hiddenGroups = 0, hiddenLines = 0, html = '';
    for (const G of groups) {
      if (shown >= o.limit) { hiddenGroups++; hiddenLines += G.lines.length; continue; }
      const closed = !!g.h1 && o.collapsed !== o.toggled.has(G.key), L = G.lines;
      if (!closed) shown += L.length;
      let head = '';
      if (g.h1) {
        const [big, name, small] = g.h1(L), nOrd = uniqOf(L, (l) => l.order_no).length, nSt = uniqOf(L, (l) => l.store_code).length;
        const counts = [g.hide.includes('so') && g !== GROUPS.order ? (nOrd > 1 ? `<b class="multi">${nOrd} orders</b>` : '1 order') : g === GROUPS.order ? '' : `${nSt} ${plural(nSt, 'store')}`, `${L.length} ${plural(L.length, 'line')}`,
          view === 'approved' ? `${inr(L.reduce((t, l) => t + l.approved, 0))} pcs approved` : `${inr(L.reduce((t, l) => t + l.balance, 0))} pcs pending`,
          rupees(L.reduce((t, l) => t + (view === 'approved' ? l.value : l.ask_value), 0))].filter(Boolean).join(' &middot; ');
        head = `<div class="shead" data-act="toggleGroup" data-key="${esc(G.key)}" title="${closed ? 'Show' : 'Hide'} the lines under this heading">
          ${ticks(view) && !closed ? '<input type="checkbox" data-act="chkGroup" title="Tick every line under this heading" aria-label="Tick every line under this heading">' : ''}
          <span class="scode">${esc(big)}</span>${name ? `<span class="sname">${esc(name)}</span>` : ''}${small ? `<span class="sloc">${esc(small)}</span>` : ''}<span class="grow"></span>
          <span class="ssum">${counts}</span><span class="chev">${closed ? '&#9656;' : '&#9662;'}</span></div>`;
      }
      html += `<section class="sgroup ${closed ? 'closed' : ''}">${head}${closed ? '' : G.blocks.map((B, i) => blockHtml(B, g, view, c, ed, i === 0, i, G.blocks.length)).join('')}</section>`;
    }
    return html + (hiddenGroups ? `<button class="btn more" data-act="more">Show more (${inr(hiddenLines)} more ${plural(hiddenLines, 'line')})</button>` : '');
  }
  function vOrders(view) {
    const o = sec(view), M = S.M, ed = editor(), base = baseLines(view);
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`;
    const stores = uniqOf(base, (l) => l.store_code).sort(), mcs = uniqOf(base, (l) => l.mc_name).sort(), buyers = Array.from(new Set(base.map((l) => l.buyer || '-'))).sort();
    const keep = (arr, v) => (v && !arr.includes(v) ? arr.concat([v]) : arr);          // a chosen filter stays in its list even when it matches nothing now
    const tick = ed && S.wide ? '<label class="row tickall"><input type="checkbox" data-act="chkAll" aria-label="Tick all lines shown"> Tick all shown</label><span class="small">With the ticked lines:</span>' : '';
    const bulk = !ed || !S.wide ? '' : view === 'approved' ? (S.a.seg === 'todo' ? `${tick}<button class="btn sm primary" data-act="bulkDispatch" title="The ticked lines have left the DC">Mark dispatched ...</button>` : '') : `${tick}<button class="btn sm" data-act="bulkApprove" title="Approves the full pending quantity of every ticked line where the DC has enough balance, rounded up to full packs">Approve in full</button>
        <button class="btn sm" data-act="bulkClose" title="For ticked lines that are partly approved: the store gets only what is approved, the rest is no longer pending">Close pending qty ...</button><button class="btn sm danger" data-act="bulkReject">Reject ...</button><button class="btn sm danger" data-act="bulkDelete">Delete ...</button>`;
    const seg = view === 'approved' ? `<div class="segs">${Object.keys(SEGS).map((k) => `<button class="${S.a.seg === k ? 'on' : ''}" data-act="seg" data-seg="${k}">${SEGS[k][0]} <b>${inr(M.lines.filter(SEGS[k][1]).length)}</b></button>`).join('')}</div>` : '';
    const g = GROUPS[o.group] || GROUPS.store_order;
    const detail = `<div id="odetail" class="detail ${S.o.sel ? (S.wide ? 'drawer' : 'sheetpage') : ''}" data-keep="odetail" ${S.o.sel ? '' : 'hidden'}>${S.o.sel ? oDetailHtml() : ''}</div>`;
    return `<div class="head"><h1>${view === 'approved' ? 'Approved orders' : 'Pending orders'}</h1><span class="sub" id="osum"></span></div>
      ${seg}
      <div class="toolbar eight">
        <input type="search" id="oq" class="wide search" placeholder="Search store, order, article, MC, who booked ..." value="${esc(o.q)}" aria-label="Search orders">
        <select id="ogroup" class="gsel" aria-label="Group by" title="How the lines are grouped">${Object.keys(GROUPS).map((k) => opt(k, 'Group by: ' + GROUPS[k].label, o.group)).join('')}</select>
        <select id="osort" class="gsel" aria-label="Sort by" title="The order of the lines (and of the groups)">${Object.keys(SORTS).map((k) => opt(k, 'Sort by: ' + SORTS[k][0], o.sort)).join('')}</select>
        ${view === 'approved' ? '' : `<select id="ostatus" aria-label="Status">${opt('', 'All pending', o.status)}${NEEDS.map((s) => opt(s, C.STATUS_LABEL[s], o.status)).join('')}</select>`}
        <select id="oflag" aria-label="Flag">${opt('', 'Any flag', o.flag)}${Object.keys(FLAGS).map((k) => opt(k, FLAGS[k][0], o.flag)).join('')}</select>
        <select id="ostore" aria-label="Store">${opt('', 'All stores', o.store)}${keep(stores, o.store).map((s) => opt(s, s + '  ' + ((M.stores[s] || {}).store_name || ''), o.store)).join('')}</select>
        <select id="omc" aria-label="MC">${opt('', 'All MCs', o.mc)}${keep(mcs, o.mc).map((m) => opt(m, m, o.mc)).join('')}</select>
        <select id="obuyer" aria-label="Buyer">${opt('', 'All buyers', o.buyer)}${keep(buyers, o.buyer).map((b) => opt(b, b === '-' ? '(buyer not set)' : b, o.buyer)).join('')}</select>
      </div>
      <div class="row wrap chipsbar" id="ochips">${chipsHtml(view)}</div>
      <div class="row wrap bulkbar">${g.h1 ? `<button class="btn sm" data-act="collapseAll">${o.collapsed ? 'Open all groups' : 'Close all groups (summary only)'}</button>` : ''}
        <button class="btn sm" id="oexport" data-act="exportView" title="Excel file of exactly the lines listed below"></button><span class="grow"></span>${bulk}</div>
      <div id="olist">${oListHtml(view)}</div>${detail}`;
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
/* The balance in each DC location: what the stock report has there, plus inwards, minus what is approved from there. */
  function locChips(p) {
    const keys = C.LOC_KEYS.filter((k) => k === 'v' || p.loc[k] || p.locIn[k] || p.locRes[k]), on = locsOn();
    const aside = (k) => on && k !== 'oth' && !S.M.locOrder.includes(k);
    return `<div class="chips"><span class="small">${on ? 'Balance by location:' : 'By location:'}</span>${keys.map((k) => {
      const tot = (p.loc[k] || 0) + (Number(p.locIn[k]) || 0), f = on ? p.locFree[k] : tot;
      return `<span class="chip ${f < 0 ? 'neg' : ''}" title="${esc(`${C.LOC_NAME[k]}: ${inr(p.loc[k] || 0)} in the stock report` + (p.locIn[k] ? `, ${inr(p.locIn[k])} inwards since` : '') + (on ? `, ${inr(p.locRes[k] || 0)} allocated to orders` : ''))}">${C.LOC_NAME[k]} <b>${inr(f)}</b>${f !== tot ? ` <i>of ${inr(tot)}</i>` : ''}${aside(k) ? ' <i>set aside</i>' : ''}</span>`;
    }).join('')}</div>`;
  }
  const stockSum = (p) => (p.inward ? `<div class="small">Total DC qty ${inr(p.dc)} = ${inr(p.stock)} in the stock report + <b>${inr(p.inward)} inwards</b> received since.</div>` : '');
  const NOPOS = { dc: 0, stock: 0, inward: 0, loc: {}, locIn: {}, locRes: {}, locFree: {}, reserved: 0, free: 0, pending: 0, n_stores: 0 };
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
      <div class="alt"><span></span><span class="h">Article</span><span class="h right">Balance DC qty</span><span class="h right">${canAct ? 'Qty' : ''}</span>
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
    const p = M.pos[l.article_code] || NOPOS;
    const free = p.free, pack = l.pack, out = [];
    const tel = (l.phone || '').replace(/\D/g, '');
    const contact = [l.poc_name ? esc(l.poc_name) : '', tel ? `<a href="tel:${esc(tel)}">${esc(l.phone)}</a>` : '', l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ''].filter(Boolean).join(' &middot; ');
    const badges = [a.status === 'In-Active' ? '<span class="badge bad">In-Active article</span>' : '', l.in_master ? '' : '<span class="badge">Not in the Diwali range</span>'].join('');
    out.push(`<div class="back"><button class="btn" data-act="unsel">&#8249; Back to orders</button></div>`);
    out.push(`<div class="card stack">
      <div class="row"><h2 class="grow">Order ${esc(ref(l))}</h2>${pill(l.status)}</div>
      <div class="small"><b>${esc(l.store_code)} ${esc(l.store_name)}</b>${l.city ? ', ' + esc(l.city) : ''}${l.state ? ', ' + esc(l.state) : ''}${l.customer ? ' &nbsp;|&nbsp; ' + esc(l.customer) : ''} &nbsp;|&nbsp; booked ${when(l.order_date)}</div>
      ${contact ? `<div class="small">Booked by: ${contact}</div>` : ''}
      <div class="row top">${thumb(l.article_code, 'l', true)}<div class="grow"><h2>${esc(l.description || '(article details not on file)')}</h2>
        <div class="small">${esc(l.article_code)} &nbsp;|&nbsp; MC ${esc([l.mc_code, l.mc_name].filter(Boolean).join(' ') || '-')}${l.buyer ? ' &nbsp;|&nbsp; ' + esc(l.buyer) : ''}${l.category ? ' &nbsp;|&nbsp; ' + esc(l.category) : ''}</div>
        <div class="small">Pack of ${pack}${a.vendor_name ? ' &nbsp;|&nbsp; ' + esc(a.vendor_name) : ''}</div>${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}</div></div>
      <div class="stats">${stat('MRP', inr(l.mrp))}${stat(l.price_missing ? 'Price (MRP used)' : 'Price wanted', inr(l.req_price))}${stat('Discount', l.discount > 0.0005 ? pct(l.discount) : 'None', l.discount > 0.0005 ? 'warn' : '')}${stat('Margin', pct(l.margin), l.margin != null && l.margin < 0 ? 'bad' : '')}</div>
      <div class="small">${l.margin == null ? 'Margin cannot be worked out: cost or GST for this article is not on file.' : `${l.price_missing ? 'The store gave no price, so MRP is used. ' : ''}Margin after this discount is ${pct(l.margin)}; at ${Number(a.vrp) > 0 && Number(a.vrp) !== Number(l.mrp) ? 'VRP ' + inr(a.vrp) : 'MRP'} it would be ${pct(l.base_margin)}. Order value ${rupees(l.ask_value)}${l.approved ? ', approved ' + rupees(l.value) : ''}.`}</div>
      <div class="stats">${stat('Qty wanted', inr(l.req_qty))}${stat('Approved', inr(l.approved), l.approved ? 'good' : '')}${stat('Offered (alternate)', inr(l.offered), l.offered ? 'warn' : '')}${stat('Pending qty', inr(l.balance), l.balance ? 'bad' : '')}</div>
      ${deliveryNote(l)}</div>`);
    if (l.sap_appr) {
      const x = l.sap_appr, kv = (k, v) => (v ? `<span>${k}</span><b>${v}</b>` : '');
      out.push(`<div class="card stack"><h3>In SAP</h3>${x.conflict ? `<div class="note bad"><b>The SAP approval file differs from this tracker:</b> ${esc(x.conflict)}. Nothing was changed on this line - check it and correct it here or in SAP.</div>` : ''}
        <div class="kv">${kv('Status', esc(x.label || x.status))}${x.status === 'APPROVED' ? kv('Qty allocated', x.qty ? inr(x.qty) + ' pcs' : '') + kv('Price given', x.price ? 'Rs ' + inr2(x.price) : '') : ''}
          ${kv('By', esc(x.by || ''))}${kv('Category approval', x.at ? when(x.at) : '')}${kv('Planning approval', x.plan_at ? when(x.plan_at) : '')}${kv('DC', esc(x.dc || ''))}${kv('PO', esc(x.po || ''))}
          ${kv('Remarks', esc(x.remarks || ''))}${kv('Reason', esc(x.reason || ''))}${kv('From file', esc(x.file || '') + (x.loaded ? ', loaded ' + when(x.loaded) : ''))}</div></div>`);
    }
    if (l.orig_article) out.push(`<div class="card"><div class="note info"><b>${esc(l.article_code)} is here in place of ${esc(l.orig_article)}</b> ${esc(l.orig_desc)}, which is what the store ordered. Cancelling the approval of the alternate brings the ordered article back.</div></div>`);
    if (l.ss) {
      const row = (code, kind, v, strong) => `<tr><td class="w"><b>${esc(code)}</b> <span class="small muted">${kind}</span><div class="small">${esc((artOf(code) || {}).description || '')}</div></td><td class="right">${inr(v.closing)}</td><td class="right">${inr(v.transit)}</td><td class="right b">${inr(v.total)}</td><td class="right">${inr(v.mtd)}</td></tr>`;
      const KIND = { same: 'same design', diff: 'same price', ordered: 'ordered by store' };
      const f = l.ss.family, full = l.req_qty > 0 && f >= l.req_qty;
      out.push(`<div class="card stack"><div class="row"><h3 class="grow">Stock already at ${esc(l.store_code)} ${esc(l.store_name)}</h3><span class="small">${esc(S.M.meta.sstock_file || '')}${S.M.meta.sstock_loaded ? ', loaded ' + when(S.M.meta.sstock_loaded) : ''}</span></div>
        <div class="tablewrap"><table class="tight"><thead><tr><th>Article</th><th class="right">Closing</th><th class="right" title="In transit + CLA">In transit</th><th class="right">Total</th><th class="right">MTD sale</th></tr></thead><tbody>
          ${row(l.article_code, 'this line', l.ss.own, true)}${l.ss.alts.map((x) => row(x.code, KIND[x.kind] || '', x, false)).join('')}
          ${l.ss.alts.length ? `<tr class="b"><td colspan="3">All alike articles at this store</td><td class="right">${inr(f)}</td><td class="right">${inr(l.ss.familyMtd)}</td></tr>` : ''}</tbody></table></div>
        <div class="note ${full ? 'warn' : f > 0 ? 'info' : 'good'}">${full ? `The store already holds <b>${inr(f)} pcs</b> of this article and its alternates - at least the ${inr(l.req_qty)} it is asking for. Worth checking with the store before approving.`
          : f > 0 ? `The store holds ${inr(f)} pcs of this article and its alternates, against ${inr(l.req_qty)} wanted.` : 'The store has no stock of this article or its alternates.'}</div></div>`);
    }
    if (l.dup_count > 0) {
      out.push(`<div class="card stack"><div class="note bad"><b>Duplicate article in order ${esc(l.order_no)}.</b> ${esc(l.article_code)} is ${esc(dupText(l))}. It is taken once here, with ${inr(l.req_qty)} pcs. Check with the store what it really wants.</div>
        ${ed ? '<div class="row"><button class="btn sm" data-act="dupClear" title="Use once the store has confirmed, or corrected the order in SAP">Checked with the store - remove this mark</button></div>' : ''}</div>`);
    }
    else if (l.dup_count < 0) out.push(`<div class="card"><div class="small">This article was entered ${-l.dup_count} times in order ${esc(l.order_no)} in the SAP export (qty ${esc(l.dup_qty || '?')}); taken once. Marked as checked with the store.</div></div>`);
    if (l.sap_new_qty != null) {
      out.push(`<div class="card stack"><div class="note warn">SAP now shows ${inr(l.sap_new_qty)} pcs for this line; the tracker has ${inr(l.sap_qty)}. Nothing was changed automatically.</div>
        ${ed ? `<div class="row"><button class="btn primary" data-act="sapAccept">Use ${inr(l.sap_new_qty)}</button><button class="btn" data-act="sapDismiss">Keep ${inr(l.sap_qty)}</button></div>` : ''}</div>`);
    }
    const others = p.pending - l.balance;
    let shortNote = '';
    if (!M.meta.stock_asof) shortNote = '<div class="note warn">No DC stock report is loaded, so nothing can be approved yet.</div>';
    else if (l.balance > 0 && p.pending > Math.max(free, 0)) {
      shortNote = `<div class="note bad">Short: ${p.n_stores} ${p.n_stores !== 1 ? 'stores are' : 'store is'} waiting for ${inr(p.pending)} pcs of this article and the balance DC quantity is only ${inr(Math.max(free, 0))}${others > 0 ? ` (${inr(others)} pcs asked by other stores)` : ''}.</div>`;
    } else if (l.balance > 0 && others > 0) {
      shortNote = `<div class="note good">${inr(others)} pcs more are waiting on other stores' orders; the balance DC quantity covers all of it.</div>`;
    }
    const canAct = ed && l.status !== 'REJECTED' && l.open_qty > 0;
    const maxOpen = C.roundPack(l.open_qty, pack), freePk = C.floorPack(free, pack), top = Math.max(0, Math.min(maxOpen, freePk));
    const dflt = maxOpen <= freePk ? l.open_qty : top;
    const ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0);
    out.push(`<div class="card stack"><h3>DC stock of the ordered article</h3>
      <div class="stats">${stat('Total DC qty', inr(p.dc))}${stat('Allocated to orders', inr(p.reserved))}${stat('Balance DC qty', inr(free), free >= pack ? 'good' : 'bad')}${stat('Pending PO', ppo ? inr(ppo) : '-')}</div>
      ${stockSum(p)}${p.dc ? locChips(p) : ''}
      ${shortNote}
      ${canAct ? `<div class="row wrap"><span>Approve qty</span><input class="qty" id="ap-qty" type="number" inputmode="numeric" min="0" max="${canGive(l)}" value="${dflt || ''}" data-want="${l.open_qty}" data-pack="${pack}" ${top ? '' : 'disabled'} aria-label="Quantity to approve">
        ${priceOn() && top ? `<span>at Rs</span><input class="qty" id="ap-price" type="number" inputmode="decimal" min="0.01" step="0.01" max="${l.mrp || ''}" value="${l.req_price}" data-asked="${l.req_price}" aria-label="Price to approve" title="Price per piece to approve (the store asked Rs ${l.req_price})">` : ''}
        <button class="btn primary" data-act="approve" ${top ? '' : 'disabled'}>Approve</button><span class="small" id="ap-prev"></span></div>
        ${locsOn() && top ? '<div class="row wrap aploc"><span class="small grow" id="ap-loc"></span><button class="btn sm" data-act="apLocs" title="Take this approval from the DC locations you choose">Choose locations ...</button></div>' : ''}
        <div class="small">${top ? `${inr(l.open_qty)} pcs pending. Whatever is approved is rounded up to full packs of ${pack}.` : (free > 0 ? `Balance DC quantity is only ${inr(free)} pcs - less than one pack of ${pack}. Use an alternate below.` : 'No balance DC quantity - use an alternate below.')}</div>` : ''}</div>`);
    const alts = C.alternates(M, l.article_code);
    if (alts.same.length || alts.diff.length) {
      const freeIn = (arr) => arr.reduce((t, x) => t + Math.max(0, C.freeOf(M, x.article_code)), 0);
      out.push(`<div class="card stack"><div class="row"><h2 class="grow">Alternates</h2><span class="small">${inr(freeIn(alts.same) + freeIn(alts.diff))} pcs balance at DC in ${alts.same.length + alts.diff.length}</span></div>
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
if (l.approved_open > 0) acts.push('<button class="btn link" data-act="dispatch" title="Not needed day to day: when you load a newer DC stock report you are asked whether the approved stock has left the DC. Use this only to record one line by hand.">Mark dispatched by hand</button>');
      if (l.status === 'PARTIAL') acts.push('<button class="btn" data-act="closeBal" title="The store gets only what is approved; the rest is no longer pending">Close pending qty</button>');
      if (l.status === 'REJECTED') acts.push('<button class="btn" data-act="reopen">Reopen</button>');
      else if (l.dispatched === 0) acts.push('<button class="btn danger" data-act="reject">Reject line ...</button>');
      if (l.balance_closed) acts.push('<button class="btn" data-act="reopen">Reopen pending qty</button>');
    }
    out.push(`<div class="card stack"><h3>Approved on this line</h3>
      ${!allocs ? '<div class="muted">Loading ...</div>' : !allocs.length ? '<div class="muted">Nothing yet.</div>' : allocs.map((x) => {
        const kind = x.article_code === (l.orig_article || l.article_code) ? 'ordered article' : 'alternate';
        const rounded = x.entered_qty != null && x.entered_qty !== x.qty ? ` <span class="small">(${inr(x.entered_qty)} asked, rounded up to full packs)</span>` : '';
        let b = '';
        if (ed && x.state === 'OFFERED') b = `<button class="btn sm primary" data-act="confirmOffer" data-alloc="${x.id}">Store confirmed</button><button class="btn sm" data-act="declineOffer" data-alloc="${x.id}">Store declined</button>${locsOn() ? `<button class="btn link" data-act="allocLocs" data-alloc="${x.id}">Change locations</button>` : ''}<button class="btn link" data-act="remsg">Message again</button>`;
else if (ed && x.state === 'APPROVED') b = `${locsOn() && x.source !== 'SAP' ? `<button class="btn sm" data-act="allocLocs" data-alloc="${x.id}">Change locations ...</button>` : ''}<button class="btn link" data-act="undo" data-alloc="${x.id}">Cancel approval</button>`;
        else if (ed) b = `<button class="btn link" data-act="undo" data-alloc="${x.id}">Undo dispatch</button>`;
        const from = locsOn() && C.locText(x.locs) ? `<div class="allocfrom">Taken from <b>${esc(C.locText(x.locs))}</b></div>` : '';
        return `<div class="alloc">${pill(x.state)}<div class="grow"><b>${inr(x.qty)} pcs</b> of ${esc(x.article_code)} ${esc((artOf(x.article_code) || {}).description || '')}${rounded}
          ${from}<span class="muted">(${kind}, ${when(x.created_at)}, ${esc(x.created_by || '')})</span>${b ? `<div class="row wrap" style="margin-top:6px">${b}</div>` : ''}</div></div>`;
      }).join('')}
      ${l.status === 'REJECTED' ? `<div class="note bad">Rejected: ${esc(l.reject_reason || 'no reason given')}</div>` : ''}
      ${acts.length ? `<div class="row wrap">${acts.join('')}</div>` : ''}</div>`);
    if (d && d.events.length) {
      out.push(`<div class="card stack"><h3>History</h3><div class="hist">${d.events.map((e) =>
        `<div><span class="muted">${when(e.ts)} ${esc(e.user_name || '')}</span> <b>${esc(e.action.charAt(0) + e.action.slice(1).toLowerCase())}</b> ${esc(e.detail || '')}</div>`).join('')}</div></div>`);
    }
    return out.join('');
  }
  /* The pop-up for choosing which DC locations a quantity is taken from.
     o: {title, article, qty, pack, maxQty (0 = the quantity is fixed), current (locations an existing approval holds), okLabel}.
     Resolves with {qty, locs} or null when cancelled. */
  function locDialog(o) {
    const M = S.M, p = M.pos[o.article] || NOPOS, cur0 = o.current || {}, a = artOf(o.article) || {};
    const avail = {}; C.LOC_KEYS.forEach((k) => { avail[k] = Math.max(0, (p.locFree[k] || 0) + (Number(cur0[k]) || 0)); });
    const keys = C.LOC_KEYS.filter((k) => avail[k] > 0 || cur0[k] > 0 || k === 'v');
    const aside = (k) => k !== 'oth' && !M.locOrder.includes(k);
    const hasCur = Object.keys(cur0).some((k) => cur0[k] > 0);
    const start = hasCur ? cur0 : C.splitByOrder(M.locOrder, avail, C.roundPack(o.qty, o.pack)).use;
    const pr = ask(o.title, `<div class="stack">
      <p class="small"><b>${esc(o.article)}</b> ${esc(a.description || '')}${o.pack > 1 ? ` &middot; pack of ${o.pack}` : ''}</p>
      ${o.maxQty ? `<label class="f">Quantity to approve<input type="number" name="qty" class="qty" inputmode="numeric" min="1" max="${o.maxQty}" value="${o.qty || ''}" required></label>` : `<p>Quantity: <b>${inr(o.qty)} pcs</b></p>`}
      <div class="locgrid"><span class="h">DC location</span><span class="h right">Available there</span><span class="h right">Take from here</span>
        ${keys.map((k) => `<span>${C.LOC_NAME[k]}${aside(k) ? ' <i class="small">(set aside)</i>' : ''}</span><b class="right ${avail[k] > 0 ? '' : 'muted'}">${inr(avail[k])}</b>
          <input type="number" class="qty locq" name="loc_${k}" data-k="${k}" inputmode="numeric" min="0" max="${avail[k]}" value="${start[k] || ''}" placeholder="0" ${avail[k] > 0 ? '' : 'disabled'} aria-label="Quantity from ${C.LOC_NAME[k]}">`).join('')}</div>
      <div class="row wrap"><button type="button" class="btn sm" data-fill>Fill in the usual order</button><span class="grow"></span><span data-tally class="small"></span></div>
      <p class="small">The usual order is ${M.locOrder.map((k) => C.LOC_SHORT[k]).join(', ')}. It is used whenever you approve without choosing, and can be changed on the Data screen.</p></div>`, o.okLabel || 'Approve', { cls: 'locpop' });
    const d = $('#modal').lastElementChild, ok = $('[data-ok]', d), qi = $('[name=qty]', d), boxes = $$('.locq', d);
    let touched = hasCur;
    const want = () => (qi ? C.roundPack(Math.round(+qi.value || 0), o.pack) : o.qty);
    const fill = () => { const sp = C.splitByOrder(M.locOrder, avail, want()); boxes.forEach((i) => { i.value = sp.use[i.dataset.k] || ''; }); };
    const tallyLoc = () => {
      const w = want(), typed = qi ? Math.round(+qi.value || 0) : w, sum = boxes.reduce((t, i) => t + Math.max(0, Math.round(+i.value || 0)), 0);
      const over = boxes.find((i) => Math.round(+i.value || 0) > +i.max), tooMany = o.maxQty && w > o.maxQty;
      const head = qi && w !== typed && w ? `${inr(typed)} rounded up to full packs = <b>${inr(w)} pcs</b>. ` : '';
      $('[data-tally]', d).innerHTML = !w ? 'Enter the quantity.' : tooMany ? `<span class="bad">${head}At most ${inr(o.maxQty)} pcs can be approved: that is the balance DC quantity.</span>`
        : over ? `<span class="bad">${C.LOC_NAME[over.dataset.k]} has only ${inr(+over.max)} pcs.</span>`
        : sum === w ? `${head}<span class="good">All <b>${inr(w)} pcs</b> placed.</span>`
        : sum < w ? `${head}<span class="bad"><b>${inr(sum)}</b> of ${inr(w)} pcs placed - ${inr(w - sum)} more to place.</span>` : `${head}<span class="bad"><b>${inr(sum)}</b> placed, that is ${inr(sum - w)} more than the ${inr(w)} pcs.</span>`;
      ok.disabled = !(w > 0 && sum === w && !over && !tooMany);
    };
    d.addEventListener('input', (e) => { if (e.target.classList.contains('locq')) touched = true; else if (e.target === qi && !touched) fill(); tallyLoc(); });
    $('[data-fill]', d).onclick = () => { touched = false; fill(); tallyLoc(); };
    tallyLoc();
    return pr.then((v) => {
      if (!v) return null;
      const locs = {}; C.LOC_KEYS.forEach((k) => { const q = Math.round(+v['loc_' + k] || 0); if (q > 0) locs[k] = q; });
      return { qty: qi ? Math.round(+v.qty || 0) : o.qty, locs };
    });
  }
  /* The price typed next to the quantity: null = as the store asked. Refuses a price above MRP. */
  function priceFrom(l, inp) {
    if (!priceOn() || !inp) return { ok: true, price: null };
    const v = String(inp.value).trim(), p = Math.round(+v * 100) / 100;
    if (!v) return { ok: true, price: null };
    if (!(p > 0)) return { ok: false, msg: 'The price must be more than zero.' };
    const mrp = Number((artOf(l.article_code) || {}).mrp) || Number(l.mrp) || 0;
    if (mrp && p > mrp) return { ok: false, msg: `Rs ${inr2(p)} is above the MRP of this article (Rs ${inr2(mrp)}).` };
    return { ok: true, price: Math.abs(p - l.req_price) > 0.004 ? p : null };
  }
  const priceNote = (l, price) => (price != null ? ` at Rs ${inr2(price)} (store asked ${inr2(l.req_price)})` : '');
  async function approveWithLocs(l, typedQty, price, warned) {
    if (!l) return;
    const top = canGive(l);
    if (!top) return tell('Approve', 'Nothing can be approved on this line right now: there is no balance DC quantity for a full pack.');
    const q = Math.min(Math.max(1, Math.round(+typedQty || 0) || l.open_qty), top);
    const v = await locDialog({ title: 'Approve: choose the DC location', article: l.article_code, qty: q, pack: l.pack, maxQty: top });
    if (!v) return;
    const f = C.roundPack(v.qty, l.pack);
    if (!(warned && f <= C.roundPack(q, l.pack)) && !(await overOk(l, f))) return;
    run(() => A.rpc('allocate', Object.assign({ p_line: l.id, p_article: l.article_code, p_qty: v.qty, p_locs: v.locs }, price != null ? { p_price: price } : {})), `Approved ${inr(f)} pcs of ${l.article_code}${priceNote(l, price)} from ${C.locText(v.locs)}`);
  }
  function rowPreview(i) {                           // under the Approve box of a row: what the typed quantity becomes
    const el = $('.rowprev', i.closest('td')); if (!el) return;
    const q = Math.round(+i.value || 0), pk = +i.dataset.pack || 1, f = C.roundPack(q, pk), max = +i.max || 0;
    const want = +i.dataset.want || 0, over = f > C.roundPack(want, pk) ? f - want : 0;
    el.innerHTML = !q ? '' : f > max ? `<span class="bad">at most ${inr(max)} (the DC balance)</span>`
      : (f !== q ? `rounded up to <b>${inr(f)} pcs</b> (${inr(f / pk)} ${plural(f / pk, 'pack')})` : '') + (over ? `${f !== q ? '<br>' : ''}<span class="warn b">${inr(over)} more than the store wants</span>` : '');
    const fr = $('.rowfrom', i.closest('td')), l = S.M.byId[+i.dataset.id];
    if (fr && l) fr.innerHTML = q && f <= max ? fromHtml(l.article_code, f) : '';
  }
  /* What the typed quantities become once rounded up to full packs. */
  function packPreview() {
    const i = $('#ap-qty'), el = $('#ap-prev');
    if (i && el) {
      const q = Math.round(+i.value || 0), pk = +i.dataset.pack || 1, f = C.roundPack(q, pk), max = +i.max || 0;
      const want = +i.dataset.want || 0, over = f > C.roundPack(want, pk) ? f - want : 0;
      el.innerHTML = !q ? '' : f > max ? `<span class="bad">${inr(f)} pcs is more than the DC balance allows (${inr(max)})</span>`
        : (pk > 1 ? `= <b>${inr(f)} pcs</b> to the store (${inr(f / pk)} ${plural(f / pk, 'pack')} of ${pk})` : '') + (over ? ` <span class="warn b">${inr(over)} more than the store wants</span>` : '');
      const lo = $('#ap-loc'), l = cur();
      if (lo && l) lo.innerHTML = q && f <= max ? 'Taken ' + fromHtml(l.article_code, f) : '';
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
    if (S.s.art && (!M.pos[S.s.art] || (S.wide && !rows.some((r) => r.c === S.s.art)))) S.s.art = null;
    let list;
    if (!M.meta.stock_asof) list = '<div class="empty card">Shortages appear once a DC stock report is loaded.</div>';
    else if (!rows.length) list = `<div class="empty card">${S.s.only ? 'No article is short. Every pending order line can be covered from free DC stock.' : 'No pending demand.'}</div>`;
    else if (S.wide) {
      list = `<div class="tablewrap"><table class="twoline"><thead><tr><th>MC</th><th class="right">MRP</th><th>Article</th><th>Description</th><th class="right">Total<br>DC qty</th><th class="right">Allocated<br>to orders</th>
        <th class="right">Balance<br>DC qty</th><th class="right">Pending<br>order qty</th><th class="right">Stores</th><th class="right">Short by</th><th class="right">Pending<br>PO</th><th class="right">Balance,<br>same design</th><th class="right">Balance,<br>other designs</th></tr></thead><tbody>
        ${rows.map(({ c, p, a, gap }) => { const al = C.alternates(M, c), sf = altFreeOf(al.same), df = altFreeOf(al.diff), ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0);
          return `<tr class="pick ${S.s.art === c ? 'sel' : ''}" data-act="shortSel" data-code="${esc(c)}"><td class="w mc"><span class="caret">${S.s.art === c ? '&#9662;' : '&#9656;'}</span> ${esc(a.mc_name || '')}</td><td class="right b">${inr(a.mrp)}</td><td>${esc(c)}</td><td class="w">${esc(a.description || '')}</td>
          <td class="right">${inr(p.dc)}</td><td class="right">${p.reserved ? inr(p.reserved) : '-'}</td><td class="right b ${p.free > 0 ? 'good' : 'bad'}">${inr(p.free)}</td>
          <td class="right b">${inr(p.pending)}</td><td class="right">${p.n_stores}</td><td class="right b ${gap > 0 ? 'bad' : 'muted'}">${gap > 0 ? inr(gap) : '-'}</td><td class="right ${ppo ? '' : 'muted'}" title="${ppo ? `This month ${inr(a.ppo_cm || 0)}, next month ${inr(a.ppo_nm || 0)}` : ''}">${ppo ? inr(ppo) : '-'}</td>
          <td class="right ${sf ? 'good' : 'muted'}">${inr(sf)}</td><td class="right ${df ? 'good' : 'muted'}">${inr(df)}</td></tr>` +
            (S.s.art === c ? `<tr class="sdrow"><td colspan="13"><div id="sdetail">${sDetailHtml()}</div></td></tr>` : ''); }).join('')}</tbody></table></div>`;
    } else {
      list = rows.map(({ c, p, a, gap }) => `<div class="ocard" data-act="shortSel" data-code="${esc(c)}">${thumb(c, 's')}<div class="grow">
        <div class="row"><span class="mcname grow">${esc(a.mc_name || '')}</span>${gap > 0 ? `<span class="pill REJECTED">Short ${inr(gap)}</span>` : ''}</div>
        <div><b>${esc(a.description || c)}</b></div>
        <div class="small">MRP ${inr(a.mrp)} &middot; ${esc(c)} &middot; ${p.n_stores} ${plural(p.n_stores, 'store')} waiting</div>
        <div class="nums"><span>Balance DC qty <b class="${p.free > 0 ? 'good' : 'bad'}">${inr(p.free)}</b></span><span>Pending order qty <b>${inr(p.pending)}</b></span><span>Pending PO <b>${inr((Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0))}</b></span><span>In alternates <b>${inr(altFreeOf(C.allAlternates(M, c)))}</b></span></div></div></div>`).join('');
    }
    const detail = S.wide ? '' : `<div id="sdetail" class="${S.s.art ? 'sheetpage' : ''}" ${!S.s.art ? 'hidden' : ''}>${sDetailHtml()}</div>`;
    return `<div class="head"><h1>Shortages</h1><span class="sub">Articles that several stores are waiting for${editor() ? ' - share out the balance DC quantity here' : ''}</span><span class="grow"></span><button class="btn sm" data-act="exportShort" title="Excel file of every article listed here, and the order lines waiting for each">Export shortages to Excel</button></div>
      <div class="toolbar two"><input type="search" id="sq" placeholder="Search article, MC or buyer ..." value="${esc(S.s.q)}" aria-label="Search shortages">
        <label class="row" style="min-height:38px"><input type="checkbox" id="sonly" ${S.s.only ? 'checked' : ''}> Only articles that are short</label></div>
      ${S.wide && rows.length && M.meta.stock_asof ? `<p class="small" style="margin:0 0 8px">${inr(rows.length)} ${plural(rows.length, 'article')}, most short first. Click an article to open its order lines just below it; click it again to close.</p>` : ''}
      <div class="slist">${list}</div>${detail}`;
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
      body = `<div class="tablewrap"><table><thead><tr><th>Order</th><th>Booked</th><th>Deliver by</th><th>Store</th>${hasCust ? '<th>Customer</th>' : ''}<th class="right">Price wanted</th><th class="right">Disc.</th><th class="right">Qty wanted</th>
        <th class="right">Approved</th><th class="right">Pending qty</th>${S.M.hasStoreStock ? '<th class="right" title="Closing stock + in transit at the store, in this article and its alternates">At store<br>(incl. alternates)</th><th class="right">MTD sale</th>' : ''}${ed ? '<th class="right">Approve qty</th>' : ''}</tr></thead><tbody>
        ${waiting.map((l) => `<tr><td>${esc(ref(l))}</td><td>${when(l.order_date)}</td><td>${delCell(l)}</td><td class="w"><b>${esc(l.store_code)}</b> ${esc(l.store_name)}</td>${hasCust ? `<td>${esc(l.customer)}</td>` : ''}
          <td class="right">${inr(l.req_price)}</td><td class="right">${discCell(l)}</td><td class="right">${inr(l.req_qty)}</td><td class="right">${l.approved ? inr(l.approved) : '-'}</td><td class="right b">${inr(l.balance)}</td>
          ${l.ss ? `<td class="right ${l.ss.family >= l.req_qty ? 'warn b' : ''}" title="${esc(ssTitle(l))}">${inr(l.ss.family)}</td><td class="right">${inr(l.ss.familyMtd)}</td>` : S.M.hasStoreStock ? '<td></td><td></td>' : ''}
          ${ed ? `<td class="right">${input(l)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    } else {
      body = waiting.map((l) => `<div class="ocard" style="cursor:default"><div class="grow"><div class="row"><b class="grow">${esc(l.store_code)} ${esc(l.store_name)}</b><span>Pending qty <b>${inr(l.balance)}</b></span></div>
        <div class="small">${esc(ref(l))} &middot; ${when(l.order_date)}${l.customer ? ' &middot; ' + esc(l.customer) : ''}${l.del_date ? ' &middot; wants ' + when(l.del_date) : ''}</div>
        ${ssHtml(l)}${ed ? `<div class="row" style="margin-top:6px"><span class="grow small">Approve qty</span>${input(l)}</div>` : ''}</div></div>`).join('');
    }
    return `<div class="back"><button class="btn" data-act="shortUnsel">&#8249; Shortages</button></div>
      <div class="card stack sdcard"><div class="row top">${thumb(c, 'm', true)}<div class="grow"><div class="mcname">${esc(a.mc_name || '')} &nbsp;|&nbsp; MRP ${inr(a.mrp)}</div><h2>${esc(c)} &nbsp; ${esc(a.description || '')}</h2>
        <div class="small">Pack of ${pack}${a.buyer ? ' &nbsp;|&nbsp; ' + esc(a.buyer) : ''}</div>
        ${al.same.length ? `<div>Same design, balance DC qty - ${names(al.same)}</div>` : ''}${al.diff.length ? `<div>Same price, other design, balance DC qty - ${names(al.diff)}</div>` : ''}${!al.same.length && !al.diff.length ? '<div class="muted">No alternates listed.</div>' : ''}
${ed ? `<div class="small">Give each store its share below, in full packs. Lines left short stay open so alternates can be offered from the Orders screen.${locsOn() ? ' The stock is taken from the DC locations in the usual order; to choose the location for one store, approve it from Pending orders.' : ''}</div>` : ''}</div></div>
      <div class="stats five">${stat('Total DC qty', inr(p.dc))}${stat('Allocated to orders', inr(p.reserved))}${stat('Balance DC qty', inr(p.free), p.free > 0 ? 'good' : 'bad')}${stat('Pending order qty', inr(p.pending), p.pending > free ? 'bad' : '')}${stat('Pending PO', (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0) ? inr((Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0)) : '-')}</div>
      ${stockSum(p)}${p.dc ? locChips(p) : ''}
      ${body}
      ${ed ? `<div class="row wrap"><span>Fill:</span><button class="btn sm" data-act="fill" data-m="fifo">Oldest order first</button><button class="btn sm" data-act="fill" data-m="prorata">Share in proportion</button>
        <button class="btn sm" data-act="fill" data-m="">Clear</button><span class="grow"></span><span id="stally"></span><button class="btn primary" id="sapply" data-act="applySplit">Approve these quantities</button></div>` : ''}</div>`;
  }
  function tally() {
    const el = document.getElementById('stally'); if (!el || !S.s.art) return;
    const free = Math.max(S.M.pos[S.s.art].free, 0), pack = C.packOf(S.M.articles[S.s.art]);
    const total = Object.values(S.s.qty).reduce((t, v) => t + C.roundPack(+v || 0, pack), 0), over = total > free;
    el.innerHTML = `<span class="${over ? 'bad' : 'good'}">Approving <b>${inr(total)}</b> of <b>${inr(free)}</b> balance DC qty${pack > 1 ? ' (full packs of ' + pack + ')' : ''} - ${over ? inr(total - free) + ' too many' : inr(free - total) + ' left'}</span>`;
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
      <b>${esc(a.article_code)}</b><div class="d">${esc(a.description)}</div><div class="small">MRP ${inr(a.mrp)} &nbsp;|&nbsp; Balance DC <b class="${free > 0 ? 'good' : 'bad'}">${inr(free)}</b></div>${tags ? `<div style="margin-top:3px">${tags}</div>` : ''}</div>`;
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
    const othOf = (s) => (s.total || 0) - C.LOCATIONS.reduce((t, [k]) => t + (s[k] || 0), 0);           // in the total, but under no location
    const rep = (k) => (k === 'oth' ? sites.reduce((t, s) => t + othOf(s), 0) : sumOf(k));
    const inwards = (d && d.inwards) || [], inBy = {}; inwards.forEach((i) => { inBy[i.loc] = (inBy[i.loc] || 0) + i.qty; });
    const inTot = inwards.reduce((t, i) => t + i.qty, 0), lf = d && d.loc_free;
    const report = sumOf('total'), dc = report + inTot, reserved = d ? d.reserved : 0, free = dc - reserved, pack = C.packOf(a);
    const mp = M.pos[code] || { pending: 0, n_stores: 0 };
    const al = C.alternates(M, code), ppo = (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0);
const locs = C.LOC_KEYS.filter((k) => k === 'v' || rep(k) || inBy[k] || (lf && lf[k])).map((k) => [k, C.LOC_NAME[k]]);
    const cell = (v, cls) => `<td class="right ${cls || ''} ${v ? '' : 'muted'}">${v ? inr(v) : '-'}</td>`;
    const sumRow = (label, total, f, cls) => `<tr class="${cls || ''}"><td>${label}</td><td class="right b">${inr(total)}</td>${locs.map(([k]) => cell(f(k), cls === 'tot' ? 'b' : '')).join('')}</tr>`;
    const kv = (k, v) => (v === '' || v == null ? '' : `<span>${k}</span><b>${v}</b>`);
    const strip = (title, arr) => (arr.length ? `<h3>${title}</h3><div class="strip">${arr.map((m) => { const f = C.freeOf(M, m.article_code);
      return `<div data-act="art" data-code="${esc(m.article_code)}">${thumb(m.article_code, '')}<div class="small">${esc(m.article_code)}</div><b class="${f > 0 ? 'good' : 'bad'}">Balance ${inr(f)}</b></div>`; }).join('')}</div>` : '');
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
<div class="stats">${stat('Total DC qty', inr(dc))}${stat('Allocated to orders', inr(reserved))}${stat('Balance DC qty', inr(free), free >= pack ? 'good' : 'bad')}${stat('Pending PO', ppo ? inr(ppo) : '-')}</div>
        ${sites.length || inTot ? `<div class="tablewrap"><table class="twoline calc"><thead><tr><th>${M.meta.stock_asof ? 'Stock report of ' + when(M.meta.stock_asof) : 'DC'}</th><th class="right">Total</th>${locs.map(([, t]) => `<th class="right">${t.replace(' (', '<br>(')}</th>`).join('')}</tr></thead><tbody>
          ${sites.map((s) => `<tr><td>${esc(s.site_code)}</td><td class="right b">${inr(s.total)}</td>${locs.map(([k]) => cell(k === 'oth' ? othOf(s) : s[k])).join('')}</tr>`).join('')}
          ${sites.length > 1 ? sumRow('All DCs', report, rep, 'tot') : ''}
          ${inTot ? sumRow('+ Inwards since the report', inTot, (k) => inBy[k] || 0, 'plus') : ''}
          ${lf ? sumRow('&minus; Allocated to orders', reserved, (k) => rep(k) + (inBy[k] || 0) - (lf[k] || 0), 'minus') + sumRow('= Balance DC qty', free, (k) => lf[k] || 0, 'tot bal') : ''}</tbody></table></div>`
          : `<div class="note info">${M.meta.stock_asof ? 'Not in the latest DC stock report.' : 'No DC stock report is loaded.'}</div>`}
        ${inwards.length ? `<div class="small"><b>Inwards since the stock report:</b>${inwards.slice(0, 8).map((i) => `<br>${when(i.inward_at)} &middot; ${inr(i.qty)} pcs into ${C.LOC_NAME[i.loc] || i.loc}${i.mc_name ? ' &middot; ' + esc(i.mc_name) : ''}${i.doc_no ? ' &middot; GRN ' + esc(i.doc_no) : ''}${i.site_code ? ' &middot; ' + esc(i.site_code) : ''} <span class="muted">(${esc(i.source_file || '')})</span>`).join('')}${inwards.length > 8 ? `<br>... and ${inwards.length - 8} more` : ''}</div>` : ''}
        ${editor() && locsOn() && M.meta.stock_asof ? `<div><button class="btn sm" data-act="inwardHand" data-code="${esc(code)}" title="Stock of this article received at the DC after the stock report">Add an inward for this article ...</button></div>` : ''}
        ${d && d.store_total && S.M.hasStoreStock ? `<div class="small"><b>In stores</b> (store stock report): ${inr(d.store_total.closing)} pcs closing stock, ${inr(d.store_total.intransit)} in transit, held by ${inr(d.store_total.stores)} ${plural(d.store_total.stores, 'store')}; ${inr(d.store_total.mtd_sale)} sold this month.</div>` : ''}
        ${d && d.ly && d.ly.lines ? `<div class="small"><b>Last year</b>: ${inr(d.ly.lines)} order ${plural(d.ly.lines, 'line')} from ${inr(d.ly.stores)} ${plural(d.ly.stores, 'store')}, ${inr(d.ly.wq)} pcs wanted, ${inr(d.ly.fq)} pcs approved (Rs ${inr(Math.round(d.ly.fv))}). <a href="#" data-act="lyArt" data-code="${esc(code)}">See the lines</a></div>` : ''}
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
      L.push(fq <= deal.free ? `<span class="good">The balance DC quantity covers it (${inr(deal.free)} pcs)</span>`
        : `<span class="bad">DC is short by ${inr(fq - Math.max(deal.free, 0))} pcs (balance DC qty ${inr(Math.max(deal.free, 0))})</span>${deal.altCount ? ` - ${deal.altCount} ${plural(deal.altCount, 'alternate')} listed above` : ''}${deal.ppo ? `, pending PO ${inr(deal.ppo)}` : ''}`);
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
    const step = (title, text, btns, status) => `<div class="card step"><div class="row wrap"><h2 class="grow">${title}</h2>${btns}</div><p class="small">${text}</p>${status ? `<div class="stepstatus">${status}</div>` : ''}</div>`;
    const b = (label, act, extra, cls) => `<button class="btn sm ${cls || ''}" data-act="${act}" ${extra || ''}>${label}</button>`;
    const left = [];
    if (ed && M.schema < LATEST_SCHEMA) left.push('<div class="card"><div class="note warn"><b>One database update is waiting.</b> In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Until then the newest features do not work: queries from the stores, the comparison with last year, stock at the stores, choosing the DC location of an approval, inwards after the stock report, an approved alternate taking the place of the ordered article, deleting order lines, and duplicate marks. Your data stays as it is.</div></div>');
    if (ed) {
      left.push(step('1 &nbsp;Diwali article master', 'The gifting range: article, description, MC, category, buyer, MRP, VRP, cost, GST, pack size, vendor, and the two alternate columns (same model / different model). This file wins wherever it has a value.', b('Upload file ...', 'pick', 'data-kind="master"') + b('Template', 'template', 'data-kind="master"', 'ghost'), last('Diwali article master')));
      left.push(step('2 &nbsp;Article images', 'Pictures named by article code (1005107.jpg). They are made smaller and stored online for everyone. An article without a picture shows "Image not uploaded".', b('Choose pictures ...', 'pickImages') + (S.wide ? b('Choose a folder ...', 'pickFolder') : ''), last('Images')));
      left.push(step('3 &nbsp;Full article data (second file)', 'The complete article sheet (DSR article-wise). Used for any article that is ordered but is not in the Diwali master, and for status, pending PO and store stock of all articles. It never overwrites what the Diwali master says.', b('Upload file ...', 'pick', 'data-kind="data"') + b('Template', 'template', 'data-kind="data"', 'ghost'), last('Full article data')));
      left.push(step('4 &nbsp;Stores: emails and lead times', 'Store code, name, state, city, email and lead time (days from allocation to delivery). These can come from different files - for example the store email list and the lead-time list (DC/RDC, ST CD, STORE NAME, State, LEAD TIME; the .xlsb works as it is): upload each one, they are merged by store code. The lead time sets the allocate-by date of every order line, and the Queries screen fills in store name, state and lead time from here.', b('Upload store list ...', 'pick', 'data-kind="stores"') + b('Template', 'template', 'data-kind="stores"', 'ghost'), storeStatus()));
      left.push(step('5 &nbsp;DC stock report', 'The SAP DC stock download. Total MSA quantity is the DC stock; the split by location (V01 & V02, NSO, HH reserved, special buy, best seller) is kept alongside. Upload a fresh one any time: approvals stay, and the balance DC quantity is worked out again. For stock that arrives in between, use Inwards below instead of loading the whole report again.', b('Upload DC stock ...', 'pick', 'data-kind="stock"', 'primary') + b('Template', 'template', 'data-kind="stock"', 'ghost'), last('DC stock')));
      if (locsOn()) {
        const loads = M.inwardLoads.filter((x) => x.counted > 0), inTot = inwardTotal(M), allIn = loads.reduce((t, x) => t + x.counted, 0);
        const st = !M.meta.stock_asof ? '<span class="small warn">Load the DC stock report first.</span>'
          : !loads.length ? `<span class="small">No inwards loaded since the stock report of ${when(M.meta.stock_asof)}.</span>`
          : `<div><b>${inr(allIn)} pcs</b> of inwards since the stock report of ${when(M.meta.stock_asof)}${allIn !== inTot ? ` (${inr(inTot)} pcs of them in articles of the Diwali range or on an order)` : ''}:</div>
            <div class="loads">${loads.map((x) => `<div class="m"><span class="grow">${when(x.at)} &middot; ${esc(x.file || '')} &middot; ${inr(x.entries)} ${plural(x.entries, 'entry', 'entries')} &middot; <b>${inr(x.counted)} pcs</b>${x.counted < x.qty ? ` <span class="small">(${inr(x.qty - x.counted)} pcs from before the report are not counted)</span>` : ''}<span class="small"> &middot; ${esc(x.by_name || '')}</span></span>
              <button class="btn sm danger" data-act="inwardRemove" data-batch="${x.batch}">Remove</button></div>`).join('')}</div>`;
        left.push(step('6 &nbsp;Inwards after the stock report', 'Stock received at the DC after the report above was downloaded. Upload the inward (GRN) list or type one in, and it is added to the DC stock straight away - the full stock report does not have to be loaded again. <b>Total DC qty = stock report + inwards. Balance DC qty = that minus what is approved.</b> When a newer stock report is loaded, the inwards it already contains stop being added by themselves.',
          b('Upload inwards ...', 'pick', 'data-kind="inward"', 'primary') + b('Add one by hand ...', 'inwardHand') + b('Template', 'template', 'data-kind="inward"', 'ghost'), st));
        const aside = C.LOCATIONS.filter(([k]) => !M.locOrder.includes(k)).map(([, t]) => t);
        left.push(step('DC locations: which one is used first', `Every approval is taken from a DC location. When you approve without choosing, the stock is taken in this order: <b>${M.locOrder.map((k, i) => `${i + 1}. ${C.LOC_NAME[k]}`).join(' &nbsp; ')}</b>.${aside.length ? ` Only when you choose it: <b>${aside.map(esc).join(', ')}</b>.` : ''} On any approval you can choose the locations yourself (Pending orders &gt; Choose), or change them afterwards (Details &gt; Change locations).`, b('Change the order ...', 'locOrder')));
      }
      if (ssOn()) {
        const ssSt = M.meta.sstock_batch ? `<span class="small">Last loaded ${when(M.meta.sstock_loaded)} (${esc(M.meta.sstock_file || '')}): ${inr(M.counts.store_stock_rows || 0)} store-article rows</span>` : '<span class="small warn">Not loaded yet</span>';
        left.push(step('7 &nbsp;Stock at the stores', 'The store-wise stock report (closing stock, in transit, CLA and sales by store and article - the SAP download as it comes, even the large web-page .xls). Shown on every order line: closing stock, in transit (in transit + CLA), the total, and the sale this month - for the ordered article and for its alternates, so you can see when a store already holds stock. Each upload replaces the previous one.',
          b('Upload store stock ...', 'pick', 'data-kind="storestock"') + b('Template', 'template', 'data-kind="storestock"', 'ghost'), ssSt));
      }
      left.push(step('8 &nbsp;Orders', 'Upload the SAP order export as often as you like, exactly as it comes out. Only order lines that are not already here are added; existing lines and their approvals are never overwritten. A missing or zero price is taken as MRP.', b('Upload orders ...', 'pick', 'data-kind="orders"', 'primary') + b('Template', 'template', 'data-kind="orders"', 'ghost'), last('Orders')));
      if (sapOn()) left.push(step('9 &nbsp;Approvals done in SAP', 'The SAP approval export (OrderNo, ArtCode, ApprStatus ...). For each order + article: <b>approved by category or by planning</b> - the quantity allocated in SAP (QtyAlloc) is approved here, at the price given, by the person (IssueRecBy) and on the date (CatApprDate) SAP shows. These are <b>not</b> taken off the DC stock (the stock report already accounts for them); <b>rejected</b> - the line is rejected with the SAP status and remark. Lines not in the tracker yet are added. Nothing is applied twice, and where the tracker and SAP disagree nothing is changed: those lines are listed for you to check. ',
        b('Upload SAP approvals ...', 'pick', 'data-kind="sapappr"', 'primary') + b('Template', 'template', 'data-kind="sapappr"', 'ghost'), last('SAP approvals')));
    }
    if (ed && lyOn()) {
      const lySt = M.meta.ly_batch ? `<span class="small">Last loaded ${when(M.meta.ly_loaded)} (${esc(M.meta.ly_file || '')}): ${inr(M.lyDaily.reduce((t, x) => t + x[1], 0))} order lines, booked ${M.lyDaily.length ? esc(dmy(M.lyDaily[0][0], true)) + ' to ' + esc(dmy(M.lyDaily[M.lyDaily.length - 1][0], true)) : ''}</span>` : '<span class="small warn">Not loaded yet</span>';
      left.push(step("10 &nbsp;Last year's orders", "Last year's corporate order tracker (Order ID, Art Code, Qty Wanted, Booking Date, Price wanted, Final Qty to Store, Order Value ...). Used only for the comparison on the Last year screen and the dashboard: this year against last year by D-day, by MC and MRP, and by store. It never changes this year's orders. Each upload replaces the previous one, and Clear everything keeps it.",
        b("Upload last year ...", 'pick', 'data-kind="lastyear"') + b('Template', 'template', 'data-kind="lastyear"', 'ghost'), lySt));
    }
    left.push(step('Export everything', 'One Excel file with every order line (pending, approved, dispatched, rejected), every allocation, stock by location and the activity log. To export only the pending orders, the approved orders or the shortages, use the Export button on that screen.', b('Export to Excel', 'export')));
    if (M.counts.deleted) left.push(step('Deleted order lines', `${inr(M.counts.deleted)} order ${plural(M.counts.deleted, 'line')} deleted from the Orders screen. They stay out when the SAP export is uploaded again. ${ed ? 'You can bring any of them back.' : ''}`, b('Show deleted lines', 'showDeleted')));
    left.push(`<div class="card stack" id="teamcard"><div class="row"><h2 class="grow">Team</h2></div><div id="team" class="muted">Loading ...</div></div>`);
    left.push(step('Your account', `Signed in as ${esc(S.me.email)} (${ed ? 'editor' : 'view only'}).`, b('Change password', 'password') + b('Sign out', 'signout')));
    if (ed) left.push(step('Try it out', 'Loads an invented range in the same file layouts as your real reports: a Diwali master with both kinds of alternates, a larger article data sheet, stores with lead times, DC stock by location and a first batch of orders. "Clear everything" removes all articles, stock, orders and approvals (the team stays).', b('Load test data', 'testdata') + b('Clear everything ...', 'wipe', '', 'danger')));
    const log = M.imports.length ? M.imports.map((e) => `<div>${when(e.ts)}  ${esc(e.user_name || '')}\n${esc(e.detail)}</div>`).join('') : 'Nothing loaded yet.';
    setTimeout(loadTeam, 0);
    return `<div class="head"><h1>Data</h1><span class="sub">${inr(n.master || 0)} articles in the Diwali range, ${inr(n.articles || 0)} on file &nbsp;|&nbsp; ${inr(Object.keys(M.stores).length)} stores &nbsp;|&nbsp; ${inr(M.lines.length)} order lines &nbsp;|&nbsp; ${M.meta.stock_asof ? 'DC stock as of ' + when(M.meta.stock_asof) + (M.meta.stock_sites ? ' (' + esc(M.meta.stock_sites) + ')' : '') : 'no DC stock report yet'}</span></div>
      <div class="steps two"><div class="steps">${left.join('')}</div><div class="card stack"><h2>Activity: loads and changes to the team</h2><div class="log">${log}</div></div></div>`;
  }
  /* How complete the store list is: shown under Data > 4, so a missing state or lead time is easy to spot */
  function storeStatus() {
    const all = Object.values(S.M.stores), n = all.length, c = (f) => all.filter(f).length;
    if (!n) return '<span class="small warn">Not loaded yet</span>';
    const st = c((x) => (x.state || '').trim()), lt = c((x) => x.lead_time != null), em = c((x) => (x.email || '').trim());
    const e = S.M.imports.find((x) => (x.detail || '').startsWith('Store list'));
    const part = (k, v) => `<span class="${v < n ? 'warn' : ''}">${inr(v)} with ${k}</span>`;
    return `<span class="small">${e ? `Last loaded ${when(e.ts)}. ` : ''}<b>${inr(n)} stores</b>: ${part('a state', st)}, ${part('a lead time', lt)}, ${part('an email', em)}.${st < n || lt < n ? ' Upload the lead-time store list (it has the state and the lead time) to fill in the rest.' : ''}</span>`;
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
  const TITLES = { master: 'Diwali article master', data: 'Full article data', stores: 'Stores', stock: 'DC stock report', orders: 'Orders', inward: 'Inwards', storestock: 'Stock at the stores', sapappr: 'Approvals done in SAP', lastyear: "Last year's orders" };
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
        const cnt = (f) => shaped.filter((r) => r[f] != null && r[f] !== '').length;
        msg = `${where}Stores in the file: ${inr(shaped.length)}\nAdded: ${inr(added)}\nUpdated: ${inr(updated)}\n` +
          (has('state') ? `State read for ${inr(cnt('state'))} of ${inr(shaped.length)} stores\n` : '') + (has('lead_time') ? `Lead time read for ${inr(cnt('lead_time'))} of ${inr(shaped.length)} stores\n` : '') + `\nThis file gave: ${[has('store_name') && 'store name', has('email') && 'email', has('lead_time') && 'lead time', has('dc') && 'DC / RDC', has('state') && 'state', has('city') && 'city'].filter(Boolean).join(', ')}` +
          (!has('email') ? '\n(No email column here - upload the file with store emails as well.)' : '') + (!has('lead_time') ? '\n(No lead time column here - upload the lead time file as well.)' : '');
      } else if (kind === 'orders') {
        const shaped = C.shape.orders(rows), parts = chunks(shaped, 1000);
        if (!shaped.length) throw new Error('No order lines were found in this file.');
        let added = 0, skipped = 0, flagged = 0, noPrice = 0, gone = 0, notes = [];
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Checking ${inr(Math.min((i + 1) * 1000, shaped.length))} of ${inr(shaped.length)} order lines ...`);
          const r = await A.rpc('import_orders', { p_rows: parts[i], p_file: file.name, p_log: false });
          added += r.added; skipped += r.skipped; flagged += r.flagged; noPrice += r.no_price || 0; gone += r.deleted || 0; notes = notes.concat(r.notes || []);
        }
        await A.rpc('log_import', { p_detail: `Orders '${file.name}': added ${added}, already here ${skipped}, quantity changed in SAP ${flagged}` + (shaped.extraRows ? `, duplicate article in order ${Array.from(new Set(shaped.filter((o) => o.dups).map((o) => o.order_no))).join(', ')}` : '') });
        const dupOrders = Array.from(new Set(shaped.filter((o) => o.dups).map((o) => o.order_no)));
        msg = `${where}Rows in the file: ${inr(shaped.length + shaped.extraRows)}\nNew order lines added: ${inr(added)}\nAlready in the tracker (skipped): ${inr(skipped)}\nQuantity changed in SAP (flagged for review): ${inr(flagged)}` +
          (noPrice ? `\nNew lines without a price (MRP used): ${inr(noPrice)}` : '') + (gone ? `\nDeleted by you earlier (not added again): ${inr(gone)}` : '') +
          (dupOrders.length ? `\n\nDUPLICATE ARTICLE in ${dupOrders.length} ${plural(dupOrders.length, 'order')}: ${dupOrders.join(', ')}\nThe same article is entered more than once in the order. Each is taken once${S.M.schema >= 3 ? ' and marked on the Orders screen (filter: "Duplicate article in the order")' : ''}:` + firstFew(shaped.repeats, 15).replace(/^\n\n/, '\n') +
            (S.M.schema >= 3 ? '' : '\n(To keep these marked on the Orders screen, run the newest supabase-setup.sql once in Supabase. Your data stays as it is.)') : '') + firstFew(Array.from(new Set(notes)), 12);
      } else if (kind === 'sapappr') {
        if (!sapOn()) throw new Error('Approvals done in SAP need the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.');
        const shaped = C.shape.sapappr(rows), parts = chunks(shaped, 300);
        const others = Object.entries(shaped.others);
        if (!shaped.length) throw new Error('No approved or rejected order lines were found in this file.' + (others.length ? '\nStatuses found: ' + others.map(([k, n]) => `${k} (${n})`).join(', ') : ''));
        const t = { approved: 0, approved_new: 0, rejected: 0, rejected_new: 0, same: 0, closed: 0, deleted: 0, conflicts: [], notes: [] };
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Applying ${inr(Math.min((i + 1) * 300, shaped.length))} of ${inr(shaped.length)} lines ...`);
          const r = await A.rpc('sap_status_import', { p_rows: parts[i], p_file: file.name });
          for (const k of ['approved', 'approved_new', 'rejected', 'rejected_new', 'same', 'closed', 'deleted']) t[k] += r[k] || 0;
          t.conflicts = t.conflicts.concat(r.conflicts || []); t.notes = t.notes.concat(r.notes || []);
        }
        const nA = shaped.filter((x) => x.st === 'A').length, nR = shaped.length - nA;
        msg = `${where}Lines in the file: ${inr(shaped.length + others.reduce((x, [, n]) => x + n, 0))} (approved ${inr(nA)}, rejected ${inr(nR)})\n\n` +
          `Pending lines now approved: ${inr(t.approved)}\nNew lines added as approved: ${inr(t.approved_new)}\nPending lines now rejected: ${inr(t.rejected)}\nNew lines added as rejected: ${inr(t.rejected_new)}\n` +
          `Already as SAP says (nothing to do): ${inr(t.same)}` + (t.closed ? `\nApproved for less than wanted - the rest closed: ${inr(t.closed)}` : '') +
          (t.deleted ? `\nDeleted here earlier (left out): ${inr(t.deleted)}` : '') +
          (others.length ? `\nOther statuses, not used: ${others.map(([k, n]) => `${k} (${n})`).join(', ')}` : '') +
          (t.conflicts.length ? `\n\nNEED A LOOK - the tracker and SAP disagree, nothing was changed (${t.conflicts.length}; filter "Differs from the SAP approval file"):` + firstFew(t.conflicts, 15).replace(/^\n\n/, '\n') : '') +
          firstFew(Array.from(new Set(t.notes)), 10) + '\n\nThese approvals are not taken off the DC stock: the DC stock report already accounts for them.';
      } else if (kind === 'lastyear') {
        if (!lyOn()) throw new Error("Last year's orders need the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.");
        const shaped = C.shape.lastyear(rows), parts = chunks(shaped, 2000);
        if (!shaped.length) throw new Error('No order lines were found in this file (each needs an order number, an article code and a booking date).');
        const batch = await A.rpc('ly_begin');
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Saving ${inr(Math.min((i + 1) * 2000, shaped.length))} of ${inr(shaped.length)} lines ...`);
          await A.rpc('ly_chunk', { p_batch: batch, p_rows: parts[i] });
        }
        const r = await A.rpc('ly_commit', { p_batch: batch, p_file: file.name });
        const SE = C.season(S.M, []), sts = {};
        shaped.forEach((x) => { const k = x.st || '(no status)'; sts[k] = (sts[k] || 0) + 1; });
        const has = (f) => rows.fields.includes(f), withArt = rows.filter((x) => /^\d{6,}$/.test(C.code(x.article_code))).length;
        msg = `${where}Order lines: ${inr(r.lines)}\nOrders: ${inr(r.orders)}\nStores: ${inr(r.stores)}\nBooked: ${dmy(r.from, true)} to ${dmy(r.to, true)}\nQty wanted: ${inr(r.qty)} pcs\nOrder value (approved): Rs ${inr(Math.round(r.value))}\n` +
          `Status: ${Object.entries(sts).map(([k, n]) => `${k} ${inr(n)}`).join(', ')}` +
          (withArt > shaped.length ? `\nRows with an article code left out (no order number or booking date): ${inr(withArt - shaped.length)}` : '') +
          (!has('order_value') ? '\n(No "Order Value" column: the approved value is final qty x price wanted.)' : '') +
          `\n\nD-30 last year: ${dmy(SE.ly0, true)}. Compared with this year from ${dmy(SE.ty0, true)} (Last year screen). This replaces any earlier load of last year's orders.`;
      } else if (kind === 'storestock') {
        if (!ssOn()) throw new Error('Stock at the stores needs the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.');
        prog.set('Reading the store stock ...'); await tick();
        const shaped = C.shape.storestock(rows), parts = chunks(shaped, 5000);
        if (!shaped.length) throw new Error('No store stock was found in this file.');
        const batch = await A.rpc('sstock_begin');
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Saving ${inr(Math.min((i + 1) * 5000, shaped.length))} of ${inr(shaped.length)} store-article rows ...`);
          await A.rpc('sstock_chunk', { p_batch: batch, p_rows: parts[i] });
        }
        const r = await A.rpc('sstock_commit', { p_batch: batch, p_file: file.name });
        const ordering = new Set(S.M.lines.map((l) => l.store_code)), inFile = new Set(shaped.map((x) => x.s));
        const missing = Array.from(ordering).filter((x) => !inFile.has(x));
        const has = (f) => rows.fields.includes(f);
        msg = `${where}Rows read: ${inr(rows.length)}\nStores: ${inr(r.stores)}\nArticles: ${inr(r.articles)}\nStore-article rows saved: ${inr(r.rows)}\n\nUsed: closing stock (CL_STK_Q)${has('ss_it') ? ', in transit (INTRANSIT_Q)' : ''}${has('ss_cla') ? ' + CLA (CLA_STK_Q)' : ''}${has('ss_mtd') ? ', sale this month (MTD_SALE_Q)' : ''}. Other sale columns are not used.` +
          (!has('ss_mtd') ? '\n(No MTD sale column was found in this file.)' : '') +
          (missing.length ? `\n\nStores with orders that are not in this file (shown as no stock): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' ...' : ''}` : '') + '\n\nThis replaces the store stock loaded before.';
      } else if (kind === 'inward') {
        msg = await importInward(rows, file, prog, quiet);
        if (msg === null) { prog.close(); return; }
        msg = where + msg;
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
    let asof = new Date(file.lastModified || Date.now()), outBefore = null;
    const M0 = S.M, open = locsOn() ? M0.lines.filter((l) => l.approved_open > 0) : [], openQty = open.reduce((t, l) => t + l.approved_open, 0), hadIn = inwardTotal(M0);
    if (!quiet) {
      const last = (localStorage.getItem('allocdesk-out') || '').split(':'), was = last[0], hrs = +last[1] >= 0 && last[1] !== undefined && last[1] !== '' ? +last[1] : 24;
      const radio = (val, text) => `<label class="row top"><input type="radio" name="out" value="${val}" ${was === val ? 'checked' : ''} required> <span>${text}</span></label>`;
      const v = await ask('DC stock report', `<div class="stack">
        <p>${inr(arts)} articles, <b>${inr(total)} pcs</b> in total, DC ${esc(sites.join(', '))}.</p>
        ${rd.reportDate ? `<p class="small">The report itself is dated: <b>${esc(rd.reportDate)}</b></p>` : ''}
        ${hasLoc ? '' : '<p class="note warn">This file has no location columns (V01 & V02, NSO ...), so only the total will be shown.</p>'}
        <label class="f">When was this report downloaded from SAP?<input type="datetime-local" name="asof" value="${localInput(asof)}" required></label>
        ${open.length ? `<div class="note info stack"><div><b>${inr(openQty)} pcs on ${inr(open.length)} order ${plural(open.length, 'line')} are approved.</b> Has that stock already left the DC, so that this report no longer has it?</div>
          ${radio('all', 'Yes, all of it has left. It is not taken off this report again; those lines show as Dispatched.')}
          ${radio('none', 'No, it is all still in the DC. It stays Approved and is taken off this report.')}
          ${radio('hours', `Only what was approved more than <input type="number" name="hrs" value="${hrs}" min="0" max="999" step="1" style="width:70px;display:inline-block;min-height:30px;padding:2px 6px" aria-label="hours"> hours before this report has left.`)}</div>` : ''}
        ${hadIn ? `<p class="small">Inwards loaded earlier (${inr(hadIn)} pcs): those received before the time above are part of this report now and stop being added on top.</p>` : ''}</div>`, 'Load DC stock');
      if (!v) return null;
      asof = new Date(v.asof);
      if (isNaN(asof)) throw new Error('The date and time could not be read.');
      if (open.length) {
        const h = Math.max(0, +v.hrs || 0);
        outBefore = v.out === 'all' ? asof : v.out === 'hours' ? new Date(asof.getTime() - h * 3600e3) : null;
        try { localStorage.setItem('allocdesk-out', v.out + ':' + h); } catch (e) { /* the choice is simply not remembered */ }
      }
    }
    const batch = await A.rpc('stock_begin'), parts = chunks(shaped, 2000);
    for (let i = 0; i < parts.length; i++) {
      prog.set(`Sending ${inr(Math.min((i + 1) * 2000, shaped.length))} of ${inr(shaped.length)} stock rows ...`);
      await A.rpc('stock_chunk', { p_batch: batch, p_rows: parts[i] });
    }
const r = await A.rpc('stock_commit', Object.assign({ p_batch: batch, p_asof: asof.toISOString(), p_file: file.name }, outBefore ? { p_out_before: outBefore.toISOString() } : {}));
    const M = S.M, inFile = new Set(shaped.map((x) => x.a)), missing = Object.values(M.articles).filter((a) => a.in_master && !inFile.has(a.article_code)).length;
    return `Articles with DC stock: ${inr(r.articles)}\nTotal quantity: ${inr(r.total)} pcs\nDC: ${r.sites}` +
      (M.counts.master ? `\nDiwali-range articles not in this report (stock 0): ${missing} of ${M.counts.master}` : '') +
      (r.left_dc ? `\nApprovals taken as already out of the DC (now Dispatched): ${inr(r.left_dc)}` : open.length ? `\nApproved stock still in the DC and taken off this report: ${inr(openQty)} pcs` : '') + firstFew(r.notes || [], 12);
  }
  /* Inwards received after the stock report in use. Entries dated before the report are left out
     (the report already has them); the rest are added to the DC stock. */
  async function importInward(rows, file, prog, quiet) {
    const M = S.M;
    if (!locsOn()) throw new Error('Inwards need the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.');
    if (!M.meta.stock_asof) throw new Error('Load the DC stock report first. Inwards are added on top of it.');
    const all = C.shape.inward(rows);
    if (!all.length) throw new Error('No inward quantities were found in this file.');
    const asof = new Date(M.meta.stock_asof), p2 = (n) => String(n).padStart(2, '0');
    const asofDay = asof.getFullYear() + '-' + p2(asof.getMonth() + 1) + '-' + p2(asof.getDate()), asofMins = asof.getHours() * 60 + asof.getMinutes();
    const after = [], before = [], unsure = [];
    for (const e of all) {
      if (!e.day) unsure.push(e);
      else if (e.day > asofDay) after.push(e);
      else if (e.day < asofDay) before.push(e);
      else if (e.mins == null) unsure.push(e);
      else (e.mins > asofMins ? after : before).push(e);
    }
    const qty = (arr) => arr.reduce((t, e) => t + e.q, 0), n = (arr) => `${inr(arr.length)} ${plural(arr.length, 'entry', 'entries')}, ${inr(qty(arr))} pcs`;
    const earlier = M.inwardLoads.filter((x) => x.counted > 0), earlierQty = earlier.reduce((t, x) => t + x.counted, 0), hasDoc = all.some((e) => e.d);
    const undated = unsure.filter((e) => !e.day).length;
    let addUnsure = true, replace = false;
    if (!quiet) {
      const radio = (name, val, text, on) => `<label class="row top"><input type="radio" name="${name}" value="${val}" ${on ? 'checked' : ''}> <span>${text}</span></label>`;
      const v = await ask('Inwards', `<div class="stack">
        <p>${n(all)} in ${inr(new Set(all.map((e) => e.a)).size)} articles. The DC stock report in use is as of <b>${when(asof)}</b>.</p>
        ${after.length ? `<div class="note good">Received after the stock report: <b>${n(after)}</b> - added to the DC stock.</div>` : ''}
        ${before.length ? `<div class="note warn">Received before the stock report: ${n(before)} - left out, the report already has them.</div>` : ''}
        ${unsure.length ? `<div class="note info stack"><div><b>${n(unsure)}</b> ${undated === unsure.length ? 'have no date in the file' : `are dated ${when(asofDay)}, the day of the stock report, with no time`}, so the app cannot tell whether the report already has them.</div>
          ${radio('unsure', 'add', 'They came in after the stock report - add them', true)}${radio('unsure', 'skip', 'The stock report already has them - leave them out', false)}</div>` : ''}
        ${earlier.length ? `<div class="note info stack"><div>Inwards already loaded since the stock report: <b>${inr(earlierQty)} pcs</b> in ${earlier.length} ${plural(earlier.length, 'load')}.</div>
          ${radio('mode', 'add', `This file has new inwards only - add it to them${hasDoc ? ' (a GRN number that is already loaded is skipped, so nothing is counted twice)' : ''}`, true)}
          ${radio('mode', 'replace', 'This file has everything received since the stock report - it takes the place of the earlier loads', false)}</div>` : ''}
        <p class="small">Location: ${rows.fields.includes('sloc') || ['v0102', 'v01', 'v02', 'nso', 'hh', 'spl', 'best', 'sea'].some((f) => rows.fields.includes(f)) ? 'taken from the storage location in the file (0023 NSO, 0043 HH reserved, 0041 special buy, 0042 best seller; anything else V01 & V02).' : 'the file has no storage location, so everything goes into V01 & V02.'}</p></div>`, 'Add to DC stock', { noFocus: true });
      if (!v) return null;
      addUnsure = v.unsure !== 'skip'; replace = v.mode === 'replace';
    }
    const local = (day, mins) => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), Math.floor(mins / 60), mins % 60).toISOString();
    const justAfter = new Date(asof.getTime() + 60000).toISOString();
    const send = after.map((e) => ({ a: e.a, q: e.q, l: e.l, s: e.s, d: e.d, m: e.m, n: e.n, t: e.mins == null ? local(e.day, 12 * 60) : local(e.day, e.mins) }))
      .concat(addUnsure ? unsure.map((e) => ({ a: e.a, q: e.q, l: e.l, s: e.s, d: e.d, m: e.m, n: e.n, t: justAfter })) : []);
    const left = before.length + (addUnsure ? 0 : unsure.length);
    if (!send.length && !replace) return `Nothing was added.\n\nEntries in the file: ${inr(all.length)}\nLeft out (the stock report already has them): ${inr(left)}`;
    let added = 0, skipped = 0, pcs = 0, batch = null, replaced = 0;
    const parts = send.length ? chunks(send, 2000) : [[]];
    for (let i = 0; i < parts.length; i++) {
      prog.set(`Saving ${inr(Math.min((i + 1) * 2000, send.length))} of ${inr(send.length)} inward entries ...`);
      const r = await A.rpc('inward_add', Object.assign({ p_rows: parts[i], p_file: file.name, p_replace: replace && i === 0 }, batch ? { p_batch: batch } : {}));
      batch = r.batch; added += r.added; skipped += r.skipped; pcs += r.qty; replaced += r.replaced || 0;
    }
    const known = send.filter((e) => !M.articles[e.a]), unknownArts = new Set(known.map((e) => e.a)).size;
    /* what matters for the orders: the articles of the Diwali range or on an order, by MC */
    const mine = send.filter((e) => M.articles[e.a]), byMc = {};
    mine.forEach((e) => { const k = e.m || (M.articles[e.a] || {}).mc_name || '(MC not given)'; byMc[k] = (byMc[k] || 0) + e.q; });
    const mcList = Object.entries(byMc).sort((x, y) => y[1] - x[1]);
    const notGr = (all.skipped || []).length;
    return `Entries in the file: ${inr(all.length + notGr)}\nAdded to the DC stock: ${inr(added)} ${plural(added, 'entry', 'entries')}, ${inr(pcs)} pcs` +
      (notGr ? `\nNot goods receipts (movement type other than 101, or a minus quantity), not added: ${inr(notGr)}` : '') +
      (mine.length ? `\n\nArticles of the Diwali range or on orders: ${inr(new Set(mine.map((e) => e.a)).size)}, ${inr(mine.reduce((t, e) => t + e.q, 0))} pcs. By MC:\n` + mcList.slice(0, 12).map(([k, q]) => `  ${k}: ${inr(q)} pcs`).join('\n') + (mcList.length > 12 ? `\n  ... and ${mcList.length - 12} more MCs` : '') : '') +
      (skipped ? `\nAlready loaded earlier, same GRN number (skipped): ${inr(skipped)}` : '') + (left ? `\nLeft out, the stock report already has them: ${inr(left)}` : '') +
      (replaced ? `\nEarlier inward entries replaced by this file: ${inr(replaced)}` : '') +
      (unknownArts ? `\n\n${inr(unknownArts)} ${plural(unknownArts, 'article')} in the file ${unknownArts === 1 ? 'is' : 'are'} not in the Diwali range or on any order. They are stored, and show up once such an article is ordered.` : '') +
      '\n\nThe total and balance DC quantity on every screen now include these inwards.';
  }
  async function inwardByHand(code0) {
    const M = S.M;
    if (!locsOn()) return tell('Inwards', 'Inwards need the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.');
    if (!M.meta.stock_asof) return tell('Inwards', 'Load the DC stock report first. Inwards are added on top of it.');
    const v = await ask('Add an inward', `<div class="stack">
      <p class="small">For stock received at the DC after the stock report of ${when(M.meta.stock_asof)}. It is added to the DC stock straight away.</p>
      <label class="f">Article code<input type="text" name="art" inputmode="numeric" value="${esc(code0)}" required autocomplete="off"></label>
      <label class="f">Quantity received (pcs)<input type="number" name="qty" min="1" step="1" inputmode="numeric" required></label>
      <label class="f">Into which DC location<select name="loc">${C.LOCATIONS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      <label class="f">GRN / document number (optional)<input type="text" name="doc" autocomplete="off"></label>
      <label class="f">Received at<input type="datetime-local" name="at" value="${localInput(new Date())}" required></label></div>`, 'Add to DC stock', { noFocus: !!code0 });
    if (!v) return;
    const a = C.code(v.art), q = Math.round(+v.qty || 0), at = new Date(v.at);
    if (!a || q <= 0 || isNaN(at)) return tell('Not added', 'Enter the article code, a quantity and the time.');
    if (at <= new Date(M.meta.stock_asof)) return tell('Not added', `That time is before the stock report in use (as of ${when(M.meta.stock_asof)}), which already has this stock. Nothing was added.`);
    if (!artOf(a)) {
      let d = null;
      try { d = await A.rpc('article_detail', { p_article: a }); } catch (e) { /* treated as not found */ }
      if (!d || !d.article) return tell('Not added', `There is no article ${a} in the Diwali article master or the full article data. Check the code.`);
    }
    await run(() => A.rpc('inward_add', { p_rows: [{ a, q, l: v.loc, d: C.code(v.doc), t: at.toISOString() }], p_file: 'Entered by hand' }), `${inr(q)} pcs of ${a} added to the DC stock`);
    if (artPop && artPop.isConnected) openArticle(a);
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
      for (const [kind, name] of [['data', '2_Full_Article_Data.xlsx'], ['stores', '3_Store_Emails.xlsx'], ['stores', '4_Lead_Time.xlsx'], ['stock', '5_DC_Stock.xlsx'], ['storestock', '9_Store_Stock.xls'], ['orders', '6_Orders_Batch1.xlsx'], ['lastyear', '10_Last_Year_Orders.xlsx']]) {
        if (kind === 'storestock' && !ssOn()) continue;
        if (kind === 'lastyear' && !lyOn()) continue;
        if ((await importFile(kind, await get(name), true)) === false) return;
      }
      await tell('Test data loaded', `${inr(S.M.counts.master)} articles in the Diwali range (${inr(S.M.counts.articles)} on file), ${inr(Object.keys(S.M.stores).length)} stores, ${inr(S.M.lines.length)} order lines.\n\nTo see duplicates being skipped, upload 7_Orders_Batch2.xlsx (in the testdata folder of the download) under Orders.\nTo see inwards being added to the DC stock, upload 8_Inwards_After_Stock.xlsx under Inwards.`);
    } catch (e) { await tell('Test data was not loaded', e.message); }
  }
  /* An Excel template for an upload: the headings exactly as the app reads them, an example row, and what goes in each column. */
  async function downloadTemplate(kind) {
    const t = C.TEMPLATES[kind]; if (!t) return;
    try {
      const X = await XL(), wb = X.utils.book_new();
      const ws = X.utils.aoa_to_sheet([t.cols.map((c) => c[0]), t.cols.map((c) => c[3])]);
      ws['!cols'] = t.cols.map((c) => ({ wch: Math.max(12, String(c[0]).length + 2, String(c[3]).length + 2) }));
      X.utils.book_append_sheet(wb, ws, t.sheet);
      const help = X.utils.aoa_to_sheet([['Column', 'Must be there?', 'What to put']].concat(t.cols.map((c) => [c[0], c[1] || 'No', c[2]])).concat([[], ['Keep the headings exactly as they are. Columns can be in any order; extra columns are ignored. Replace the example row with your data.']]));
      help['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 90 }];
      X.utils.book_append_sheet(wb, help, 'How to fill');
      saveBlob(new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), t.file + '.xlsx');
      toast('Template downloaded');
    } catch (e) { tell('Template', e.message); }
  }
  /* ---------- Excel files ---------- */
  const r1 = (x) => (x == null ? null : Math.round(x * 1000) / 10);
  const ORDER_HEAD = ['Status', 'Site', 'Store Name', 'Order No', 'MC Code', 'MC Desc', 'Article Code', 'Article Desc', 'MRP', 'Qty Wanted', 'Book Date', 'Delivery Date', 'Price Wanted',
    'Booked By', 'Contact Number', 'Article ordered by store', 'State', 'City', 'Buyer', 'Category', 'In Diwali Range', 'Article Status', 'Price given by store', 'Discount %', 'Margin % after discount', 'Pk size',
    'Approved qty (as entered)', 'Final Qty to Store', 'Price Approved', 'Approved from (DC location)', 'Order Value', 'Offered (awaiting store)', 'Dispatched Qty', 'Pending Qty',
    'Remarks / reject reason', 'Duplicate article in order', 'Approved by', 'Lead time (days)', 'DC / RDC', 'Allocate by', 'Delivery at risk', 'Total DC Qty (stock report + inwards)', 'of which inwards since the report', 'Balance DC Qty']
    .concat(C.LOCATIONS.map(([, t]) => 'Balance in ' + t), ['Pending PO', 'Store Closing Stock', 'Store In Transit (incl. CLA)', 'Store Total Stock', 'Store MTD Sale', 'Store Stock in Alternates', 'Alternates Held by Store',
      'SAP Approval Status', 'SAP Qty Allocated', 'SAP Price Given', 'SAP Approved By', 'SAP Approval Date', 'SAP PO', 'SAP Remarks', 'Differs From SAP',
      'SAP Qty Changed', 'New SAP Qty', 'Imported At', 'Source File']);
  function orderRow(l, ex, byLine) {
    const M = S.M, mine = (byLine[l.id] || []).filter((a) => a.state !== 'OFFERED'), p = M.pos[l.article_code] || NOPOS, a = M.articles[l.article_code] || {};
    return [C.STATUS_LABEL[l.status], l.store_code, l.store_name, l.order_no, l.mc_code, l.mc_name, l.article_code, l.description, +l.mrp, l.req_qty, l.order_date, l.del_date || '', +l.req_price,
      l.poc_name, l.phone, l.orig_article ? l.orig_article + ' ' + l.orig_desc : '', l.state, l.city, l.buyer, l.category, l.in_master ? 'Yes' : 'No', l.art_status, l.price_missing ? 'No (MRP used)' : 'Yes',
      r1(l.discount), r1(l.margin), l.pack, mine.reduce((t, x) => t + (x.entered_qty == null ? x.qty : x.entered_qty), 0), l.approved, l.appr_price, C.locText(l.locs), l.value, l.offered, l.dispatched, l.balance,
      l.status === 'REJECTED' ? (l.reject_reason || '') : (l.balance_closed && l.open_qty ? 'Pending qty closed' : (l.supplied && l.supplied !== l.article_code ? 'Given in ' + l.supplied : '')),
      l.dup_count ? `Entered ${Math.abs(l.dup_count)} times (qty ${l.dup_qty || ''}), taken once${l.dup_count < 0 ? ' - checked with the store' : ''}` : '', ex.approvers[l.id] || '', l.lead_time, l.dc, l.allocate_by || '', l.late ? 'Yes' : '',
      p.dc || 0, p.inward || 0, p.free || 0].concat(C.LOCATIONS.map(([k]) => p.locFree[k] || 0), [(Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0),
      l.ss ? l.ss.own.closing : '', l.ss ? l.ss.own.transit : '', l.ss ? l.ss.own.total : '', l.ss ? l.ss.own.mtd : '', l.ss ? l.ss.altTotal : '', l.ss ? l.ss.alts.filter((x) => x.total > 0).map((x) => `${x.code} (${x.total})`).join(', ') : '',
      ...(() => { const x = l.sap_appr || {}; return [x.label || '', x.qty || '', x.price || '', x.by || '', x.at ? when(x.at) : '', x.po || '', x.remarks || '', x.conflict || '']; })(),
      l.sap_new_qty != null ? 'Yes' : '', l.sap_new_qty, when(l.imported_at), l.source_file]);
  }
  const STOCK_HEAD = ['MC Name', 'MRP', 'Article', 'Description', 'Buyer', 'Same design group', 'Same price group', 'Pack', 'Stock report qty (Total MSA)', 'Inwards since the report', 'Total DC Qty']
    .concat(C.LOCATIONS.map(([, t]) => t + ' (report + inwards)'), ['Allocated to orders', 'Balance DC Qty'], C.LOCATIONS.map(([, t]) => 'Balance in ' + t), ['Pending Order Qty', 'Stores Waiting', 'Short By', 'Pending PO', 'Balance in same design', 'Balance in other designs']);
  function stockRow(c) {
    const M = S.M, p = M.pos[c], a = M.articles[c] || {}, al = C.alternates(M, c);
    return [a.mc_name, a.mrp == null ? null : +a.mrp, c, a.description, a.buyer, a.group_same, a.group_diff, C.packOf(a), p.stock, p.inward, p.dc].concat(C.LOCATIONS.map(([k]) => (p.loc[k] || 0) + (Number(p.locIn[k]) || 0)),
      [p.reserved, p.free], C.LOCATIONS.map(([k]) => p.locFree[k] || 0), [p.pending, p.n_stores, Math.max(0, p.pending - Math.max(p.free, 0)), (Number(a.ppo_cm) || 0) + (Number(a.ppo_nm) || 0), altFreeOf(al.same), altFreeOf(al.diff)]);
  }
  /* Builds one Excel file. fill(sheet, extra) adds the sheets; it returns the line to show when done. */
  async function excelFile(fileStem, needExtra, fill) {
    const prog = progress('Preparing the Excel file ...');
    try {
      const X = await XL(), ex = needExtra ? await A.rpc('export_data') : null, byLine = {};
      if (ex) ex.allocations.forEach((a) => { (byLine[a.line_id] = byLine[a.line_id] || []).push(a); });
      const wb = X.utils.book_new();
      const sheet = (name, head, rows) => {
        const ws = X.utils.aoa_to_sheet([head].concat(rows));
        ws['!cols'] = head.map((h, i) => ({ wch: Math.min(45, Math.max(String(h).length, ...rows.slice(0, 300).map((r) => String(r[i] == null ? '' : r[i]).length)) + 2) }));
        if (rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
        X.utils.book_append_sheet(wb, ws, name);
      };
      const msg = fill(sheet, ex, byLine);
      const d = new Date(), name = `${fileStem}_${String(d.getDate()).padStart(2, '0')}${when(d).slice(3, 6)}_${when(d).slice(7).replace(':', '')}.xlsx`;
      saveBlob(new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
      prog.close(); toast(msg);
    } catch (e) { prog.close(); await tell('Export failed', e.message); }
  }
  /* Everything: every order line, every allocation, the stock position and the log. */
  function exportExcel() {
    const M = S.M;
    return excelFile('Corporate_Orders', true, (sheet, ex, byLine) => {
      sheet('Order lines', ORDER_HEAD, M.lines.map((l) => orderRow(l, ex, byLine)));
sheet('Allocations', ['Order No', 'Line', 'Site', 'Ordered Article', 'Allocated Article', 'Type', 'Qty entered', 'Qty in full packs', 'Price approved', 'From DC location', 'State', 'Created', 'By', 'Decided', 'Dispatched'],
        ex.allocations.map((a) => { const l = M.byId[a.line_id] || {};
          return [l.order_no, l.line_item || '', l.store_code, l.orig_article || l.article_code, a.article_code, a.article_code === (l.orig_article || l.article_code) ? 'Ordered article' : 'Alternate',
            a.entered_qty == null ? a.qty : a.entered_qty, a.qty, a.price != null ? +a.price : l.req_price, C.locText(a.locs), C.STATUS_LABEL[a.state], when(a.created_at), a.created_by, when(a.decided_at), when(a.dispatched_at)]; }));
      sheet('Stock position', STOCK_HEAD, Object.keys(M.pos).sort().map(stockRow));
      if (ex.inwards && ex.inwards.length) sheet('Inwards', ['Received', 'Article', 'Description', 'MC', 'Qty', 'DC location', 'DC', 'GRN / document', 'File', 'Loaded by', 'Counted on top of the stock report'],
        ex.inwards.map((i) => [when(i.inward_at), i.article_code, i.description || (artOf(i.article_code) || {}).description || '', i.mc_name || (artOf(i.article_code) || {}).mc_name || '', i.qty, C.LOC_NAME[i.loc] || i.loc, i.site_code, i.doc_no, i.source_file, i.created_by, i.counted ? 'Yes' : 'No (the stock report already has it)']));
      sheet('Activity log', ['When', 'User', 'Order No', 'Line', 'Action', 'Detail'], ex.events.map((e) => [when(e.ts), e.user_name, e.order_no, String(e.line_no || '').includes('~') ? '' : e.line_no, e.action, e.detail]));
      return `Exported ${inr(M.lines.length)} order lines`;
    });
  }
  /* The lines listed on the Pending orders or Approved orders screen right now, in one go. */
  function exportLines(view) {
    const rows = ordersFiltered(view).slice().sort(sortCmp(sec(view)) || rowOrder), filtered = activeFilters(view).length > 0;
    const what = view === 'approved' ? SEGS[S.a.seg][0] : 'Pending orders';
    if (!rows.length) return tell('Export', 'There are no lines to export here.');
    return excelFile(view === 'approved' ? { todo: 'Approved_Orders', done: 'Dispatched', rej: 'Rejected' }[S.a.seg] : 'Pending_Orders', true, (sheet, ex, byLine) => {
      sheet(what.slice(0, 31), ORDER_HEAD, rows.map((l) => orderRow(l, ex, byLine)));
      return `Exported ${inr(rows.length)} ${plural(rows.length, 'line')}` + (filtered ? ' (the filters you have on were applied)' : '');
    });
  }
  /* Every article on the Shortages screen, and the order lines waiting for each. */
  function exportShortages() {
    const M = S.M, rows = shortRows();
    if (!rows.length) return tell('Export', 'There is nothing on the Shortages screen to export.');
    const codes = new Set(rows.map((r) => r.c));
    return excelFile(S.s.only ? 'Shortages' : 'Pending_By_Article', false, (sheet) => {
      sheet('Shortages', STOCK_HEAD, rows.map((r) => stockRow(r.c)));
      sheet('Orders waiting', ['MC Name', 'MRP', 'Article', 'Description', 'Site', 'Store Name', 'Order No', 'Book Date', 'Delivery Date', 'Allocate by', 'Price Wanted', 'Discount %', 'Qty Wanted', 'Approved', 'Pending Qty', 'Booked By', 'Contact Number'],
        M.lines.filter((l) => l.balance > 0 && codes.has(l.article_code)).sort((a, b) => a.article_code.localeCompare(b.article_code) || (a.order_date || '').localeCompare(b.order_date || ''))
          .map((l) => [l.mc_name, +l.mrp, l.article_code, l.description, l.store_code, l.store_name, l.order_no, l.order_date, l.del_date || '', l.allocate_by || '', +l.req_price, r1(l.discount), l.req_qty, l.approved, l.balance, l.poc_name, l.phone]));
      return `Exported ${inr(rows.length)} ${plural(rows.length, 'article')}`;
    });
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
    nav: (el) => { S.view = el.dataset.view; S.o.sel = null; if (!S.wide) S.s.art = null; render(); window.scrollTo(0, 0); const m = $('main'); if (m) m.scrollTop = 0; },
    go: (el) => {
      S.view = el.dataset.view; S.o.sel = null;
      if (S.view === 'approved') { Object.assign(S.a, { seg: 'todo', q: el.dataset.q || '', flag: '', store: '', mc: '', buyer: '', limit: 300, collapsed: false }); S.a.toggled.clear(); }
      if (el.dataset.view === 'orders') { Object.assign(S.o, { status: el.dataset.status || '', flag: el.dataset.flag || '', q: el.dataset.q || '', buyer: el.dataset.buyer || '', store: '', mc: '', sel: null, limit: 300, collapsed: false }); S.o.toggled.clear(); }
      if (S.view === 'orders' && S.o.flag && !ordersFiltered('orders').length) {          // the flagged lines are all approved already: show them there
        const flag = S.o.flag;
        for (const k of Object.keys(SEGS)) { Object.assign(S.a, { seg: k, flag, q: '', store: '', mc: '', buyer: '' }); if (ordersFiltered('approved').length) { S.view = 'approved'; S.o.flag = ''; break; } }
        if (S.view !== 'approved') S.a.flag = '';
      }
      render();
    },
    lyPeriod: (el) => { S.ly.period = el.dataset.v; render(); },
    lyBasis: (el) => { S.ly.basis = el.dataset.v; render(); },
    lyUnit: (el) => { S.ly.unit = el.dataset.v; render(); },
    lyMc: (el) => { const k = el.dataset.mc; if (S.ly.all) { S.ly.all = false; S.ly.open = new Set(lyByMc(C.season(S.M, S.M.lyDaily), lyCut(C.season(S.M, S.M.lyDaily))).map((g) => g.key)); } if (S.ly.open.has(k)) S.ly.open.delete(k); else S.ly.open.add(k); render(); },
    lyAll: () => { S.ly.all = !S.ly.all; S.ly.open.clear(); render(); },
    lyFind: () => lyFind(),
    label: () => labelStart(),
    labelShow: (el) => labelShow(el.dataset.code),
    labelOpenArt: (el) => { if (labelPop) labelPop.close(); openArticle(el.dataset.code); },
    labelOrders: (el) => { if (labelPop) labelPop.close(); ACT.go({ dataset: { view: 'orders', q: el.dataset.code } }); },
    labelQuery: (el) => { if (labelPop) labelPop.close(); S.qy.form = Object.assign(QBLANK(), { art: el.dataset.code }); S.view = 'queries'; render(); const i = $('#qf-store'); if (i) i.focus(); },
    qSubmit: () => qSubmit(),
    stMore: () => { S.st.limit += 500; setHtml('stlist', stTableHtml()); },
    stToggle: (el) => { const k = el.dataset.key, t = S.st.toggled; if (t.has(k)) t.delete(k); else t.add(k); setHtml('stlist', stTableHtml()); },
    stCollapse: () => { S.st.collapsed = !S.st.collapsed; S.st.toggled.clear(); render(); },
    stClear: (el) => { S.st[el.dataset.key] = ''; S.st.limit = 300; render(); },
    stClearAll: () => { Object.assign(S.st, { q: '', status: '', store: '', state: '', mc: '', buyer: '', limit: 300 }); render(); },
    stTile: (el) => { S.st.status = S.st.status === el.dataset.k ? '' : el.dataset.k; S.st.limit = 300; render(); },
    stExport: () => exportSellThrough(),
    qExport: () => exportQueries(),
    qClear: () => { S.qy.form = QBLANK(); render(); const i = $('#qf-store'); if (i) i.focus(); },
    qDel: async (el) => {
      const r = (S.qy.list || []).find((x) => String(x.id) === el.dataset.id); if (!r) return;
      if (!(await confirmBox('Remove this query?', `${r.store_code} ${r.store_name || ''}\n${r.article_code} ${r.description || ''}\n${inr(r.qty)} pcs at Rs ${inr2(Number(r.price))}, logged by ${r.by_name} on ${when(r.created_at)}`, 'Remove', true))) return;
      await run(() => A.rpc('query_delete', { p_id: r.id }), 'Query removed'); await qLoad(true);
    },
    lyArt: (el, e) => { if (e) e.preventDefault(); const o = $('#modal').lastElementChild; if (o) o.remove(); S.view = 'lastyear'; S.ly.lq = el.dataset.code; render(); lyFind(); },
    lyExport: () => exportLastYear(),
    lySeason: async () => {
      const SE = C.season(S.M, S.M.lyDaily);
      const v = await ask('D-30 of each season', `<p class="small">The booking day counted as D-30 (30 days before Diwali) in each year. Every day after it is compared with the same D-day of the other year.</p>
        <label class="f">Last year<input type="date" name="ly" value="${SE.ly0}" required></label><label class="f">This year<input type="date" name="ty" value="${SE.ty0}" required></label>`, 'Save');
      if (!v) return;
      run(() => A.rpc('set_season', { p_ly: v.ly, p_ty: v.ty }), 'D-30 dates saved');
    },
    shortOpen: (el) => {
      S.view = 'shortages'; S.s.art = el.dataset.code; S.s.qty = {}; render();
      if (S.wide) { const r = document.querySelector(`tr[data-act=shortSel][data-code="${CSS.escape(el.dataset.code)}"]`); if (r) r.scrollIntoView({ block: 'start' }); }
    },
    sel: (el) => { S.o.sel = +el.dataset.id; S.o.detail = null; render(); packPreview(); },
    unsel: () => { S.o.sel = null; render(); },
    chk: (el) => { const id = +el.dataset.id, st = sec(); if (el.checked) st.checked.add(id); else st.checked.delete(id); },
    chkAll: (el) => { const st = sec(); $$('#olist input[data-act=chk]').forEach((i) => { i.checked = el.checked; const id = +i.dataset.id; if (el.checked) st.checked.add(id); else st.checked.delete(id); }); $$('#olist input[data-act=chkOrder], #olist input[data-act=chkGroup]').forEach((i) => { i.checked = el.checked; }); },
    chkOrder: (el) => { const st = sec(); $$('input[data-act=chk]', el.closest('.oblock')).forEach((i) => { i.checked = el.checked; const id = +i.dataset.id; if (el.checked) st.checked.add(id); else st.checked.delete(id); }); },
    chkGroup: (el) => { const st = sec(); $$('input[data-act=chk], input[data-act=chkOrder]', el.closest('.sgroup')).forEach((i) => { i.checked = el.checked; if (i.dataset.act !== 'chk') return; const id = +i.dataset.id; if (el.checked) st.checked.add(id); else st.checked.delete(id); }); },
    toggleGroup: (el) => { const st = sec(), k = el.dataset.key; if (st.toggled.has(k)) st.toggled.delete(k); else st.toggled.add(k); setHtml('olist', oListHtml()); hydrate(); },
    collapseAll: () => { const st = sec(); st.collapsed = !st.collapsed; st.toggled.clear(); st.limit = 300; render(); },
    seg: (el) => { S.a.seg = el.dataset.seg; S.a.checked.clear(); S.a.limit = 300; S.o.sel = null; render(); },
    clearFilter: (el) => { const st = sec(); st[el.dataset.key] = ''; st.limit = 300; render(); },
    clearFilters: () => { Object.assign(sec(), { q: '', status: '', flag: '', store: '', mc: '', buyer: '', limit: 300 }); render(); },
    exportView: () => exportLines(S.view),
    exportShort: () => exportShortages(),
    rowLocs: (el) => { const l = S.M.byId[+el.dataset.id], i = $(`.rowq[data-id="${el.dataset.id}"]`), pr = priceFrom(l, $(`.rowp[data-id="${el.dataset.id}"]`)); if (!pr.ok) return tell('Approve', pr.msg); approveWithLocs(l, i && i.value, pr.price); },
    apLocs: () => { const l = cur(), i = $('#ap-qty'), pr = priceFrom(l, $('#ap-price')); if (!pr.ok) return tell('Approve', pr.msg); approveWithLocs(l, i && i.value, pr.price); },
    allocLocs: async (el) => {
      const d = S.o.detail, x = d && d.allocations.find((a) => a.id === +el.dataset.alloc);
      if (!x) return;
      const v = await locDialog({ title: 'Change where this is taken from', article: x.article_code, qty: x.qty, pack: 1, maxQty: 0, current: x.locs || {}, okLabel: 'Save' });
      if (v) run(() => A.rpc('set_alloc_locs', { p_alloc: x.id, p_locs: v.locs }), `Now taken from ${C.locText(v.locs)}`);
    },
    rowApprove: async (el) => {
      const l = S.M.byId[+el.dataset.id], i = $(`.rowq[data-id="${el.dataset.id}"]`), q = Math.round(+(i && i.value) || 0), max = +(i && i.max) || 0;
      if (!l || !i) return;
      if (q <= 0) { i.focus(); return tell('Approve', 'Type the quantity to approve in the box first.'); }
      const f = C.roundPack(q, l.pack);
      if (f > max) return tell('Approve', `${inr(f)} pcs${f !== q ? ` (${inr(q)} rounded up to full packs of ${l.pack})` : ''} is more than the balance DC quantity allows: ${inr(max)} pcs.`);
      /* The approval is sent with exactly the locations the row shows, so what is recorded is what was on screen. */
      const pr = priceFrom(l, $(`.rowp[data-id="${el.dataset.id}"]`));
      if (!pr.ok) return tell('Approve', pr.msg);
      if (!(await overOk(l, f))) return;
      const sp = locsOn() ? C.autoSplit(S.M, l.article_code, f) : null;
      if (sp && sp.left > 0) return approveWithLocs(l, q, pr.price, true);     // part of it sits only in a location set aside: ask where to take it from
      run(() => A.rpc('allocate', Object.assign({ p_line: l.id, p_article: l.article_code, p_qty: q }, sp ? { p_locs: sp.use } : {}, pr.price != null ? { p_price: pr.price } : {})),
        `Approved ${inr(f)} pcs of ${l.article_code}` + (f !== q ? ` (${inr(q)} rounded up to full packs)` : '') + priceNote(l, pr.price) + (sp ? ` from ${C.locText(sp.use)}` : ''));
    },
    delLine: async (el) => {
      const l = S.M.byId[+el.dataset.id]; if (!l) return;
      if (S.M.schema < 4) return tell('Delete line', 'Deleting needs the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.');
      if (l.dispatched > 0) return tell('Delete line', 'Stock on this line is already dispatched, so it cannot be deleted.');
      const held = l.approved_open + l.offered;
      if (!(await confirmBox('Delete this order line?', `Store ${l.store_code} ${l.store_name}\nOrder ${l.order_no}\n${l.article_code}  ${l.description}\nQty wanted ${inr(l.req_qty)}\n\n` + (held ? `The ${inr(held)} pcs approved or offered on it go back to the balance DC quantity.\n` : '') +
        'The line is removed from every screen and stays out when the SAP export is uploaded again. You can bring it back from Data > Deleted order lines.', 'Delete line', true))) return;
      if (S.o.sel === l.id) S.o.sel = null;
      run(() => A.rpc('delete_lines', { p_lines: [l.id] }), 'Line deleted');
    },
    bulkDelete: async () => {
      const ids = Array.from(sec().checked).filter((id) => S.M.byId[id]);
      if (!ids.length) return tell('Delete ticked', 'Tick one or more order lines first.');
      if (S.M.schema < 4) return tell('Delete ticked', 'Deleting needs the newest database script. In Supabase open SQL Editor, paste the newest supabase-setup.sql and click Run. Your data stays as it is.');
      if (!(await confirmBox(`Delete ${ids.length} ticked ${plural(ids.length, 'line')}?`, 'Anything approved or offered on these lines goes back to the balance DC quantity. Lines with stock already dispatched are left alone.\n\nDeleted lines are removed from every screen and stay out when the SAP export is uploaded again. You can bring them back from Data > Deleted order lines.', 'Delete lines', true))) return;
      run(async () => { const r = await A.rpc('delete_lines', { p_lines: ids }); sec().checked.clear(); S.o.sel = null; return r; }, (r) => `Deleted ${r.done} ${plural(r.done, 'line')}` + (r.skipped ? `, ${r.skipped} left alone (dispatched)` : ''));
    },
    showDeleted: async () => {
      let rows;
      try { rows = await A.rpc('deleted_lines'); } catch (e) { return tell('Deleted order lines', e.message); }
      const ed = editor();
      const d = pop(`<h2>Deleted order lines</h2>${rows.length ? `<div class="tablewrap" style="max-height:60vh"><table><thead><tr><th>Store</th><th>Order</th><th>Article</th><th class="right">MRP</th><th class="right">Qty wanted</th><th>Deleted</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.store_code)} ${esc(r.store_name || '')}</td><td>${esc(r.order_no)}</td><td class="w"><b>${esc(r.article_code)}</b> ${esc(r.description || '')}</td><td class="right">${inr(r.mrp)}</td><td class="right">${inr(r.req_qty)}</td>
          <td>${when(r.deleted_at)}<div class="small">${esc(r.deleted_by || '')}</div></td>${ed ? `<td><button class="btn sm" data-restore="${r.id}">Bring back</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing is deleted.</p>'}
        <div class="actions"><button class="btn" data-act="closePop">Close</button></div>`, 'big');
      d.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-restore]'); if (!b) return;
        b.disabled = true;
        try { await A.rpc('restore_lines', { p_lines: [+b.dataset.restore] }); b.closest('tr').remove(); await reload(); toast('Line brought back as it was (pending, nothing approved)'); } catch (err) { await tell('Not done', err.message); }
      });
    },
    more: () => { sec().limit += 300; setHtml('olist', oListHtml()); hydrate(); },
    approve: async () => {
      const l = cur(), i = $('#ap-qty'), q = Math.round(+i.value || 0), f = C.roundPack(q, l.pack);
      if (q <= 0) return tell('Approve', 'Enter the quantity to approve.');
      if (f > (+i.max || 0)) return tell('Approve', `${inr(f)} pcs (${inr(q)} rounded up to full packs of ${l.pack}) is more than the balance DC quantity allows: ${inr(+i.max || 0)} pcs.`);
      const pr = priceFrom(l, $('#ap-price'));
      if (!pr.ok) return tell('Approve', pr.msg);
      if (!(await overOk(l, f))) return;
      const sp = locsOn() ? C.autoSplit(S.M, l.article_code, f) : null;
      if (sp && sp.left > 0) return approveWithLocs(l, q, pr.price, true);
      run(() => A.rpc('allocate', Object.assign({ p_line: l.id, p_article: l.article_code, p_qty: q }, sp ? { p_locs: sp.use } : {}, pr.price != null ? { p_price: pr.price } : {})),
        `Approved ${inr(f)} pcs` + (f !== q ? ` (${inr(q)} rounded up to full packs)` : '') + priceNote(l, pr.price) + (sp ? ` from ${C.locText(sp.use)}` : ''));
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
dispatch: async () => { if (await confirmBox('Mark dispatched by hand', 'Use this only if the stock on this line has left the DC and you do not want to wait for the next DC stock report.\n\nUntil a newer stock report is loaded, the quantity is still taken off the current one, exactly as now.', 'Mark dispatched')) run(() => A.rpc('dispatch_lines', { p_lines: [S.o.sel] }), 'Marked dispatched'); },
    closeBal: () => run(() => A.rpc('close_balance', { p_line: S.o.sel }), 'Pending quantity closed'),
    bulkDispatch: async () => {
      const L = Array.from(sec().checked).map((id) => S.M.byId[id]).filter((l) => l && l.approved_open > 0);
      if (!L.length) return tell('Mark dispatched', 'Tick one or more approved lines first ("Tick all shown" ticks every line listed).');
      const pcs = L.reduce((t, l) => t + l.approved_open, 0);
      if (!(await confirmBox(`Mark ${L.length} ${plural(L.length, 'line')} dispatched?`, L.slice(0, 12).map((l) => `${l.store_code}  ${l.order_no}  ${l.article_code}: ${inr(l.approved_open)} pcs`).join('\n') + (L.length > 12 ? `\n... and ${L.length - 12} more` : '') +
        `\n\n${inr(pcs)} pcs in all. The lines move to the Dispatched tab. Until a newer DC stock report is loaded, stock approved here stays taken off the DC balance (approvals from SAP never are). Undo is in each line's Details.`, 'Mark dispatched'))) return;
      run(async () => { const n = await A.rpc('dispatch_lines', { p_lines: L.map((l) => l.id) }); sec().checked.clear(); return n; }, (n) => `Marked dispatched: ${n} ${plural(n, 'line')}`);
    },
    bulkClose: async () => {
      const ids = Array.from(sec().checked).map((id) => S.M.byId[id]).filter(Boolean);
      const L = ids.filter((l) => l.status === 'PARTIAL');
      if (!ids.length) return tell('Close pending qty', 'Tick one or more order lines first. Tip: choose "Partly approved" in the status list, then "Tick all shown".');
      if (!L.length) return tell('Close pending qty', 'None of the ticked lines is partly approved. Only a line with some quantity approved can have its pending quantity closed.');
      const left = L.reduce((t, l) => t + l.balance, 0);
      if (!(await confirmBox(`Close the pending quantity on ${L.length} ${plural(L.length, 'line')}?`,
        L.slice(0, 12).map((l) => `${l.store_code}  ${l.order_no}  ${l.article_code}: gets ${inr(l.approved)} of ${inr(l.req_qty)} (${inr(l.balance)} closed)`).join('\n') + (L.length > 12 ? `\n... and ${L.length - 12} more` : '') +
        `\n\nEach store gets only what is approved. ${inr(left)} pcs in all are no longer pending.` + (ids.length > L.length ? `\n${ids.length - L.length} ticked ${plural(ids.length - L.length, 'line is', 'lines are')} not partly approved and ${ids.length - L.length === 1 ? 'is' : 'are'} left alone.` : '') +
        '\n\nYou can reopen any of them from Details.', 'Close pending qty'))) return;
      run(async () => { let n = 0; for (const l of L) { await A.rpc('close_balance', { p_line: l.id }); n++; } sec().checked.clear(); return n; }, (n) => `Pending quantity closed on ${n} ${plural(n, 'line')}`);
    },
    reopen: () => run(() => A.rpc('reopen_line', { p_line: S.o.sel }), 'Reopened'),
    sapAccept: () => run(() => A.rpc('sap_accept', { p_line: S.o.sel })),
    sapDismiss: () => run(() => A.rpc('sap_dismiss', { p_line: S.o.sel })),
    dupClear: () => run(() => A.rpc('dup_clear', { p_line: S.o.sel }), 'Mark removed'),
    reject: async (el) => {
      const l = cur(), reorder = !!el.dataset.reorder;
      const alts = C.allAlternates(S.M, l.article_code).filter((a) => C.freeOf(S.M, a.article_code) >= C.packOf(a));
      const held = l.approved_open + l.offered;
      const v = await ask('Reject order line', `<div class="stack">
        <p class="small">Order ${esc(ref(l))}: ${inr(l.req_qty)} pcs of ${esc(l.article_code)} ${esc(l.description)}</p>
        ${held ? `<p class="note warn">${inr(held)} pcs approved or offered on this line will be released.</p>` : ''}
        <label class="f">Reason<select name="reason">${reasonOptions(reorder ? 'Reorder in new article' : 'Stock out')}</select></label>
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
      const ids = Array.from(sec().checked);
      if (!ids.length) return tell('Approve in full', 'Tick one or more order lines first.');
      const items = ids.map((id) => S.M.byId[id]).filter((l) => l && !l.rejected && l.open_qty > 0).map((l) => ({ line: l.id, article: l.article_code, qty: l.open_qty }));
      if (!items.length) return tell('Approve in full', 'None of the ticked lines has a pending quantity.');
      S.busy = true;
      try {
        const res = await allocMany(items);
        sec().checked.clear();
        await reload();
        const bad = res.filter((r) => !r.ok);
        await tell('Approve in full', `Approved in full (rounded up to full packs): ${res.length - bad.length} ${plural(res.length - bad.length, 'line')}.` + (bad.length ? `\n\nNot approved (${bad.length}):\n` +
          bad.slice(0, 15).map((r) => { const l = S.M.byId[r.line] || {}; return `${ref(l)}  ${r.error}`; }).join('\n') + (bad.length > 15 ? `\n... and ${bad.length - 15} more` : '') : ''));
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    bulkReject: async () => {
      const ids = Array.from(sec().checked).filter((id) => { const l = S.M.byId[id]; return l && !l.rejected; });
      if (!ids.length) return tell('Reject ticked', 'Tick one or more order lines first.');
      const v = await ask(`Reject ${ids.length} ticked ${plural(ids.length, 'line')}`, `<div class="stack">
        <p class="small">Anything approved or offered on these lines is released. Lines that are already dispatched are left alone.</p>
        <label class="f">Reason<select name="reason">${reasonOptions('Stock out')}</select></label>
        <label class="f">Remark (optional)<input type="text" name="remark"></label></div>`, 'Reject lines', { danger: true, noFocus: true });
      if (!v) return;
      run(async () => { const r = await A.rpc('reject_lines', { p_lines: ids, p_reason: v.reason + (v.remark.trim() ? ' - ' + v.remark.trim() : '') }); sec().checked.clear(); return r; },
        (r) => `Rejected ${r.done} ${plural(r.done, 'line')}` + (r.skipped ? `, ${r.skipped} left alone (dispatched)` : ''));
    },
    shortSel: (el) => {
      const c = el.dataset.code;
      S.s.art = S.wide && S.s.art === c ? null : c; S.s.qty = {}; render();
      if (S.wide && S.s.art) { const r = document.querySelector(`tr[data-act=shortSel][data-code="${CSS.escape(c)}"]`); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    },
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
    inwardHand: (el) => inwardByHand(el.dataset.code || ''),
    inwardRemove: async (el) => {
      const x = S.M.inwardLoads.find((y) => String(y.batch) === el.dataset.batch); if (!x) return;
      if (!(await confirmBox('Remove these inwards?', `${x.file}\n${x.entries} ${plural(x.entries, 'entry', 'entries')}, ${inr(x.counted)} pcs now added to the DC stock\n\nThe DC stock goes down by that much again. Approvals are not touched; if more is then approved than the DC holds, the Dashboard says so.`, 'Remove', true))) return;
      run(() => A.rpc('inward_delete', { p_batch: x.batch }), 'Inwards removed');
    },
    locOrder: async () => {
      const M = S.M, posOf = (k) => M.locOrder.indexOf(k);
      const v = await ask('Which DC location is used first', `<div class="stack">
        <p class="small">When you approve without choosing a location, the stock is taken from number 1 first, then 2, and so on. A location marked "only when I choose it" is never used by itself - for example stock kept back for another purpose.</p>
        <div class="locgrid two">${C.LOCATIONS.map(([k, t]) => `<span>${t}</span><select name="pos_${k}" aria-label="Position of ${t}">${C.LOCATIONS.map((_, i) => `<option value="${i + 1}" ${posOf(k) === i ? 'selected' : ''}>${i + 1}${i === 0 ? ' - used first' : ''}</option>`).join('')}<option value="x" ${posOf(k) < 0 ? 'selected' : ''}>Only when I choose it</option></select>`).join('')}</div>
        <p class="small">This changes approvals from now on. Approvals already made keep their locations.</p></div>`, 'Save', { noFocus: true });
      if (!v) return;
      const order = C.LOCATIONS.map(([k], i) => [k, v['pos_' + k] === 'x' ? null : +v['pos_' + k], i]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
      if (!order.length) return tell('Not saved', 'Keep at least one location that is used automatically.');
      run(() => A.rpc('set_loc_order', { p_order: order.join(',') }), 'Order of locations saved');
    },
    template: (el) => downloadTemplate(el.dataset.kind),
    pick: (el) => { pending = { kind: el.dataset.kind }; const i = $('#file-in'); i.accept = '.xlsx,.xlsm,.xlsb,.xls,.csv,.txt,.htm,.html,.mht,.mhtml'; i.value = ''; i.click(); },
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
    const inner = e.target.closest('input, button, a, select, label');                       // a control inside a row or a store heading handles itself
    if (inner && inner !== el && el.contains(inner) && !inner.dataset.act) return;
    if (['chk', 'chkAll', 'chkOrder'].includes(el.dataset.act)) { ACT[el.dataset.act](el); return; }
    const fn = ACT[el.dataset.act];
    if (fn) fn(el, e);
  });
  const relist = () => { sec().limit = 300; setHtml('olist', oListHtml()); hydrate(); };
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'oq') { sec().q = t.value; relist(); }
    else if (t.id === 'cq') { S.c.q = t.value; setHtml('cgrid', cGridHtml()); hydrate(); searchAll(); }
    else if (t.id === 'sq') { S.s.q = t.value; const a = document.activeElement, pos = t.selectionStart; render(); const n = $('#sq'); if (a === t && n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* type=search */ } } }
    else if (t.classList.contains('sq')) { const v = Math.max(0, Math.round(+t.value || 0)); if (v) S.s.qty[t.dataset.id] = v; else delete S.s.qty[t.dataset.id]; tally(); }
    else if (t.id === 'ap-qty' || t.classList.contains('altq')) packPreview();
    else if (t.classList.contains('rowq')) rowPreview(t);
    else if (t.classList.contains('rowp') || t.id === 'ap-price') { const changed = t.value !== '' && Math.abs(+t.value - +t.dataset.asked) > 0.004; t.classList.toggle('changed', changed); t.title = changed ? `Changed from the price the store asked (Rs ${t.dataset.asked})` : `Price per piece to approve (the store asked Rs ${t.dataset.asked})`; }
    else if (t.id === 'lymq' || t.id === 'lysq') { S.ly[t.id === 'lymq' ? 'q' : 'sq'] = t.value; const pos = t.selectionStart, id = t.id; render(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* type=search */ } } }
    else if (t.id === 'lylq') S.ly.lq = t.value;
    else if (t.id === 'stq') { S.st.q = t.value; S.st.limit = 300; setHtml('stlist', stTableHtml()); setHtml('stchips', stChips()); }
    else if (/^qf-/.test(t.id)) qTyped(t);
    else if (t.id === 'qq') { S.qy.q = t.value; setHtml('qlist', qListHtml()); }
    else if (t.id === 'dl-disc') dealCalc('disc');
    else if (t.id === 'dl-price') dealCalc('price');
    else if (t.id === 'dl-qty' || t.id === 'dl-store') dealCalc();
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'ostatus') { S.o.status = t.value; relist(); }
    else if (t.id === 'oflag') { sec().flag = t.value; relist(); }
    else if (t.id === 'ostore') { sec().store = t.value; relist(); }
    else if (t.id === 'omc') { sec().mc = t.value; relist(); }
    else if (t.id === 'obuyer') { sec().buyer = t.value; relist(); }
    else if (t.id === 'osort') { const st = sec(); st.sort = t.value; st.limit = 300; render(); }
    else if (t.id === 'ogroup') { const st = sec(); st.group = t.value; st.collapsed = false; st.toggled.clear(); st.limit = 300; render(); }
    else if (t.id === 'ccat') { S.c.cat = t.value; setHtml('cgrid', cGridHtml()); hydrate(); }
    else if (t.id === 'cscope') { S.c.scope = t.value; S.c.cat = ''; render(); }
    else if (t.id === 'sonly') { S.s.only = t.checked; render(); }
    else if (t.id === 'lysonly') { S.ly.sonly = t.checked; render(); }
    else if (['stgroup', 'stsort', 'ststatus', 'ststore', 'ststate', 'stmc', 'stbuyer'].includes(t.id)) { S.st[t.id.slice(2)] = t.value; S.st.limit = 300; if (t.id === 'stgroup') { S.st.collapsed = false; S.st.toggled.clear(); } render(); }
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
    else if (t.id === 'label-in' && t.files[0]) checkLabel(t.files[0], 'pick');
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'lbl-type') { e.preventDefault(); const c = C.code(e.target.code.value); if (c) labelShow(c); return; }
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
    if (e.key === 'Enter' && /^qf-(qty|rem|price|disc)$/.test(e.target.id || '')) { e.preventDefault(); qSubmit(); }
    if (e.key === 'Enter' && e.target.id === 'lylq') { e.preventDefault(); S.ly.lq = e.target.value; lyFind(); }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('rowq')) { e.preventDefault(); ACT.rowApprove(e.target); }
    if (e.key === 'Escape') {
      const o = $('#modal').lastElementChild, c = o && $('[data-cancel],[data-done],[data-act=closePop]', o);
      if (c) c.click(); else if (!o && LISTS.includes(S.view) && S.o.sel) ACT.unsel();
    }
  });
  /* on a laptop: paste a copied picture (for example from WhatsApp Web), or drop an image file on the app */
  const imgOf = (items) => Array.from(items || []).map((x) => (x.getAsFile ? (x.kind === 'file' ? x.getAsFile() : null) : x)).find((f) => f && /^image\//.test(f.type));
  document.addEventListener('paste', (e) => {
    if (!S.M || $('#modal').children.length) return;
    const el = document.activeElement; if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    const f = imgOf(e.clipboardData && e.clipboardData.items); if (f) { e.preventDefault(); checkLabel(f, 'paste'); }
  });
  document.addEventListener('dragover', (e) => { if (S.M && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!S.M || !e.dataTransfer) return;
    const f = imgOf(e.dataTransfer.files); if (f) { e.preventDefault(); checkLabel(f, 'drop'); }
  });
  wideMQ.addEventListener('change', (e) => { S.wide = e.matches; if (S.M) render(); });
  window.addEventListener('error', (e) => { if (S.M && e.message) toast('Something went wrong: ' + e.message); });

  window.AllocDesk = { S, reload, boot, importFile };  // handy for support and for the automated checks
  boot();
})();
