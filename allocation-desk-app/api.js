/* Talking to Supabase: sign-in, the database functions, article pictures. */
(function () {
  'use strict';
  const cfg = window.ALLOCDESK_CONFIG || {};
  const ready = !!(cfg.url && cfg.key && window.supabase);
  const sb = ready ? window.supabase.createClient(cfg.url, cfg.key) : null;
  const BUCKET = 'article-images';

  function nice(e) {
    const m = (e && (e.message || e.msg || e.error_description)) || String(e);
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'No connection. Check the internet and try again.';
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/jwt expired|invalid jwt/i.test(m)) return 'Your sign-in has expired. Sign in again.';
    return m;
  }

  async function rpc(fn, args) {
    let res;
    try { res = await sb.rpc(fn, args || {}); } catch (e) { throw new Error(nice(e)); }
    if (res.error) throw new Error(nice(res.error));
    return res.data;
  }

  /* ---- pictures: private bucket, short-lived links ---- */
  const links = new Map();                           // "path|version" -> {url, until}
  const keyOf = (a) => a.image_path + '|' + (a.image_ver || 0);
  function cachedUrl(a) {
    const hit = a && a.image_path && links.get(keyOf(a));
    return hit && hit.until > Date.now() ? hit.url : null;
  }
  async function imageUrls(articles) {               // makes sure every given article has a link in the cache
    const need = articles.filter((a) => a && a.image_path && !cachedUrl(a));
    for (let i = 0; i < need.length; i += 100) {
      const part = need.slice(i, i + 100);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(part.map((a) => a.image_path), 6 * 3600);
      if (error || !data) continue;
      data.forEach((d, j) => { if (d && d.signedUrl) links.set(keyOf(part[j]), { url: d.signedUrl, until: Date.now() + 5 * 3600e3 }); });
    }
  }
  async function uploadImage(code, blob) {
    const path = code + '.jpg';
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (error) throw new Error(nice(error));
    await rpc('set_image', { p_article: code, p_path: path });
  }

  /* The editor creates accounts for the team. A second, throw-away connection is used so the
     editor's own sign-in is not replaced by the new person's. */
  async function createAccount(email, password) {
    const tmp = window.supabase.createClient(cfg.url, cfg.key,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'allocdesk-new-account' } });
    const { data, error } = await tmp.auth.signUp({ email, password });
    if (error) {
      if (/already registered|already exists/i.test(error.message || '')) return { exists: true };
      throw new Error(nice(error));
    }
    if (data && data.user && !data.session) return { needsConfirm: true };
    try { await tmp.auth.signOut({ scope: 'local' }); } catch (e) { /* nothing to clean up */ }
    return { created: true };
  }

  window.Api = { cfg, ready, sb, rpc, nice, imageUrls, cachedUrl, uploadImage, createAccount, BUCKET };
})();
