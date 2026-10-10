/* Allocation Desk - screens. One file, no framework: each view is a function that returns HTML,
   clicks are routed through data-act attributes, and every change goes to the database
   functions (which enforce the rules) followed by a fresh read. */
(function () {
  'use strict';
  const C = window.Core, A = window.Api, esc = C.esc, inr = C.inr, rupees = C.rupees, when = C.when;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const app = $('#app');
  const wideMQ = window.matchMedia('(min-width: 960px)');
  const S = {
    me: null, M: null, view: 'dashboard', wide: wideMQ.matches, lastSync: null, online: true, stale: false, busy: false,
    o: { q: '', status: '', store: '', mc: '', sel: null, checked: new Set(), limit: 300, detail: null, sort: null, dir: 1 },
    s: { only: true, q: '', art: null, qty: {} },
    c: { q: '', group: '' }
  };
  const editor = () => !!(S.me && S.me.role === 'editor');
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const ICON = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    shortages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17.2v.3"/></svg>',
    catalogue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-4 3 2 4-4 4 4"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>'
  };
  const NAV = [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['shortages', 'Shortages'], ['catalogue', 'Catalogue'], ['data', 'Data']];

  /* ================= small building blocks ================= */
  const pill = (st, text) => `<span class="pill ${st}">${esc(text || C.STATUS_LABEL[st] || st)}</span>`;
  const stat = (title, value, tone) => `<div class="stat"><b class="${tone || ''}">${value}</b><span>${title}</span></div>`;
  function thumb(code, size, click) {
    const a = S.M.articles[code], url = a && A.cachedUrl(a);
    const inner = a && a.image_path ? `<img data-code="${esc(code)}" alt="" ${url ? `src="${esc(url)}"` : ''}>` : 'No image';
    return `<div class="thumb ${size}${click ? ' click' : ''}"${click ? ` data-act="art" data-code="${esc(code)}" title="Open article"` : ''}>${inner}</div>`;
  }
  async function hydrate() {                         // give every picture on screen its link
    const imgs = $$('img[data-code]').filter((i) => !i.getAttribute('src'));
    if (!imgs.length || !S.M) return;
    const arts = Array.from(new Set(imgs.map((i) => i.dataset.code))).map((c) => S.M.articles[c]).filter((a) => a && a.image_path);
    try { await A.imageUrls(arts); } catch (e) { return; }
    $$('img[data-code]').forEach((i) => {
      if (i.getAttribute('src')) return;
      const a = S.M.articles[i.dataset.code], u = a && A.cachedUrl(a);
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

  /* ================= sign-in screens ================= */
  const LOGO = '<img class="logo" src="icons/icon-192.png" alt="">';
  function authPage(inner) { app.innerHTML = `<div class="center"><div class="auth"><div class="card stack">${inner}</div></div></div>`; }
  function screenConfig() {
    authPage(`${LOGO}<h1>Allocation Desk</h1><p class="muted">This copy is not connected to a database yet.</p>
      <p>Open <b>config.js</b> and paste your Supabase Project URL and publishable key between the quotes. The setup guide has the steps.</p>`);
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
    if (!A.ready) return screenConfig();
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
      if (/sign-in has expired|sign in/i.test(e.message)) { await A.sb.auth.signOut().catch(() => {}); return screenLogin(e.message); }
      authPage(`${LOGO}<h1>Allocation Desk</h1><p class="note bad">${esc(e.message)}</p><button class="btn" data-act="retry">Try again</button>`);
    }
  }

  /* ================= data in / refresh ================= */
  async function reload() {
    const snap = await A.rpc('snapshot');
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
        <input type="search" id="find" placeholder="Find article ..." aria-label="Find article">
        ${NAV.map(([k, t]) => `<button class="nav ${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${ICON[k]}${t}</button>`).join('')}
        <div class="foot">${M.meta.stock_asof ? 'Stock as of ' + when(M.meta.stock_asof) : 'No stock report loaded'}<br>${inr(M.lines.length)} order lines<br>
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
    if (S.view === 'shortages') tally();
  }
  const setHtml = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };

  /* ================= Dashboard ================= */
  function vDashboard() {
    const M = S.M, lines = M.lines;
    const sub = M.meta.stock_asof ? `Stock report as of ${when(M.meta.stock_asof)} (${esc(M.meta.stock_file || '')})` : 'No stock report loaded yet';
    if (!lines.length && !Object.keys(M.articles).length) {
      return `<div class="head"><h1>Dashboard</h1></div><div class="card stack"><h2>Nothing loaded yet</h2>
        <p class="muted">${editor() ? 'Go to Data and load the test data, or upload your article master, stock report and orders.' : 'The editor has not loaded any data yet. This screen fills in by itself once they do.'}</p>
        ${editor() ? '<div><button class="btn primary" data-act="nav" data-view="data">Open Data</button></div>' : ''}</div>`;
    }
    const by = {}; C.STATUS_ORDER.forEach((s) => { by[s] = lines.filter((l) => l.status === s); });
    const live = lines.filter((l) => l.status !== 'REJECTED');
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const req = sum(live, (l) => l.req_qty), appr = sum(live, (l) => l.approved);
    const vReq = sum(live, (l) => l.req_qty * (l.req_price || 0)), vApp = sum(live, (l) => l.approved * (l.req_price || 0));
    const tile = (cls, t, v, s) => `<div class="tile ${cls}"><h3>${t}</h3><b>${v}</b><span>${s}</span></div>`;
    const tiles = [
      tile('lilac', 'Order lines', inr(lines.length), `${new Set(lines.map((l) => l.order_no)).size} orders, ${new Set(lines.map((l) => l.store_code)).size} stores`),
      tile('peach', 'Pending', inr(by.PENDING.length), `${inr(sum(by.PENDING, (l) => l.balance))} pcs waiting`),
      tile('butter', 'Awaiting store', inr(by.AWAITING.length), `${inr(sum(lines, (l) => l.offered))} pcs of alternates held`),
      tile('mint', 'Approved', inr(by.APPROVED.length + by.PARTIAL.length), `${by.PARTIAL.length} partly approved`),
      tile('sky', 'Dispatched', inr(by.DISPATCHED.length), `${inr(sum(lines, (l) => l.dispatched))} pcs sent`),
      tile('pink', 'Qty approved', (req ? Math.round(appr / req * 100) : 0) + '%', `${inr(appr)} of ${inr(req)} pcs`),
      tile('lilac', 'Value approved', rupees(vApp), `of ${rupees(vReq)} ordered`)].join('');
    const items = [];
    const go = (label, status, view) => `<button class="btn sm" data-act="go" data-view="${view || 'orders'}" data-status="${status || ''}">${label}</button>`;
    const sap = lines.filter((l) => l.sap_new_qty != null);
    if (sap.length) items.push(['warn', `${sap.length} line(s): quantity changed in SAP after import`, go('Review', 'SAP')]);
    if (by.AWAITING.length) {
      const hrs = M.oldestOffer ? (Date.now() - new Date(M.oldestOffer)) / 3600e3 : 0;
      items.push(['warn', `${by.AWAITING.length} line(s) awaiting store reply on alternates (${hrs >= 1 ? 'oldest asked ' + Math.round(hrs) + ' h ago' : 'asked within the last hour'})`, go('Open', 'AWAITING')]);
    }
    const short = Object.entries(M.pos).filter(([, p]) => p.pending > Math.max(p.free, 0));
    if (short.length) items.push(['bad', `${short.length} article(s) where stores want more than the DC has free`, go(editor() ? 'Split stock' : 'Open', '', 'shortages')]);
    Object.entries(M.pos).filter(([, p]) => p.free < 0).slice(0, 4).forEach(([c, p]) =>
      items.push(['bad', `Over-committed: ${esc(c)} ${esc((M.articles[c] || {}).description || '')} - ${inr(p.reserved)} promised, ${inr(p.dc)} at DC in the latest report`,
        `<button class="btn sm" data-act="go" data-view="orders" data-q="${esc(c)}">Open</button>`]));
    const ready = lines.filter((l) => l.approved_open > 0);
    if (ready.length) items.push(['good', `${ready.length} line(s) approved and waiting for dispatch (${inr(sum(ready, (l) => l.approved_open))} pcs)`, go('Open', 'APPROVED')]);
    if (by.PENDING.length) items.push(['', `${by.PENDING.length} line(s) not looked at yet`, go('Open', 'PENDING')]);
    if (M.meta.stock_asof) {
      const age = (Date.now() - new Date(M.meta.stock_asof)) / 3600e3;
      if (age > 12) items.push(['warn', `Stock report is ${Math.round(age)} hours old`, editor() ? go('Upload new', '', 'data') : '']);
    }
    const parts = [['Approved, at DC', sum(live, (l) => l.approved_open), '#7FDDB5'], ['Dispatched', sum(live, (l) => l.dispatched), '#8EC5FF'],
      ['Offered as alternate', sum(live, (l) => l.offered), '#FFC98A'], ['Balance still open', sum(live, (l) => l.balance), '#C9C2EA'],
      ['Balance closed', sum(live.filter((l) => l.balance_closed), (l) => l.open_qty), '#FF9DBB']];
    short.sort((a, b) => (b[1].pending - Math.max(b[1].free, 0)) - (a[1].pending - Math.max(a[1].free, 0)));
    const shortRows = short.slice(0, 8).map(([c, p]) => {
      const gap = p.pending - Math.max(p.free, 0);
      const alt = C.alternates(M, c).reduce((t, a) => t + Math.max(0, C.freeOf(M, a.article_code)), 0);
      return `<tr class="pick" data-act="shortOpen" data-code="${esc(c)}"><td>${esc(c)}</td><td class="w">${esc((M.articles[c] || {}).description || '')}</td>
        <td class="right">${inr(Math.max(p.free, 0))}</td><td class="right">${p.n_stores}</td><td class="right">${inr(p.pending)}</td>
        <td class="right bad b">${inr(gap)}</td><td class="right">${inr(alt)}</td><td class="right">${alt >= gap ? 'Yes' : alt ? 'Partly' : 'No'}</td></tr>`;
    }).join('');
    return `<div class="head"><h1>Dashboard</h1><span class="sub">${sub}</span></div>
      <div class="tiles">${tiles}</div>
      <div class="grid2">
        <div class="card stack"><h2>Needs attention</h2>
          ${items.length ? items.map(([tone, text, btn]) => `<div class="attn"><div class="note ${tone}">${text}</div>${btn}</div>`).join('') : '<div class="note good">Nothing needs attention.</div>'}</div>
        <div class="card stack"><h2>Where the ordered quantity stands</h2><div class="bars">
          ${parts.map(([n, q, col]) => `<span>${n}</span><div class="bar"><i style="width:${req ? Math.min(100, q / req * 100) : 0}%;background:${col}"></i></div><b class="right">${inr(q)}</b><span class="small right">${req ? Math.round(q / req * 100) : 0}%</span>`).join('')}
        </div></div>
      </div>
      <div class="card stack" style="margin-top:12px"><div class="row"><h2 class="grow">Biggest shortages</h2><button class="btn sm" data-act="nav" data-view="shortages">Open Shortages</button></div>
        ${short.length ? `<div class="tablewrap"><table><thead><tr><th>Article</th><th>Description</th><th class="right">DC free</th><th class="right">Stores waiting</th>
          <th class="right">Pending demand</th><th class="right">Short by</th><th class="right">Free in alternates</th><th class="right">Covered by alternates?</th></tr></thead><tbody>${shortRows}</tbody></table></div>`
        : '<div class="note good">No article is short right now.</div>'}</div>`;
  }

  /* ================= Orders ================= */
  const NEEDS = ['PENDING', 'AWAITING', 'PARTIAL'];
  function ordersFiltered() {
    const o = S.o, words = o.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let rows = S.M.lines.filter((l) => {
      if (o.status === 'NEEDS' && !NEEDS.includes(l.status)) return false;
      if (o.status === 'SAP' && l.sap_new_qty == null) return false;
      if (o.status && o.status !== 'NEEDS' && o.status !== 'SAP' && l.status !== o.status) return false;
      if (o.store && l.store_code !== o.store) return false;
      if (o.mc && l.mc_name !== o.mc) return false;
      if (words.length) {
        const hay = [l.order_no, l.store_code, l.store_name, l.city, l.article_code, l.description, l.customer, l.mc_name, l.group_name].join(' ').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (o.sort) {
      const free = (l) => C.freeOf(S.M, l.article_code);
      const key = { order: (l) => l.order_no + '/' + String(l.line_no).padStart(8, '0'), store: (l) => l.store_code, article: (l) => l.article_code,
        desc: (l) => l.description.toLowerCase(), req: (l) => l.req_qty, appr: (l) => l.approved, bal: (l) => l.balance, free,
        status: (l) => C.STATUS_ORDER.indexOf(l.status), mc: (l) => l.mc_name, mrp: (l) => +l.mrp, price: (l) => +l.req_price, date: (l) => l.order_date }[o.sort];
      rows = rows.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * o.dir; });
    }
    return rows;
  }
  function noteOf(l) {
    if (l.sap_new_qty != null) return `<span class="warn">SAP qty now ${inr(l.sap_new_qty)}</span>`;
    if (l.status === 'REJECTED') return esc(l.reject_reason || '');
    if (l.offered) return `${inr(l.offered)} pcs of alternate offered`;
    if (l.balance_closed && l.open_qty) return `Balance ${inr(l.open_qty)} closed`;
    return '';
  }
  function oListHtml() {
    const rows = ordersFiltered(), M = S.M, o = S.o, shown = rows.slice(0, o.limit), ed = editor();
    const sum = (f) => rows.reduce((t, l) => t + f(l), 0);
    setTimeout(() => setHtml('osum', `${rows.length} of ${M.lines.length} lines &nbsp;|&nbsp; ${inr(sum((l) => l.req_qty))} pcs required &nbsp;|&nbsp; ${inr(sum((l) => l.approved))} approved &nbsp;|&nbsp; ${inr(sum((l) => l.balance))} balance`), 0);
    if (!rows.length) return `<div class="empty card">${M.lines.length ? 'No order lines match these filters.' : 'No orders loaded yet.'}</div>`;
    const more = rows.length > shown.length ? `<button class="btn more" data-act="more">Show more (${rows.length - shown.length} hidden)</button>` : '';
    const dash = (n) => (n ? inr(n) : '-');
    if (S.wide) {
      const th = (k, t, r) => `<th class="${r ? 'right' : ''}" data-act="sort" data-key="${k}" style="cursor:pointer">${t}${o.sort === k ? (o.dir > 0 ? ' &#9650;' : ' &#9660;') : ''}</th>`;
      return `<div class="tablewrap" data-keep="otable"><table class="otable"><thead><tr>${ed ? '<th><input type="checkbox" data-act="chkAll" aria-label="Select all"></th>' : ''}
        ${th('order', 'Order / line')}${th('desc', 'Article')}${th('req', 'Required', 1)}${th('appr', 'Approved', 1)}
        ${th('bal', 'Balance', 1)}${th('free', 'DC free', 1)}${th('status', 'Status')}${th('mrp', 'MRP', 1)}${th('price', 'Price wanted', 1)}<th>Note</th></tr></thead><tbody>
        ${shown.map((l) => {
          const free = C.freeOf(M, l.article_code), short = l.balance > 0 && free < l.balance;
          return `<tr class="pick ${o.sel === l.id ? 'sel' : ''}" data-act="sel" data-id="${l.id}">
            ${ed ? `<td><input type="checkbox" data-act="chk" data-id="${l.id}" ${o.checked.has(l.id) ? 'checked' : ''} aria-label="Select line"></td>` : ''}
            <td title="${esc(l.store_name + ', ' + l.city)}"><b>${esc(l.order_no)} / ${esc(l.line_no)}</b><div class="small">${esc(l.store_code)} &middot; ${when(l.order_date)}</div></td>
            <td class="art" title="${esc(l.description)}"><div class="clip">${esc(l.description)}</div><div class="small clip">${esc(l.article_code)} &middot; ${esc(l.mc_name)}</div></td>
            <td class="right b">${inr(l.req_qty)}</td><td class="right ${l.approved ? 'good b' : 'muted'}">${dash(l.approved)}</td>
            <td class="right">${dash(l.balance)}</td><td class="right ${short ? 'bad b' : ''}">${inr(free)}</td><td>${pill(l.status)}</td>
            <td class="right">${inr(l.mrp)}</td><td class="right">${inr(l.req_price)}</td><td class="muted">${noteOf(l)}</td></tr>`;
        }).join('')}</tbody></table>${more}</div>`;
    }
    return shown.map((l) => {
      const free = C.freeOf(M, l.article_code), short = l.balance > 0 && free < l.balance, note = noteOf(l);
      return `<div class="ocard ${o.sel === l.id ? 'sel' : ''}" data-act="sel" data-id="${l.id}">${thumb(l.article_code, 's')}
        <div class="grow"><div class="row"><b class="grow">${esc(l.order_no)} / ${esc(l.line_no)}</b>${pill(l.status)}</div>
        <div>${esc(l.description)} <span class="muted">${esc(l.article_code)}</span></div>
        <div class="small">${esc(l.store_code)} ${esc(l.store_name)} &middot; ${when(l.order_date)}</div>
        <div class="nums"><span>Req <b>${inr(l.req_qty)}</b></span><span>Appr <b class="${l.approved ? 'good' : ''}">${dash(l.approved)}</b></span>
          <span>Bal <b>${dash(l.balance)}</b></span><span>DC free <b class="${short ? 'bad' : ''}">${inr(free)}</b></span></div>
        ${note ? `<div class="small">${note}</div>` : ''}</div></div>`;
    }).join('') + more;
  }
  function vOrders() {
    const o = S.o, M = S.M;
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`;
    const stores = Array.from(new Set(M.lines.map((l) => l.store_code))).sort();
    const mcs = Array.from(new Set(M.lines.map((l) => l.mc_name).filter(Boolean))).sort();
    const bulk = editor() && S.wide ? `<span class="grow"></span><button class="btn sm" data-act="bulkApprove" title="Approves the full balance of every ticked line where the DC has enough free stock">Approve ticked in full</button>
      <button class="btn sm" data-act="bulkDispatch">Mark ticked dispatched</button>` : '';
    const detail = `<div id="odetail" class="detail ${!S.wide && o.sel ? 'sheetpage' : ''}" data-keep="odetail" ${!S.wide && !o.sel ? 'hidden' : ''}>${oDetailHtml()}</div>`;
    return `<div class="head"><h1>Orders</h1><span class="sub" id="osum"></span>${bulk}</div>
      <div class="toolbar">
        <input type="search" id="oq" class="wide" placeholder="Search order, store, article, customer ..." value="${esc(o.q)}" aria-label="Search orders">
        <select id="ostatus" aria-label="Status">${opt('', 'All statuses', o.status)}${opt('NEEDS', 'Needs action', o.status)}${C.STATUS_ORDER.map((s) => opt(s, C.STATUS_LABEL[s], o.status)).join('')}${opt('SAP', 'SAP quantity changed', o.status)}</select>
        <select id="ostore" aria-label="Store">${opt('', 'All stores', o.store)}${stores.map((s) => opt(s, s + '  ' + ((M.stores[s] || {}).store_name || ''), o.store)).join('')}</select>
        <select id="omc" class="${S.wide ? '' : 'wide'}" aria-label="MC">${opt('', 'All MCs', o.mc)}${mcs.map((m) => opt(m, m, o.mc)).join('')}</select>
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
      if (el) { const y = el.scrollTop; el.innerHTML = oDetailHtml(); el.scrollTop = y; hydrate(); }
    } catch (e) { /* the panel keeps its loading note; the next refresh retries */ }
  }
  function oDetailHtml() {
    const M = S.M, l = S.o.sel && M.byId[S.o.sel], ed = editor();
    if (!l) return `<div class="card stack"><h2>Select an order line</h2><p class="muted">Stock, alternates${ed ? ' and the approval box' : ''} for the selected line appear here.</p></div>`;
    const d = S.o.detail && S.o.detail.id === l.id ? S.o.detail : null;
    const p = M.pos[l.article_code] || { dc: 0, reserved: 0, free: 0, pending: 0, n_stores: 0 };
    const free = p.free, atStore = d ? (d.store_stock[l.article_code] || 0) : null;
    const disc = l.mrp && l.req_price ? ` (${Math.round((1 - l.req_price / l.mrp) * 100)}% below MRP)` : '';
    const out = [];
    out.push(`<div class="back"><button class="btn" data-act="unsel">&#8249; Orders</button></div>`);
    out.push(`<div class="card stack">
      <div class="row"><h2 class="grow">Order ${esc(l.order_no)} / line ${esc(l.line_no)}</h2>${pill(l.status)}</div>
      <div class="small">${esc(l.store_code)} ${esc(l.store_name)}${l.city ? ', ' + esc(l.city) : ''}${l.customer ? ' &nbsp;|&nbsp; ' + esc(l.customer) : ''} &nbsp;|&nbsp; ${when(l.order_date)}</div>
      <div class="row top">${thumb(l.article_code, 'l', true)}<div class="grow"><h2>${esc(l.description || '(not in article master)')}</h2>
        <div class="small">${esc(l.article_code)} &nbsp;|&nbsp; ${esc(l.mc_name || '-')}</div><div class="small">Group: ${esc(l.group_name || 'none')}</div>
        <div>MRP ${rupees(l.mrp)} &nbsp;|&nbsp; Price wanted ${rupees(l.req_price)}${disc}</div></div></div>
      <div class="stats">${stat('Required', inr(l.req_qty))}${stat('Approved', inr(l.approved), l.approved ? 'good' : '')}${stat('Offered', inr(l.offered), l.offered ? 'warn' : '')}${stat('Balance', inr(l.balance), l.balance ? 'bad' : '')}</div></div>`);
    if (l.sap_new_qty != null) {
      out.push(`<div class="card stack"><div class="note warn">SAP now shows ${inr(l.sap_new_qty)} pcs for this line; the tracker has ${inr(l.req_qty)}. Nothing was changed automatically.</div>
        ${ed ? `<div class="row"><button class="btn primary" data-act="sapAccept">Use ${inr(l.sap_new_qty)}</button><button class="btn" data-act="sapDismiss">Keep ${inr(l.req_qty)}</button></div>` : ''}</div>`);
    }
    const others = p.pending - l.balance;
    let shortNote = '';
    if (l.balance > 0 && p.pending > Math.max(free, 0)) {
      shortNote = `<div class="note bad">Short: ${p.n_stores} store${p.n_stores !== 1 ? 's are' : ' is'} waiting for ${inr(p.pending)} pcs of this article and only ${inr(Math.max(free, 0))} are free${others > 0 ? ` (${inr(others)} pcs asked by other stores)` : ''}.</div>`;
    } else if (l.balance > 0 && others > 0) {
      shortNote = `<div class="note good">${inr(others)} pcs more are waiting on other stores' orders; free stock covers all of it.</div>`;
    }
    const canAct = ed && l.status !== 'REJECTED' && l.open_qty > 0;
    const top = Math.max(0, Math.min(l.open_qty, free));
    out.push(`<div class="card stack"><h3>Stock of the ordered article</h3>
      <div class="stats">${stat('At DC', inr(p.dc))}${stat('Promised', inr(p.reserved))}${stat('Free now', inr(free), free > 0 ? 'good' : 'bad')}${stat('At this store', atStore == null ? '...' : inr(atStore))}</div>
      ${shortNote}
      ${canAct ? `<div class="row"><span>Approve qty</span><input class="qty" id="ap-qty" type="number" inputmode="numeric" min="0" max="${top}" value="${top}" ${top ? '' : 'disabled'} aria-label="Quantity to approve">
        <button class="btn primary" data-act="approve" ${top ? '' : 'disabled'}>Approve</button></div>
        <div class="small">${top ? `of ${inr(l.open_qty)} open` : 'No free stock - use an alternate below'}</div>` : ''}</div>`);
    const alts = C.alternates(M, l.article_code);
    if (alts.length) {
      const totalAlt = alts.reduce((t, a) => t + Math.max(0, C.freeOf(M, a.article_code)), 0);
      out.push(`<div class="card stack"><div class="row"><h3 class="grow">Alternates in this group</h3><span class="small">${inr(totalAlt)} pcs free across ${alts.length}</span></div>
        <div class="alt"><span></span><span class="h">Article</span><span class="h right">DC free</span><span class="h right">At store</span><span class="h right">${canAct ? 'Qty' : ''}</span>
        ${alts.map((a) => {
          const af = C.freeOf(M, a.article_code), max = Math.max(0, Math.min(af, l.open_qty));
          return `${thumb(a.article_code, 's', true)}<div><b>${esc(a.article_code)}</b><br>${esc(a.description)}</div>
            <b class="right ${af > 0 ? 'good' : 'bad'}">${inr(af)}</b><span class="right muted">${d ? inr(d.store_stock[a.article_code] || 0) : '...'}</span>
            ${canAct ? `<input class="qty altq" style="width:78px" type="number" inputmode="numeric" min="0" max="${max}" value="" placeholder="0" data-art="${esc(a.article_code)}" ${max ? '' : 'disabled'} aria-label="Quantity of ${esc(a.article_code)}">` : '<span></span>'}`;
        }).join('')}</div>
        ${canAct ? `<div class="row wrap" style="justify-content:flex-end"><button class="btn" data-act="approveAlts" title="Use when the store has already agreed to the alternate">Approve alternates</button>
          <button class="btn primary" data-act="offer" title="Holds the quantities and prepares the message to the store">Offer to store and hold stock</button></div>` : ''}</div>`);
    }
    const allocs = d ? d.allocations.filter((a) => a.state !== 'CANCELLED') : null;
    const acts = [];
    if (ed) {
      if (l.approved_open > 0) acts.push('<button class="btn" data-act="dispatch" title="Use when the DC has sent the stock, so it is not deducted again after the next stock report">Mark dispatched</button>');
      if (l.status === 'PARTIAL') acts.push('<button class="btn" data-act="closeBal" title="The remaining quantity will not be supplied">Close balance</button>');
      if (l.status === 'REJECTED') acts.push('<button class="btn" data-act="reopen">Reopen</button>');
      else if (l.dispatched === 0) acts.push('<button class="btn danger" data-act="reject">Reject line ...</button>');
      if (l.balance_closed) acts.push('<button class="btn" data-act="reopen">Reopen balance</button>');
    }
    out.push(`<div class="card stack"><h3>Allocated on this line</h3>
      ${!allocs ? '<div class="muted">Loading ...</div>' : !allocs.length ? '<div class="muted">Nothing yet.</div>' : allocs.map((a) => {
        const kind = a.article_code === l.article_code ? 'ordered article' : 'alternate';
        let b = '';
        if (ed && a.state === 'OFFERED') b = `<button class="btn sm primary" data-act="confirmOffer" data-alloc="${a.id}">Store confirmed</button><button class="btn sm" data-act="declineOffer" data-alloc="${a.id}">Store declined</button><button class="btn link" data-act="remsg">Message again</button>`;
        else if (ed && a.state === 'APPROVED') b = `<button class="btn link" data-act="undo" data-alloc="${a.id}">Cancel approval</button>`;
        else if (ed) b = `<button class="btn link" data-act="undo" data-alloc="${a.id}">Undo dispatch</button>`;
        return `<div class="alloc">${pill(a.state)}<div class="grow"><b>${inr(a.qty)} pcs</b> of ${esc(a.article_code)} ${esc((M.articles[a.article_code] || {}).description || '')}
          <span class="muted">(${kind}, ${when(a.created_at)}, ${esc(a.created_by || '')})</span>${b ? `<div class="row wrap" style="margin-top:6px">${b}</div>` : ''}</div></div>`;
      }).join('')}
      ${acts.length ? `<div class="row wrap">${acts.join('')}</div>` : ''}</div>`);
    if (d && d.events.length) {
      out.push(`<div class="card stack"><h3>History</h3><div class="hist">${d.events.map((e) =>
        `<div><span class="muted">${when(e.ts)} ${esc(e.user_name || '')}</span> <b>${esc(e.action.charAt(0) + e.action.slice(1).toLowerCase())}</b> ${esc(e.detail || '')}</div>`).join('')}</div></div>`);
    }
    return out.join('');
  }

  /* ================= Shortages ================= */
  function shortRows() {
    const M = S.M, q = S.s.q.trim().toLowerCase();
    return Object.entries(M.pos).map(([c, p]) => ({ c, p, a: M.articles[c] || {}, gap: p.pending - Math.max(p.free, 0) }))
      .filter((r) => r.p.pending > 0 && (!S.s.only || r.gap > 0))
      .filter((r) => !q || (r.c + ' ' + (r.a.description || '') + ' ' + (r.a.group_name || '')).toLowerCase().includes(q))
      .sort((x, y) => y.gap - x.gap);
  }
  function vShortages() {
    const M = S.M, rows = shortRows();
    if (S.wide && (!S.s.art || !rows.some((r) => r.c === S.s.art))) S.s.art = rows.length ? rows[0].c : null;
    if (S.s.art && !M.pos[S.s.art]) S.s.art = null;
    const altFree = (c) => C.alternates(M, c).reduce((t, a) => t + Math.max(0, C.freeOf(M, a.article_code)), 0);
    let list;
    if (!rows.length) list = `<div class="empty card">${S.s.only ? 'No article is short. Every pending order line can be covered from free DC stock.' : 'No pending demand.'}</div>`;
    else if (S.wide) {
      list = `<div class="tablewrap"><table><thead><tr><th>Article</th><th>Description</th><th>Alternate group</th><th class="right">At DC</th><th class="right">Promised</th>
        <th class="right">Free now</th><th class="right">Pending demand</th><th class="right">Stores</th><th class="right">Short by</th><th class="right">Free in alternates</th></tr></thead><tbody>
        ${rows.map(({ c, p, a, gap }) => `<tr class="pick ${S.s.art === c ? 'sel' : ''}" data-act="shortSel" data-code="${esc(c)}"><td>${esc(c)}</td><td class="w">${esc(a.description || '')}</td>
          <td>${esc(a.group_name || '')}</td><td class="right">${inr(p.dc)}</td><td class="right">${p.reserved ? inr(p.reserved) : '-'}</td><td class="right b ${p.free > 0 ? 'good' : 'bad'}">${inr(p.free)}</td>
          <td class="right b">${inr(p.pending)}</td><td class="right">${p.n_stores}</td><td class="right b ${gap > 0 ? 'bad' : 'muted'}">${gap > 0 ? inr(gap) : '-'}</td>
          <td class="right ${altFree(c) ? 'good' : 'muted'}">${inr(altFree(c))}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      list = rows.map(({ c, p, a, gap }) => `<div class="ocard" data-act="shortSel" data-code="${esc(c)}">${thumb(c, 's')}<div class="grow">
        <div class="row"><b class="grow">${esc(a.description || c)}</b>${gap > 0 ? `<span class="pill REJECTED">Short ${inr(gap)}</span>` : ''}</div>
        <div class="small">${esc(c)} &middot; ${p.n_stores} store${p.n_stores !== 1 ? 's' : ''} waiting</div>
        <div class="nums"><span>Free <b class="${p.free > 0 ? 'good' : 'bad'}">${inr(p.free)}</b></span><span>Demand <b>${inr(p.pending)}</b></span><span>In alternates <b>${inr(altFree(c))}</b></span></div></div></div>`).join('');
    }
    const detail = `<div id="sdetail" class="${!S.wide && S.s.art ? 'sheetpage' : ''}" ${!S.wide && !S.s.art ? 'hidden' : ''}>${sDetailHtml()}</div>`;
    return `<div class="head"><h1>Shortages</h1><span class="sub">Articles that several stores are waiting for${editor() ? ' - split the free stock here' : ''}</span></div>
      <div class="toolbar two"><input type="search" id="sq" placeholder="Search article or group ..." value="${esc(S.s.q)}" aria-label="Search shortages">
        <label class="row" style="min-height:38px"><input type="checkbox" id="sonly" ${S.s.only ? 'checked' : ''}> Only articles that are short</label></div>
      <div class="vpanes"><div data-keep="slist">${list}</div>${detail}</div>`;
  }
  function sDetailHtml() {
    const M = S.M, c = S.s.art, ed = editor();
    if (!c) return '';
    const a = M.articles[c] || {}, p = M.pos[c], free = Math.max(p.free, 0);
    const waiting = M.lines.filter((l) => l.article_code === c && l.balance > 0);
    const alts = C.alternates(M, c).map((m) => `${esc(m.description)}: <b>${inr(Math.max(0, C.freeOf(M, m.article_code)))}</b>`).join(', ') || 'none';
    const q = (l) => (S.s.qty[l.id] || '');
    const input = (l) => `<input class="qty sq" type="number" inputmode="numeric" min="0" max="${Math.min(l.balance, free)}" value="${q(l)}" placeholder="0" data-id="${l.id}" aria-label="Allocate to ${esc(l.store_code)}">`;
    let body;
    if (S.wide) {
      body = `<div class="tablewrap"><table><thead><tr><th>Order</th><th>Date</th><th>Store</th><th>Customer</th><th class="right">Price wanted</th><th class="right">Required</th>
        <th class="right">Already approved</th><th class="right">Balance</th>${ed ? '<th class="right">Allocate now</th>' : ''}</tr></thead><tbody>
        ${waiting.map((l) => `<tr><td>${esc(l.order_no)} / ${esc(l.line_no)}</td><td>${when(l.order_date)}</td><td>${esc(l.store_code)} ${esc(l.store_name)}</td><td>${esc(l.customer)}</td>
          <td class="right">${inr(l.req_price)}</td><td class="right">${inr(l.req_qty)}</td><td class="right">${l.approved ? inr(l.approved) : '-'}</td><td class="right b">${inr(l.balance)}</td>
          ${ed ? `<td class="right">${input(l)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    } else {
      body = waiting.map((l) => `<div class="ocard" style="cursor:default"><div class="grow"><div class="row"><b class="grow">${esc(l.store_code)} ${esc(l.store_name)}</b><span>Balance <b>${inr(l.balance)}</b></span></div>
        <div class="small">${esc(l.order_no)} / ${esc(l.line_no)} &middot; ${when(l.order_date)}${l.customer ? ' &middot; ' + esc(l.customer) : ''}</div>
        ${ed ? `<div class="row" style="margin-top:6px"><span class="grow small">Allocate now</span>${input(l)}</div>` : ''}</div></div>`).join('');
    }
    return `<div class="back"><button class="btn" data-act="shortUnsel">&#8249; Shortages</button></div>
      <div class="card stack"><div class="row top">${thumb(c, 'm', true)}<div class="grow"><h2>${esc(a.description || '')} (${esc(c)})</h2>
        <div>Alternates free at DC - ${alts}</div>${ed ? '<div class="small">Give each store its share below. Lines left short stay open so alternates can be offered from the Orders screen.</div>' : ''}</div></div>
      <div class="stats">${stat('At DC', inr(p.dc))}${stat('Promised', inr(p.reserved))}${stat('Free now', inr(p.free), p.free > 0 ? 'good' : 'bad')}${stat('Pending demand', inr(p.pending), p.pending > free ? 'bad' : '')}</div>
      ${body}
      ${ed ? `<div class="row wrap"><span>Fill:</span><button class="btn sm" data-act="fill" data-m="fifo">Oldest order first</button><button class="btn sm" data-act="fill" data-m="prorata">Share in proportion</button>
        <button class="btn sm" data-act="fill" data-m="">Clear</button><span class="grow"></span><span id="stally"></span><button class="btn primary" id="sapply" data-act="applySplit">Approve these quantities</button></div>` : ''}</div>`;
  }
  function tally() {
    const el = document.getElementById('stally'); if (!el || !S.s.art) return;
    const free = Math.max(S.M.pos[S.s.art].free, 0);
    const total = Object.values(S.s.qty).reduce((t, v) => t + (+v || 0), 0), over = total > free;
    el.innerHTML = `<span class="${over ? 'bad' : 'good'}">Allocating <b>${inr(total)}</b> of <b>${inr(free)}</b> free - ${over ? inr(total - free) + ' too many' : inr(free - total) + ' left'}</span>`;
    const b = document.getElementById('sapply'); if (b) b.disabled = !total || over;
  }

  /* ================= Catalogue ================= */
  function catRows() {
    const words = S.c.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return Object.values(S.M.articles).filter((a) => (!S.c.group || (a.group_name || '') === S.c.group) &&
      words.every((w) => (a.article_code + ' ' + a.description + ' ' + a.mc_name + ' ' + a.group_name).toLowerCase().includes(w)));
  }
  function cGridHtml() {
    const rows = catRows(), M = S.M;
    setTimeout(() => setHtml('csum', `${rows.length} of ${Object.keys(M.articles).length} articles`), 0);
    if (!rows.length) return '<div class="empty card">No article matches.</div>';
    return `<div class="cgrid">${rows.slice(0, 600).map((a) => {
      const f = C.freeOf(M, a.article_code);
      return `<div class="ccard" data-act="art" data-code="${esc(a.article_code)}" title="${esc(a.group_name || 'No alternate group')}">${thumb(a.article_code, '')}
        <b>${esc(a.article_code)}</b><div class="d">${esc(a.description)}</div><div class="small">Free <b class="${f > 0 ? 'good' : 'bad'}">${inr(f)}</b> &nbsp;|&nbsp; Rs ${inr(a.mrp)}</div></div>`;
    }).join('')}</div>`;
  }
  function vCatalogue() {
    const groups = Object.keys(S.M.groups).sort();
    return `<div class="head"><h1>Catalogue</h1><span class="sub" id="csum"></span></div>
      <div class="toolbar two"><input type="search" id="cq" placeholder="Type an article code, name, MC or group ..." value="${esc(S.c.q)}" aria-label="Search articles">
        <select id="cgroup" aria-label="Group"><option value="">All groups</option>${groups.map((g) => `<option ${S.c.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div id="cgrid">${cGridHtml()}</div>`;
  }
  let artPop = null;
  function openArticle(code) {
    const M = S.M, a = M.articles[code];
    if (!a) return;
    if (artPop) artPop.close();
    const p = M.pos[code] || { dc: 0, reserved: 0, free: 0, stores: 0, pending: 0 };
    const alts = C.alternates(M, code);
    artPop = pop(`<div class="artgrid"><div>${thumb(code, 'bigimg')}
        <div class="row wrap" style="margin-top:10px">${a.image_path ? `<button class="btn sm" data-act="imgSave" data-code="${esc(code)}">Save image</button>${navigator.share ? `<button class="btn sm" data-act="imgShare" data-code="${esc(code)}">Share image</button>` : ''}` : ''}
          ${editor() ? `<button class="btn sm" data-act="imgChange" data-code="${esc(code)}">${a.image_path ? 'Change image ...' : 'Add image ...'}</button>` : ''}</div></div>
      <div class="stack"><h1 style="font-size:20px">${esc(a.description || code)}</h1>
        <div>Article ${esc(code)} &nbsp;|&nbsp; ${esc(a.mc_name || '-')} &nbsp;|&nbsp; MRP ${rupees(a.mrp)}</div><div class="muted">Alternate group: ${esc(a.group_name || 'none')}</div>
        <div class="stats">${stat('At DC', inr(p.dc))}${stat('Promised', inr(p.reserved))}${stat('Free now', inr(p.free), p.free > 0 ? 'good' : 'bad')}${stat('At stores', inr(p.stores))}</div>
        ${alts.length ? `<h3>Alternates (tap to open)</h3><div class="strip">${alts.map((m) => { const f = C.freeOf(M, m.article_code);
          return `<div data-act="art" data-code="${esc(m.article_code)}">${thumb(m.article_code, '')}<div class="small">${esc(m.article_code)}</div><b class="${f > 0 ? 'good' : 'bad'}">Free ${inr(f)}</b></div>`; }).join('')}</div>` : ''}
        <h3>Stock by site</h3><div id="art-sites" class="muted">Loading ...</div>
        <div class="actions"><button class="btn" data-act="closePop">Close</button></div></div></div>`, 'big');
    artPop.addEventListener('click', (e) => { if (e.target === artPop) artPop.close(); });
    hydrate();
    A.rpc('article_detail', { p_article: code }).then((d) => {
      const el = document.getElementById('art-sites'); if (!el) return;
      el.className = '';
      el.innerHTML = d.sites.length ? `<div class="tablewrap" style="max-height:260px"><table><thead><tr><th>Site</th><th>Type</th><th class="right">Stock</th></tr></thead><tbody>
        ${d.sites.map((s) => `<tr><td>${esc(s.site_code)} ${esc(s.store_name || '')}</td><td>${s.site_type === 'DC' ? 'DC' : 'Store'}</td><td class="right">${inr(s.qty)}</td></tr>`).join('')}</tbody></table></div>`
        : '<span class="muted">No stock anywhere in the latest report.</span>';
    }).catch(() => {});
  }
  async function imageBlob(code) {
    const a = S.M.articles[code];
    await A.imageUrls([a]);
    const r = await fetch(A.cachedUrl(a));
    if (!r.ok) throw new Error('The image could not be downloaded.');
    return r.blob();
  }

  /* ================= Data ================= */
  function vData() {
    const M = S.M, ed = editor();
    const step = (title, text, btns) => `<div class="card step"><div class="row wrap"><h2 class="grow">${title}</h2>${btns}</div><p class="small">${text}</p></div>`;
    const b = (label, act, extra, cls) => `<button class="btn sm ${cls || ''}" data-act="${act}" ${extra || ''}>${label}</button>`;
    const left = [];
    if (ed) {
      left.push(step('1 &nbsp;Article master', 'Article, description, MC name, MRP and the Group Name that ties alternates together. Loading it again updates existing articles.', b('Upload file ...', 'pick', 'data-kind="articles"')));
      left.push(step('2 &nbsp;Article images', 'Pictures named by article code (1005107.jpg). They are made smaller and stored online for everyone.', b('Choose pictures ...', 'pickImages') + (S.wide ? b('Choose a folder ...', 'pickFolder') : '')));
      left.push(step('3 &nbsp;Store list', 'Store code, name, city and email address for the alternate-offer messages.', b('Upload file ...', 'pick', 'data-kind="stores"')));
      left.push(step('4 &nbsp;Stock report', 'Upload a fresh SAP stock download any time. It replaces the previous stock picture; approvals already made stay in place and free stock is recalculated.', b('Upload stock report ...', 'pick', 'data-kind="stock"', 'primary')));
      left.push(step('5 &nbsp;Orders', 'Upload the SAP order download as often as you like. Only order lines that are not already in the tracker are added; existing lines and their approvals are never overwritten.', b('Upload orders ...', 'pick', 'data-kind="orders"', 'primary')));
    }
    left.push(step('Export', 'Every order line with approved quantities, allocations, stock position and the activity log, as an Excel file.', b('Export to Excel', 'export')));
    left.push(`<div class="card stack" id="teamcard"><div class="row"><h2 class="grow">Team</h2></div><div id="team" class="muted">Loading ...</div></div>`);
    left.push(step('Your account', `Signed in as ${esc(S.me.email)} (${ed ? 'editor' : 'view only'}).`, b('Change password', 'password') + b('Sign out', 'signout')));
    if (ed) left.push(step('Try it out', 'Loads 36 invented articles with pictures, 12 stores, stock and a first batch of orders. "Clear everything" removes all articles, stock, orders and approvals (the team stays).', b('Load test data', 'testdata') + b('Clear everything ...', 'wipe', '', 'danger')));
    const log = M.imports.length ? M.imports.map((e) => `<div>${when(e.ts)}  ${esc(e.user_name || '')}\n${esc(e.detail)}</div>`).join('') : 'Nothing loaded yet.';
    setTimeout(loadTeam, 0);
    return `<div class="head"><h1>Data</h1><span class="sub">${Object.keys(M.articles).length} articles &nbsp;|&nbsp; ${Object.keys(M.stores).length} stores &nbsp;|&nbsp; ${M.lines.length} order lines &nbsp;|&nbsp; ${M.meta.stock_asof ? 'stock as of ' + when(M.meta.stock_asof) : 'no stock report yet'}</span></div>
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
  async function sheetRows(file) {
    const X = await XL(), buf = await file.arrayBuffer();
    const wb = X.read(buf, { type: 'array', raw: true });
    return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  }
  const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const TITLES = { articles: 'Article master', stores: 'Store list', stock: 'Stock report', orders: 'Orders' };

  async function importFile(kind, file, quiet) {
    const title = TITLES[kind], prog = progress('Reading ' + file.name + ' ...');
    await tick();
    let msg;
    try {
      const rows = C.readTable(await sheetRows(file), kind);
      if (kind === 'articles' || kind === 'stores') {
        const shaped = C.shape[kind](rows); let added = 0, updated = 0;
        for (const part of chunks(shaped, 3000)) {
          const r = await A.rpc('import_' + kind, { p_rows: part, p_file: file.name }); added += r.added; updated += r.updated;
        }
        msg = `Added: ${added}\nUpdated: ${updated}`;
      } else if (kind === 'orders') {
        const shaped = C.shape.orders(rows), parts = chunks(shaped, 1500);
        let added = 0, skipped = 0, flagged = 0, notes = [];
        for (let i = 0; i < parts.length; i++) {
          prog.set(`Checking ${Math.min((i + 1) * 1500, shaped.length)} of ${shaped.length} order lines ...`);
          const r = await A.rpc('import_orders', { p_rows: parts[i], p_file: file.name, p_log: false });
          added += r.added; skipped += r.skipped; flagged += r.flagged; notes = notes.concat(r.notes || []);
        }
        await A.rpc('log_import', { p_detail: `Orders '${file.name}': added ${added}, duplicates skipped ${skipped}, quantity changed in SAP ${flagged}` });
        msg = `New order lines added: ${added}\nAlready in the tracker (skipped): ${skipped}\nQuantity changed in SAP (flagged for review): ${flagged}` +
          (notes.length ? '\n\n' + notes.slice(0, 12).join('\n') + (notes.length > 12 ? `\n... and ${notes.length - 12} more` : '') : '');
      } else {
        msg = await importStock(rows, file, prog, quiet);
        if (msg === null) { prog.close(); return; }
      }
    } catch (e) { prog.close(); await reload().catch(() => {}); await tell(title + ' was not loaded', e.message); return false; }
    prog.close();
    await reload();
    if (!quiet) await tell(title, msg);
    return true;
  }
  async function importStock(rows, file, prog, quiet) {
    const M = S.M, knownStores = new Set(Object.keys(M.stores));
    const sites = C.stockSites(rows, knownStores);
    const remembered = (M.meta.dc_sites || '').split(',').map((s) => s.trim()).filter((s) => sites.all.includes(s));
    let dcText = remembered.length ? remembered.join(', ') : (sites.candidates.length <= 12 ? sites.candidates.join(', ') : '');
    let asof = new Date(file.lastModified || Date.now());
    if (!quiet) {
      const local = new Date(asof.getTime() - asof.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const v = await ask('Stock report', `<div class="stack">
        <p class="small">${sites.all.length} sites in this file; ${sites.all.filter((s) => knownStores.has(s)).length} of them are in your store list.</p>
        <label class="f">Which sites are DCs? (codes separated by commas - every other site counts as a store)<input type="text" name="dc" value="${esc(dcText)}" required></label>
        ${sites.candidates.length > 12 ? `<p class="note warn">${sites.candidates.length} sites in this file are not in your store list, so the DCs could not be picked out automatically. Type the DC codes above.</p>` : ''}
        <label class="f">When was this report downloaded from SAP?<input type="datetime-local" name="asof" value="${local}" required></label>
        <p class="small">Stock dispatched before this time is taken as already removed from the report. Stock marked dispatched after it is still deducted.</p></div>`, 'Load stock report');
      if (!v) return null;
      dcText = v.dc; asof = new Date(v.asof);
    }
    const dc = new Set(dcText.split(',').map((s) => C.code(s)).filter(Boolean));
    const present = Array.from(dc).filter((s) => sites.all.includes(s));
    if (!present.length) throw new Error('None of the DC codes you gave (' + dcText + ') are in this file. Sites in the file include: ' + sites.all.slice(0, 15).join(', '));
    const known = new Set(Object.keys(M.articles)); M.lines.forEach((l) => known.add(l.article_code));
    const shaped = C.shape.stock(rows, known, dc);
    if (!shaped.length) throw new Error('The stock report has no usable rows.');
    const batch = await A.rpc('stock_begin'), parts = chunks(shaped, 4000);
    for (let i = 0; i < parts.length; i++) {
      prog.set(`Sending ${Math.min((i + 1) * 4000, shaped.length)} of ${shaped.length} stock rows ...`);
      await A.rpc('stock_chunk', { p_batch: batch, p_rows: parts[i] });
    }
    const r = await A.rpc('stock_commit', { p_batch: batch, p_asof: asof.toISOString(), p_file: file.name, p_dc_sites: present.join(', ') });
    return `Stock rows loaded: ${r.rows}\nDC sites: ${r.dc_sites} (${present.join(', ')})\nStore sites: ${r.store_sites}` + (r.notes.length ? '\n\n' + r.notes.join('\n') : '');
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
        if (!M.articles[c]) notes.push('No article for image ' + f.name);
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
    if (!quiet) await tell('Article images', `Pictures matched to articles: ${matched}\nNot matched: ${pics.length - matched}` + (notes.length ? '\n\n' + notes.slice(0, 12).join('\n') + (notes.length > 12 ? `\n... and ${notes.length - 12} more` : '') : ''));
  }
  async function loadTestData() {
    if (S.M.lines.length && !(await confirmBox('Load test data', 'There is already data in the tracker. Add the test data on top of it?', 'Add test data'))) return;
    const get = async (name) => {
      const r = await fetch('testdata/' + name);
      if (!r.ok) throw new Error('The test data file ' + name + ' is missing from the app folder.');
      return new File([await r.blob()], name, { lastModified: Date.now() - 60000 });
    };
    try {
      for (const [kind, name] of [['articles', '1_Article_Master.xlsx'], ['stores', '2_Store_List.xlsx']]) {
        if ((await importFile(kind, await get(name), true)) === false) return;
      }
      const list = await (await fetch('testdata/images/index.json')).json();
      const files = [];
      for (const n of list) files.push(await get('images/' + n).then((f) => new File([f], n)));
      await importImages(files, true);
      if ((await importFile('stock', await get('3_Stock_Report.xlsx'), true)) === false) return;
      if ((await importFile('orders', await get('4_Orders_Batch1.xlsx'), true)) === false) return;
      await tell('Test data loaded', `${Object.keys(S.M.articles).length} articles, ${Object.keys(S.M.stores).length} stores, ${S.M.lines.length} order lines.\n\nTo see duplicates being skipped, upload 5_Orders_Batch2.xlsx (in the testdata folder of the download) under Orders.`);
    } catch (e) { await tell('Test data was not loaded', e.message); }
  }
  async function exportExcel() {
    const prog = progress('Preparing the Excel file ...');
    try {
      const X = await XL(), M = S.M, ex = await A.rpc('export_data');
      const byLine = {};
      ex.allocations.forEach((a) => { (byLine[a.line_id] = byLine[a.line_id] || []).push(a); });
      const sheet = (name, head, rows) => {
        const ws = X.utils.aoa_to_sheet([head].concat(rows));
        ws['!cols'] = head.map((h, i) => ({ wch: Math.min(45, Math.max(String(h).length, ...rows.slice(0, 300).map((r) => String(r[i] == null ? '' : r[i]).length)) + 2) }));
        if (rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
        X.utils.book_append_sheet(wb, ws, name);
      };
      const wb = X.utils.book_new();
      sheet('Order lines', ['Order No', 'Line', 'Order Date', 'Store', 'Store Name', 'City', 'Customer', 'Article', 'Description', 'MC Name', 'Alternate Group', 'MRP', 'Price Wanted',
        'Discount %', 'Required Qty', 'Approved Qty', 'Approved - Ordered Article', 'Approved - Alternates', 'Alternate Details', 'Offered (awaiting store)', 'Dispatched Qty', 'Balance Qty',
        'Status', 'Order Value', 'Approved Value', 'DC Stock', 'DC Free Now', 'Reject Reason', 'SAP Qty Changed', 'New SAP Qty', 'Imported At', 'Source File'],
        M.lines.map((l) => {
          const mine = (byLine[l.id] || []).filter((a) => a.state !== 'OFFERED'), alt = mine.filter((a) => a.article_code !== l.article_code);
          const p = M.pos[l.article_code] || {};
          return [l.order_no, l.line_no, l.order_date, l.store_code, l.store_name, l.city, l.customer, l.article_code, l.description, l.mc_name, l.group_name, +l.mrp, +l.req_price,
            l.mrp && l.req_price ? Math.round((1 - l.req_price / l.mrp) * 1000) / 10 : null, l.req_qty, l.approved,
            mine.filter((a) => a.article_code === l.article_code).reduce((t, a) => t + a.qty, 0), alt.reduce((t, a) => t + a.qty, 0),
            alt.map((a) => a.article_code + ' x ' + a.qty).join(', '), l.offered, l.dispatched, l.balance, C.STATUS_LABEL[l.status],
            (l.req_price || 0) * l.req_qty, (l.req_price || 0) * l.approved, p.dc || 0, p.free || 0, l.reject_reason || '', l.sap_new_qty != null ? 'Yes' : '', l.sap_new_qty,
            when(l.imported_at), l.source_file];
        }));
      sheet('Allocations', ['Order No', 'Line', 'Store', 'Ordered Article', 'Allocated Article', 'Type', 'Qty', 'State', 'Created', 'By', 'Decided', 'Dispatched'],
        ex.allocations.map((a) => { const l = M.byId[a.line_id] || {};
          return [l.order_no, l.line_no, l.store_code, l.article_code, a.article_code, a.article_code === l.article_code ? 'Ordered article' : 'Alternate', a.qty,
            C.STATUS_LABEL[a.state], when(a.created_at), a.created_by, when(a.decided_at), when(a.dispatched_at)]; }));
      sheet('Stock position', ['Article', 'Description', 'MC Name', 'Alternate Group', 'MRP', 'DC Stock', 'Promised', 'DC Free', 'Store Stock (all stores)', 'Pending Demand', 'Stores Waiting', 'Short By'],
        Object.keys(M.pos).sort().map((c) => { const p = M.pos[c], a = M.articles[c] || {};
          return [c, a.description, a.mc_name, a.group_name, a.mrp == null ? null : +a.mrp, p.dc, p.reserved, p.free, p.stores, p.pending, p.n_stores, Math.max(0, p.pending - p.free)]; }));
      sheet('Activity log', ['When', 'User', 'Order No', 'Line', 'Action', 'Detail'], ex.events.map((e) => [when(e.ts), e.user_name, e.order_no, e.line_no, e.action, e.detail]));
      const d = new Date(), name = `Corporate_Orders_${String(d.getDate()).padStart(2, '0')}${when(d).slice(3, 6)}_${when(d).slice(7).replace(':', '')}.xlsx`;
      saveBlob(new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
      prog.close(); toast(`Exported ${M.lines.length} order lines`);
    } catch (e) { prog.close(); await tell('Export failed', e.message); }
  }

  /* ---------- the message to the store ---------- */
  async function messageStore(lineId, o) {
    const M = S.M, l = M.byId[lineId];
    const d = await A.rpc('line_detail', { p_line: lineId });
    const held = d.allocations.filter((a) => a.state === 'OFFERED').map((a) => [M.articles[a.article_code] || { article_code: a.article_code, description: '', mrp: 0 }, a.qty]);
    if (!held.length) return;
    o = o || {};
    const replyBy = o.replyBy || new Date(Date.now() + 4 * 3600e3), to = o.to != null ? o.to : l.email, cc = o.cc != null ? o.cc : (localStorage.getItem('allocdesk-cc') || '');
    const subject = C.offerSubject(l, replyBy), text = C.offerText(l, held, replyBy, o.note);
    const mailto = 'mailto:' + encodeURIComponent(to) + '?' + (cc ? 'cc=' + encodeURIComponent(cc) + '&' : '') + 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    const dlg = pop(`<h2>Tell the store</h2><p class="small">The stock is held. Send the message whichever way suits where you are; nothing is sent automatically.</p>
      <div class="stack" style="margin-top:10px">
        <button class="btn primary" data-m="eml" style="width:100%">Outlook draft with pictures (laptop)</button>
        <a class="btn" data-m="mailto" href="${esc(mailto)}" style="display:block;text-align:center;text-decoration:none">Open in mail app (text only)</a>
        <a class="btn" data-m="wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">Send on WhatsApp</a>
        <button class="btn" data-m="copy" style="width:100%">Copy the message</button>
        <details><summary class="small" style="cursor:pointer">Read the message</summary><pre class="small" style="margin-top:8px">${esc('To: ' + to + '\nSubject: ' + subject + '\n\n' + text)}</pre></details>
      </div><div class="actions"><button class="btn" data-done>Done</button></div>`);
    let logged = false;
    const log = () => { if (!logged) { logged = true; A.rpc('log_email', { p_line: lineId, p_to: to, p_subject: subject }).catch(() => {}); } };
    $('[data-done]', dlg).onclick = () => { dlg.close(); if (logged) reload().catch(() => {}); };
    $('[data-m=mailto]', dlg).onclick = log; $('[data-m=wa]', dlg).onclick = log;
    $('[data-m=copy]', dlg).onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Message copied'); log(); } catch (e) { toast('Could not copy - open "Read the message" and copy from there'); } };
    $('[data-m=eml]', dlg).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Preparing ...';
      const images = [];
      for (const [a] of held) {
        if (!a.image_path) continue;
        try {
          const blob = await imageBlob(a.article_code), buf = new Uint8Array(await blob.arrayBuffer()); let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          images.push({ cid: 'alt' + a.article_code, name: a.article_code + '.jpg', type: 'image/jpeg', base64: btoa(bin) });
        } catch (e) { /* the draft simply goes without that picture */ }
      }
      const got = new Set(images.map((i) => i.cid));
      const html = C.offerHtml(l, held, replyBy, o.note, (a) => got.has('alt' + a.article_code));
      saveBlob(new Blob([C.buildEml({ to, cc, subject, html, images })], { type: 'message/rfc822' }), `Offer_${l.order_no}_${l.store_code}.eml`);
      b.disabled = false; b.textContent = 'Outlook draft with pictures (laptop)';
      toast('Draft downloaded - open it and press Send'); log();
    };
  }

  /* ================= what the buttons do ================= */
  const cur = () => S.M.byId[S.o.sel];
  const altPicks = () => $$('.altq').map((i) => ({ article: i.dataset.art, qty: Math.round(+i.value || 0) })).filter((x) => x.qty > 0);
  const failures = (res) => res.filter((r) => !r.ok).map((r) => `${r.article}: ${r.error}`).join('\n');
  async function allocMany(items, st) {              // in batches, so a very large selection never hits the database time limit
    let out = [];
    for (const part of chunks(items, 300)) out = out.concat(await A.rpc('allocate_many', st ? { p_items: part, p_state: st } : { p_items: part }));
    return out;
  }
  const ACT = {
    retry: () => boot(),
    signout: async () => { clearInterval(poller); poller = null; await A.sb.auth.signOut().catch(() => {}); S.M = null; S.me = null; screenLogin(); },
    refresh: () => run(async () => {}),
    nav: (el) => { S.view = el.dataset.view; if (!S.wide) { S.o.sel = null; S.s.art = null; } render(); window.scrollTo(0, 0); const m = $('main'); if (m) m.scrollTop = 0; },
    go: (el) => { S.view = el.dataset.view; if (el.dataset.view === 'orders') { S.o.status = el.dataset.status || ''; S.o.q = el.dataset.q || ''; S.o.store = ''; S.o.mc = ''; S.o.sel = null; } render(); },
    shortOpen: (el) => { S.view = 'shortages'; S.s.art = el.dataset.code; S.s.qty = {}; render(); },
    sel: (el) => { S.o.sel = +el.dataset.id; S.o.detail = null; render(); },
    unsel: () => { S.o.sel = null; render(); },
    chk: (el) => { const id = +el.dataset.id; if (el.checked) S.o.checked.add(id); else S.o.checked.delete(id); },
    chkAll: (el) => { ordersFiltered().slice(0, S.o.limit).forEach((l) => { if (el.checked) S.o.checked.add(l.id); else S.o.checked.delete(l.id); }); setHtml('olist', oListHtml()); const c = $('[data-act=chkAll]'); if (c) c.checked = el.checked; },
    sort: (el) => { const k = el.dataset.key; if (S.o.sort === k) { if (S.o.dir === 1) S.o.dir = -1; else { S.o.sort = null; S.o.dir = 1; } } else { S.o.sort = k; S.o.dir = 1; } setHtml('olist', oListHtml()); },
    more: () => { S.o.limit += 300; setHtml('olist', oListHtml()); hydrate(); },
    approve: () => { const l = cur(), q = Math.round(+$('#ap-qty').value || 0); run(() => A.rpc('allocate', { p_line: l.id, p_article: l.article_code, p_qty: q }), `Approved ${inr(q)} pcs`); },
    approveAlts: async () => {
      const l = cur(), picks = altPicks();
      if (!picks.length) return tell('Alternates', 'Enter a quantity against at least one alternate.');
      if (!(await confirmBox('Approve alternates', 'Approve these alternates directly (the store has already agreed)?\n\n' + picks.map((p) => `  ${inr(p.qty)} pcs of ${p.article} ${(S.M.articles[p.article] || {}).description || ''}`).join('\n'), 'Approve'))) return;
      run(async () => { const res = await allocMany(picks.map((p) => ({ line: l.id, article: p.article, qty: p.qty }))); const f = failures(res); if (f) throw new Error(f); }, 'Alternates approved');
    },
    offer: async () => {
      const l = cur(), picks = altPicks();
      if (!picks.length) return tell('Alternates', 'Enter a quantity against at least one alternate.');
      const def = new Date(Date.now() + 4 * 3600e3), local = new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const v = await ask('Offer alternates to ' + (l.store_name || l.store_code), `<div class="stack">
        <p class="small">These quantities are held for the store until it replies:</p>
        <div>${picks.map((p) => `<div><b>${inr(p.qty)} pcs</b> of ${esc(p.article)} ${esc((S.M.articles[p.article] || {}).description || '')}</div>`).join('')}</div>
        <label class="f">To<input type="text" name="to" value="${esc(l.email)}"></label>
        <label class="f">Cc<input type="text" name="cc" value="${esc(localStorage.getItem('allocdesk-cc') || '')}"></label>
        <label class="f">Reply needed by<input type="datetime-local" name="by" value="${local}" required></label>
        <label class="f">Extra line for the store (optional)<textarea name="note" rows="2"></textarea></label></div>`, 'Hold stock');
      if (!v) return;
      localStorage.setItem('allocdesk-cc', v.cc.trim());
      S.busy = true;
      try {
        const res = await allocMany(picks.map((p) => ({ line: l.id, article: p.article, qty: p.qty })), 'OFFERED');
        await reload();
        const f = failures(res);
        if (f) await tell('Some alternates were not held', f);
        if (res.some((r) => r.ok)) await messageStore(l.id, { to: v.to.trim(), cc: v.cc.trim(), replyBy: new Date(v.by), note: v.note.trim() });
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    remsg: () => messageStore(S.o.sel),
    confirmOffer: (el) => run(() => A.rpc('confirm_offer', { p_alloc: +el.dataset.alloc }), 'Marked as confirmed by the store'),
    declineOffer: (el) => run(() => A.rpc('decline_offer', { p_alloc: +el.dataset.alloc }), 'Offer cancelled, stock released'),
    undo: (el) => run(() => A.rpc('undo_alloc', { p_alloc: +el.dataset.alloc }), 'Undone'),
    dispatch: () => run(() => A.rpc('dispatch_lines', { p_lines: [S.o.sel] }), 'Marked dispatched'),
    closeBal: () => run(() => A.rpc('close_balance', { p_line: S.o.sel }), 'Balance closed'),
    reopen: () => run(() => A.rpc('reopen_line', { p_line: S.o.sel }), 'Reopened'),
    sapAccept: () => run(() => A.rpc('sap_accept', { p_line: S.o.sel })),
    sapDismiss: () => run(() => A.rpc('sap_dismiss', { p_line: S.o.sel })),
    reject: async () => {
      const l = cur(), v = await ask('Reject order line', `<label class="f">Reason for rejecting ${esc(l.order_no)} / ${esc(l.line_no)}<input type="text" name="reason"></label>`, 'Reject line', { danger: true });
      if (v) run(() => A.rpc('reject_line', { p_line: l.id, p_reason: v.reason.trim() }), 'Line rejected');
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
        await tell('Approve ticked in full', `Approved in full: ${res.length - bad.length} line(s).` + (bad.length ? `\n\nNot approved (${bad.length}):\n` +
          bad.slice(0, 15).map((r) => { const l = S.M.byId[r.line] || {}; return `${l.order_no}/${l.line_no}  ${r.error}`; }).join('\n') : ''));
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    bulkDispatch: () => {
      const ids = Array.from(S.o.checked);
      if (!ids.length) return tell('Mark ticked dispatched', 'Tick one or more order lines first.');
      run(async () => { const n = await A.rpc('dispatch_lines', { p_lines: ids }); S.o.checked.clear(); return n; }, (n) => (n ? `Marked dispatched: ${n} line(s)` : 'Nothing approved was waiting for dispatch'));
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
        if (bad.length) await tell('Some lines were not approved', bad.map((r) => { const l = S.M.byId[r.line] || {}; return `${l.order_no}: ${r.error}`; }).join('\n'));
        else toast(`Approved ${items.length} line(s)`);
      } catch (e) { await tell('Not done', e.message); } finally { S.busy = false; }
    },
    art: (el) => openArticle(el.dataset.code),
    closePop: (el) => { const o = el.closest('.overlay'); if (o) o.close(); },
    imgSave: async (el) => { try { saveBlob(await imageBlob(el.dataset.code), el.dataset.code + '.jpg'); } catch (e) { tell('Image', e.message); } },
    imgShare: async (el) => {
      try {
        const c = el.dataset.code, f = new File([await imageBlob(c)], c + '.jpg', { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: (S.M.articles[c] || {}).description || c });
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
      if (v && v.word.trim().toUpperCase() === 'CLEAR') run(() => A.rpc('wipe'), 'Everything was cleared');
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
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'oq') { S.o.q = t.value; S.o.limit = 300; setHtml('olist', oListHtml()); hydrate(); }
    else if (t.id === 'cq') { S.c.q = t.value; setHtml('cgrid', cGridHtml()); hydrate(); }
    else if (t.id === 'sq') { S.s.q = t.value; const a = document.activeElement, pos = t.selectionStart; render(); const n = $('#sq'); if (a === t && n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* type=search */ } } }
    else if (t.classList.contains('sq')) { const v = Math.max(0, Math.round(+t.value || 0)); if (v) S.s.qty[t.dataset.id] = v; else delete S.s.qty[t.dataset.id]; tally(); }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'ostatus') { S.o.status = t.value; S.o.limit = 300; setHtml('olist', oListHtml()); hydrate(); }
    else if (t.id === 'ostore') { S.o.store = t.value; setHtml('olist', oListHtml()); hydrate(); }
    else if (t.id === 'omc') { S.o.mc = t.value; setHtml('olist', oListHtml()); hydrate(); }
    else if (t.id === 'cgroup') { S.c.group = t.value; setHtml('cgrid', cGridHtml()); hydrate(); }
    else if (t.id === 'sonly') { S.s.only = t.checked; render(); }
    else if (t.dataset.role) {
      try { await A.rpc('team_set', { p_user: t.dataset.role, p_role: t.value }); toast('Access changed'); } catch (err) { await tell('Not done', err.message); }
      loadTeam();
    } else if (t.id === 'file-in' && t.files[0] && pending) {
      const p = pending; pending = null;
      if (p.kind === 'oneImage') {
        const prog = progress('Uploading picture ...');
        try { await A.uploadImage(p.code, await shrink(t.files[0])); prog.close(); await reload(); openArticle(p.code); toast('Picture updated'); }
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
    if (e.key === 'Enter' && e.target.id === 'find' && e.target.value.trim()) { S.c.q = e.target.value.trim(); S.c.group = ''; S.view = 'catalogue'; render(); const r = catRows(); if (r.length === 1) openArticle(r[0].article_code); }
    if (e.key === 'Escape') { const o = $('#modal').lastElementChild; const c = o && $('[data-cancel],[data-done],[data-act=closePop]', o); if (c) c.click(); }
  });
  wideMQ.addEventListener('change', (e) => { S.wide = e.matches; if (S.M) render(); });
  window.addEventListener('error', (e) => { if (S.M && e.message) toast('Something went wrong: ' + e.message); });

  window.AllocDesk = { S, reload, boot };            // handy for support and for the automated checks
  boot();
})();
