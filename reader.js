/* Reading Excel files quickly and safely.
   Big SAP / Excel workbooks often carry pivot caches of hundreds of MB that would freeze a
   browser if the whole file were unpacked. This reader unpacks only the worksheets, picks the
   sheet (and heading row) that fits the kind of file being loaded, and returns its rows.
   Old .xls, .csv and text exports go through the SheetJS library instead. */
(function (root) {
  'use strict';
  const C = root.Core;
  const zipLib = () => root.fflate || (typeof require === 'function' ? require('fflate') : null);
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unx = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) =>
    (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] || m))));
  const textOf = (xml) => { let out = '', m; const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g; while ((m = re.exec(xml))) out += m[1]; return unx(out); };
  function colIndex(letters) { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; }

  function sharedStrings(xml) {
    const out = [], re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g; let m;
    while ((m = re.exec(xml))) out.push(m[1] ? textOf(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')) : '');
    return out;
  }
  /* Rows that contain something, in order. limit = stop after that many (for a quick look). */
  function sheetRows(xml, strings, limit) {
    const rows = [], rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      if (!rm[1]) continue;
      const row = []; let cm, any = false, next = 0;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(rm[1]))) {
        const ref = /\br="([A-Z]+)\d+"/.exec(cm[1]), j = ref ? colIndex(ref[1]) : next;
        next = j + 1;
        if (!cm[2]) continue;
        const t = (/\bt="(\w+)"/.exec(cm[1]) || [])[1], vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cm[2]);
        let v = null;
        if (t === 'inlineStr') v = textOf(cm[2]);
        else if (vm) {
          if (t === 's') v = strings[+vm[1]];
          else if (t === 'str') v = unx(vm[1]);
          else if (t === 'b') v = vm[1] === '1';
          else if (t === 'e') v = null;                          // #N/A and friends count as empty
          else { const n = Number(vm[1]); v = isNaN(n) ? unx(vm[1]) : n; }
        }
        if (v === '' || v == null) continue;
        row[j] = v; any = true;
      }
      if (any) { for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = null; rows.push(row); if (limit && rows.length >= limit) break; }
    }
    return rows;
  }

  function fromZip(u8) {
    const fz = zipLib(), dec = new TextDecoder('utf-8');
    const want = (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || /sharedstrings\.xml$/i.test(n) || (/^xl\/worksheets\/[^\/]+\.xml$/i.test(n));
    let files;
    try { files = fz.unzipSync(u8, { filter: (f) => want(f.name) && f.originalSize < 700e6 }); }
    catch (e) { throw new Error('This file could not be opened as an Excel workbook (' + e.message + ').'); }
    const str = (n) => (files[n] ? dec.decode(files[n]) : '');
    const wb = str('xl/workbook.xml'), rels = str('xl/_rels/workbook.xml.rels');
    if (!wb) throw new Error('This does not look like an Excel workbook.');
    const target = {}; let m;
    const relRe = /<Relationship\b[^>]*>/g;
    while ((m = relRe.exec(rels))) { const id = /\bId="([^"]+)"/.exec(m[0]), t = /\bTarget="([^"]+)"/.exec(m[0]); if (id && t) target[id[1]] = t[1].replace(/^\/?(xl\/)?/, 'xl/'); }
    const ssName = Object.keys(files).find((n) => /sharedstrings\.xml$/i.test(n));
    const strings = ssName ? sharedStrings(dec.decode(files[ssName])) : [];
    const sheets = []; const shRe = /<sheet\b[^>]*>/g;
    while ((m = shRe.exec(wb))) {
      const name = /\bname="([^"]*)"/.exec(m[0]), rid = /\br:id="([^"]+)"/.exec(m[0]);
      const path = rid && target[rid[1]];
      if (name && path && files[path]) sheets.push({ name: unx(name[1]), bytes: files[path] });
    }
    return sheets.map((s) => {
      let xml = null;
      const get = () => (xml == null ? (xml = dec.decode(s.bytes)) : xml);
      return { name: s.name, peek: () => sheetRows(get(), strings, 40), all: () => { const r = sheetRows(get(), strings); xml = null; return r; } };
    });
  }
  async function fromOther(u8, loadSheetJS) {                     // .xls, .csv, tab text
    const X = await loadSheetJS();
    const wb = X.read(u8, { type: 'array', raw: true });
    return wb.SheetNames.map((name) => {
      const rows = () => X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
      return { name, peek: () => rows().slice(0, 40), all: rows };
    });
  }
  /* The date a report prints above its headings ("Date: 10/8/2026"), exactly as written. */
  function reportDate(rows, headerRow) {
    for (const row of rows.slice(0, Math.max(0, headerRow))) {
      const i = (row || []).findIndex((c) => typeof c === 'string' && /^date\s*:?\s*$/i.test(c.trim()));
      if (i >= 0) { const v = row.slice(i + 1).find((c) => c != null && c !== ''); if (v != null) return String(v); }
    }
    return '';
  }
  /* Open a file, choose the sheet that best fits this kind of report, return its rows.
     u8: the file's bytes. kind: master | data | stores | stock | orders. */
  async function read(u8, kind, loadSheetJS) {
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
    const sheets = isZip ? fromZip(u8) : await fromOther(u8, loadSheetJS);
    if (!sheets.length) throw new Error('The file has no sheets that could be read.');
    let best = null;
    for (const s of sheets) {
      const head = s.peek(), h = C.findHeader(head, kind);
      if (!best || h.score > best.header.score) best = { sheet: s, header: h, head };
    }
    if (best.header.missing.length) C.readTable(best.head, kind, best.header);       // throws the readable "column not found" message
    const rows2d = best.sheet.all();
    return { rows2d, sheet: best.sheet.name, sheets: sheets.map((s) => s.name), header: best.header, reportDate: reportDate(rows2d, best.header.row) };
  }
  root.Reader = { read, sheetRows, sharedStrings };
})(typeof window !== 'undefined' ? window : globalThis);
