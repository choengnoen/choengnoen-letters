/* ==========================================================================
   app-out.js — หนังสือส่ง: ร่างบันทึกข้อความ + ใบแยก (ใบแนบรูป/ผัง) + ทะเบียนส่ง (บ.1-03)
     ขั้นตอนตามคู่มืองานสารบรรณหมวด: ร่าง → พิมพ์ให้หัวหน้าหมวดลงนาม → กรอกเลขที่และวันที่ → ลงสมุดส่ง
     ตัวอย่างบนจอกับกระดาษใช้โค้ดจัดหน้าชุดเดียวกัน (ตัดบรรทัด/ขึ้นหน้าเอง หน่วยมิลลิเมตร)
   ========================================================================== */
(function () {
  'use strict';
  const A = window.App, D = window.LTR_DATA, esc = U.esc, $ = A.$;
  const CFG = D.OUT_DEFAULTS;
  const OS = { id: null, rec: null, dirty: false, ui: { q: '', st: 'all' }, imgs: {}, timer: null };
  A.OS = OS;

  /* ======================= ตัวช่วยข้อมูล ======================= */
  const numOf = function (r) { return parseInt(U.toArabic(r.docSuffix || ''), 10) || 0; };
  function issued() { return A.outs().filter(function (r) { return r.status === 'issued'; }); }
  function lastNo() { return issued().reduce(function (m, r) { return Math.max(m, numOf(r)); }, 0); }
  function fullNo(r, thai) { const s = CFG.docPrefix + (r.docSuffix || ''); return thai ? U.toThaiDigits(s) : s; }
  function defaultSigner() { return A.person(CFG.signerId) || A.people()[0] || null; }
  function signerOf(p) { return { signerId: p ? p.id : '', signerName: p ? A.fullName(p) : '', signerPos: p ? (p.abbr || p.position || '') : '' }; }
  function newId() { return FBL.newId(); }
  function blankRec(tpl) {
    const t = tpl || {};
    return Object.assign({
      id: newId(), kind: 'memo', status: 'draft', createdAt: new Date().toISOString(), createdBy: FBL.user.name,
      tplId: t.id || '', subject: t.subject || '', to: CFG.to, via: CFG.via[0], body: t.body || '', closing: t.closing || D.OUT_CLOSINGS[0],
      thaiDigits: true, docSuffix: '', docDate: '', urgency: '', attachments: []
    }, signerOf(defaultSigner()));
  }

  /* ======================= จัดหน้า ======================= */
  const PAGE = { w: 210, h: 297, land: { w: 297, h: 210, m: 15 } };
  const M = CFG.marginsMm, BODY_W = PAGE.w - M.left - M.right, BODY_H = PAGE.h - M.top - M.bottom;
  const PT = 25.4 / 72, PX = 96 / 25.4, IND = 25, BEFORE = 6 * PT;
  const R_ORG = 35 * PT, GARUDA = 15, TEXT_CENTER = BODY_W / 2;
  const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

  function fontOf() {
    const f = EN.pickFont(CFG.fontKey), s = f.scale;
    const F = { css: f.css + ',Sarabun,sans-serif', s: s, body: CFG.sizesPt.body * s, label: CFG.sizesPt.label * s, title: CFG.sizesPt.title * s };
    const c = document.createElement('canvas').getContext('2d');
    F.line = F.body * PT * 1.3;    // ระยะบรรทัดปกติ (Single) ของแบบอักษรสารบรรณโดยประมาณ
    F.row = F.label * PT * 1.25;   // แถว "ที่" และ "เรื่อง"
    // ตำแหน่งอ้างอิงจากคำว่า "บันทึกข้อความ" ที่จัดกึ่งกลาง: "วันที่" ตรงตัว ข · ชื่อเดือนเริ่มหลังตัว ม
    const w = function (t, font) { c.font = font; return c.measureText(t).width / PX; };
    const tf = '700 ' + F.title + 'pt ' + F.css, lf = '700 ' + F.label + 'pt ' + F.css;
    const left = TEXT_CENTER - w('บันทึกข้อความ', tf) / 2;
    F.xKho = left + w('บันทึก', tf);
    F.xMonth = left + w('บันทึกข้อความ', tf);
    F.lbl = { org: w('ส่วนราชการ', lf), no: w('ที่', lf), date: w('วันที่', lf), subj: w('เรื่อง', lf) };
    c.font = F.body + 'pt ' + F.css;
    F.textW = function (t) { return c.measureText(t).width / PX; };
    return F;
  }
  function styleOf(F) {
    return '.ob-sheet{position:relative;width:210mm;height:297mm;background:#fff;color:#000;overflow:hidden;font-family:' + F.css + ';font-size:' + F.body.toFixed(2) + 'pt;page-break-after:always;break-after:page}' +
      '.ob-sheet.land{width:297mm;height:210mm;page:land}' +
      '.ob-in{position:absolute;left:' + M.left + 'mm;top:' + M.top + 'mm;width:' + BODY_W + 'mm;height:' + BODY_H + 'mm}' +
      '.land .ob-in{left:15mm;top:15mm;width:267mm;height:180mm}' +
      '.ob-l{height:' + F.line.toFixed(2) + 'mm;line-height:' + F.line.toFixed(2) + 'mm;white-space:nowrap}' +
      '.ob-l.j{white-space:normal;text-align:justify;text-align-last:justify;text-justify:inter-character;overflow:hidden}' +
      '.ob-head{position:relative;height:' + GARUDA + 'mm}.ob-head img{position:absolute;left:0;top:0;height:' + GARUDA + 'mm;width:auto}' +
      '.ob-title{position:absolute;left:0;right:0;bottom:0;text-align:center;font-weight:700;font-size:' + F.title.toFixed(2) + 'pt;line-height:35pt}' +
      '.ob-urg{position:absolute;left:' + (GARUDA + 3) + 'mm;bottom:0;font-weight:700;font-size:' + F.label.toFixed(2) + 'pt;line-height:1.25}' +
      '.ob-row{position:relative;white-space:nowrap}.ob-row b{font-size:' + F.label.toFixed(2) + 'pt;position:absolute;left:0;bottom:0;line-height:1.25}' +
      '.ob-v{position:absolute;bottom:0;white-space:nowrap;overflow:hidden;border-bottom:.25mm dotted #000;line-height:' + F.row.toFixed(2) + 'mm;box-sizing:border-box}' +
      '.ob-to{position:relative;white-space:nowrap}' +
      '.ob-pn{text-align:center;height:8mm;line-height:8mm}' +
      '.ob-sig{position:relative;text-align:center;padding-top:' + (F.line * 3).toFixed(2) + 'mm}' +
      '.ob-sig div{height:' + F.line.toFixed(2) + 'mm;line-height:' + F.line.toFixed(2) + 'mm;white-space:nowrap}' +
      '.ob-att-t{text-align:center;font-weight:700;font-size:' + F.label.toFixed(2) + 'pt;line-height:10mm;height:10mm;white-space:nowrap;overflow:hidden}' +
      '.ob-att-s{text-align:center;line-height:' + F.line.toFixed(2) + 'mm;height:' + F.line.toFixed(2) + 'mm;white-space:nowrap;overflow:hidden}' +
      '.ob-imgs{position:absolute;left:0;right:0;top:' + (12 + F.line).toFixed(2) + 'mm;bottom:' + (F.line * 5 + 3).toFixed(2) + 'mm;display:flex;flex-direction:column;gap:3mm}' +
      '.ob-imgs div{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.ob-imgs img{max-width:100%;max-height:100%;object-fit:contain}' +
      '.ob-att-sig{position:absolute;right:0;bottom:0;width:70mm;text-align:center}.ob-att-sig div{height:' + F.line.toFixed(2) + 'mm;line-height:' + F.line.toFixed(2) + 'mm}' +
      '.ob-att-sig .pen{height:' + (F.line * 3).toFixed(2) + 'mm}';
  }

  // ตัดบรรทัดตามที่เบราว์เซอร์วัดจริง (ตัดระหว่างคำไทย) — คืนข้อความแต่ละบรรทัด
  let meas = null;
  function splitLines(text, F, widthMm, indentMm) {
    if (!meas) { meas = document.createElement('div'); meas.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden'; document.body.appendChild(meas); }
    meas.style.width = widthMm + 'mm';
    meas.style.fontFamily = F.css; meas.style.fontSize = F.body + 'pt'; meas.style.lineHeight = F.line + 'mm'; meas.style.textIndent = (indentMm || 0) + 'mm';
    const parts = seg ? Array.from(seg.segment(text), function (s) { return s.segment; }) : text.split(/(?=\s)/);
    meas.innerHTML = parts.map(function (p) { return '<span style="display:inline-block;white-space:pre;text-indent:0">' + esc(p) + '</span>'; }).join('');
    const out = []; let top = null, cur = '';
    meas.childNodes.forEach(function (n, i) {
      const t = n.offsetTop;
      if (top !== null && Math.abs(t - top) > 2) { out.push(cur.trim()); cur = ''; }
      top = t; cur += parts[i];
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // แปลงเนื้อหาเป็นก้อน { h, html } แล้วแบ่งหน้า · ท้ายหนังสือ (คำลงท้าย + ลงนาม) ห้ามแยกจากกัน และต้องมีเนื้อหาตามไปอย่างน้อย 2 บรรทัดถ้าขึ้นหน้าใหม่
  function memoSheets(r, F) {
    const d = function (s) { return r.thaiDigits === false ? String(s || '') : U.toThaiDigits(s || ''); };
    const now = U.parseIso(U.today());
    const dd = U.parseIso(r.docDate);
    const dayTxt = dd ? d(String(dd.getDate())) : '';
    const monthTxt = d(U.MONTHS[(dd || now).getMonth()] + ' ' + ((dd || now).getFullYear() + 543));
    const lineH = F.line, GAP = 1.5;
    // ค่าที่อยู่หลังหัวข้อ มีจุดไข่ปลาตลอดช่อง ตามแบบบันทึกข้อความ
    const val = function (x, w, html, extra) { return '<span class="ob-v" style="left:' + x.toFixed(2) + 'mm;width:' + w.toFixed(2) + 'mm;' + (extra || '') + '">' + html + '</span>'; };
    const xOrg = F.lbl.org + GAP, xNo = F.lbl.no + GAP, xDate = F.xKho + F.lbl.date + GAP, xSubj = F.lbl.subj + GAP;
    const subj = splitLines(d(r.subject || ''), F, BODY_W - xSubj, 0);
    const urg = r.urgency && r.urgency !== 'ปกติ' ? '<div class="ob-urg">' + esc(r.urgency) + '</div>' : '';
    let head = '<div class="ob-head"><img src="' + esc(CFG.garuda) + '" alt="">' + urg + '<div class="ob-title">บันทึกข้อความ</div></div>' +
      '<div class="ob-row" style="height:' + R_ORG.toFixed(2) + 'mm"><b>ส่วนราชการ</b>' + val(xOrg, BODY_W - xOrg, esc(d(CFG.org)) + ' โทร. ' + esc(d(CFG.phone))) + '</div>' +
      '<div class="ob-row" style="height:' + F.row.toFixed(2) + 'mm"><b>ที่</b>' + val(xNo, F.xKho - xNo - GAP, esc(d(fullNo(r)))) +
      '<b style="left:' + F.xKho.toFixed(2) + 'mm">วันที่</b>' + val(xDate, BODY_W - xDate, '') +
      '<span class="ob-v" style="left:' + xDate.toFixed(2) + 'mm;width:' + Math.max(0, F.xMonth - xDate).toFixed(2) + 'mm;text-align:center;border:0">' + esc(dayTxt) + '</span>' +
      '<span class="ob-v" style="left:' + F.xMonth.toFixed(2) + 'mm;border:0">' + esc(monthTxt) + '</span></div>' +
      '<div class="ob-row" style="height:' + F.row.toFixed(2) + 'mm"><b>เรื่อง</b>' + val(xSubj, BODY_W - xSubj, esc(subj[0] || '')) + '</div>';
    subj.slice(1).forEach(function (x) { head += '<div class="ob-row" style="height:' + lineH.toFixed(2) + 'mm">' + val(xSubj, BODY_W - xSubj, esc(x)) + '</div>'; });
    head += '<div class="ob-l ob-to" style="margin-top:' + BEFORE.toFixed(2) + 'mm">เรียน<span style="position:absolute;left:' + xSubj.toFixed(2) + 'mm">' + esc(d(r.to)) + (r.via ? '&nbsp;&nbsp;&nbsp;&nbsp;ผ่าน ' + esc(d(r.via)) : '') + '</span></div>';
    const headH = GARUDA + R_ORG + F.row * 2 + lineH * Math.max(0, subj.length - 1) + BEFORE + lineH;

    const blocks = [];
    String(r.body || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      const t = d(raw.trim());
      if (!t) return;
      const ls = splitLines(t, F, BODY_W, IND);
      ls.forEach(function (x, i) {
        const last = i === ls.length - 1;
        blocks.push({ h: lineH + (i === 0 ? BEFORE : 0), html: '<div class="ob-l' + (last ? '' : ' j') + '" style="' + (i === 0 ? 'margin-top:' + BEFORE.toFixed(2) + 'mm;padding-left:' + IND + 'mm;' : '') + '">' + esc(x) + '</div>' });
      });
    });
    // ชื่อเริ่มที่แนวกึ่งกลาง เว้น 3 บรรทัดจากข้อความ · ชื่อกับตำแหน่งอยู่กึ่งกลางซึ่งกันและกัน
    const nameTxt = '(' + d(r.signerName || '') + ')', posTxt = d(r.signerPos || '');
    const sigW = Math.max(F.textW(nameTxt), F.textW(posTxt)) + 1;
    const sigX = Math.max(0, Math.min(TEXT_CENTER, BODY_W - sigW));
    const sign = '<div class="ob-l" style="margin-top:' + BEFORE.toFixed(2) + 'mm;padding-left:' + IND + 'mm">' + esc(d(r.closing || '')) + '</div>' +
      '<div class="ob-sig" style="margin-left:' + sigX.toFixed(2) + 'mm;width:' + sigW.toFixed(2) + 'mm"><div>' + esc(nameTxt) + '</div><div>' + esc(posTxt) + '</div></div>';
    const signH = BEFORE + lineH + lineH * 3 + lineH * 2;

    const pages = [[head]];
    let used = headH;
    blocks.forEach(function (b) {
      if (used + b.h > BODY_H) { pages.push([]); used = 8; }
      pages[pages.length - 1].push(b); used += b.h;
    });
    if (used + signH > BODY_H) {
      const prev = pages[pages.length - 1], keep = [];
      // ดึงเนื้อหา 2 บรรทัดสุดท้ายตามไป เพื่อไม่ให้หน้าสุดท้ายมีแต่คำลงท้าย
      for (let i = 0; i < 2 && prev.length && typeof prev[prev.length - 1] !== 'string'; i++) keep.unshift(prev.pop());
      pages.push(keep.concat([sign]));
    } else pages[pages.length - 1].push(sign);

    return pages.map(function (p, i) {
      const pn = i ? '<div class="ob-pn">-' + esc(d(String(i + 1))) + '-</div>' : '';
      return '<div class="ob-sheet"><div class="ob-in">' + pn + p.map(function (b) { return typeof b === 'string' ? b : b.html; }).join('') + '</div></div>';
    });
  }

  // ใบแยก 1 รายการ อาจกินหลายแผ่น ตามจำนวนรูปและแบบที่เลือก — ทุกแผ่นมีช่องลงนามตำแหน่งเดียวกันด้านล่างขวา
  function attachSheets(r) {
    const d = function (s) { return r.thaiDigits === false ? String(s || '') : U.toThaiDigits(s || ''); };
    const out = [];
    (r.attachments || []).forEach(function (a) {
      const imgs = a.images || [];
      const per = a.layout === 'two' ? 2 : 1;
      const groups = [];
      for (let i = 0; i < Math.max(1, imgs.length); i += per) groups.push(imgs.slice(i, i + per));
      groups.forEach(function (g) {
        out.push('<div class="ob-sheet' + (a.layout === 'land' ? ' land' : '') + '"><div class="ob-in">' +
          '<div class="ob-att-t">' + esc(d(a.title || '')) + '</div><div class="ob-att-s">' + esc(d(a.subtitle || '')) + '</div>' +
          '<div class="ob-imgs">' + g.map(function (im) { return '<div>' + (OS.imgs[im.path] ? '<img src="' + OS.imgs[im.path] + '" alt="">' : '') + '</div>'; }).join('') + '</div>' +
          '<div class="ob-att-sig"><div class="pen"></div><div>(' + esc(d(r.signerName || '')) + ')</div><div>' + esc(d(r.signerPos || '')) + '</div></div></div></div>');
      });
    });
    return out;
  }

  async function loadImages(r) {
    const need = [];
    (r.attachments || []).forEach(function (a) { (a.images || []).forEach(function (im) { if (!OS.imgs[im.path]) need.push(im.path); }); });
    for (const p of need) {
      const b = await FBL.fileBlob(p);
      if (b) OS.imgs[p] = await new Promise(function (res) { const fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
    }
  }
  async function buildAll(r) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await loadImages(r);
    const F = fontOf();
    return { css: styleOf(F), sheets: memoSheets(r, F).concat(attachSheets(r)) };
  }

  /* ======================= พิมพ์ ======================= */
  async function printRec(r) {
    const b = await buildAll(r);
    // หน้าพิมพ์อยู่ใน iframe จึงต้องใช้ที่อยู่รูปตราครุฑแบบเต็ม
    const html = b.sheets.join('').split('src="' + CFG.garuda + '"').join('src="' + new URL(CFG.garuda, location.href).href + '"');
    EN.sendToPrinter('<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>' + esc(r.subject || 'บันทึกข้อความ') + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">' +
      '<style>@page{size:210mm 297mm;margin:0}@page land{size:297mm 210mm;margin:0}html,body{margin:0;padding:0}' + b.css + '</style></head><body>' + html +
      '<script>document.fonts.ready.then(function(){setTimeout(function(){window.focus();window.print();},300)});<\/script></body></html>');
  }

  function printBook() {
    const months = {};
    issued().forEach(function (r) { const k = String(r.docDate || '').slice(0, 7); if (k) months[k] = true; });
    const keys = Object.keys(months).sort().reverse();
    if (!keys.length) return A.toast('ยังไม่มีหนังสือที่ออกเลขแล้ว', true);
    const label = function (k) { const p = k.split('-'); return U.MONTHS[+p[1] - 1] + ' ' + (+p[0] + 543); };
    const m = A.modal({
      title: 'พิมพ์สมุดส่งหนังสือ (บ.1-03)', size: 'narrow',
      body: '<div class="field"><label>เดือน</label><select id="obkM">' + A.opts(keys.map(function (k) { return { key: k, name: label(k) }; }), keys[0]) + '</select></div>' +
        '<p class="hint">ช่องหน่วยรับ ผู้รับ และวันและเวลา เว้นว่างไว้ให้ผู้รับเขียนตอนนำส่ง</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="obkGo">พิมพ์</button>'
    });
    m.q('#obkGo').onclick = function () {
      const k = m.q('#obkM').value;
      const rows = issued().filter(function (r) { return String(r.docDate || '').slice(0, 7) === k; }).sort(function (a, b) { return numOf(a) - numOf(b); });
      const body = rows.map(function (r) {
        return '<tr><td class="c">' + esc(U.toThaiDigits(r.docSuffix || '')) + '</td><td>' + esc(U.toThaiDigits(U.thDate(r.docDate, 'short'))) + '</td><td>ม.เชิงเนิน</td><td>' + esc(U.toThaiDigits(r.to || '')) + '</td><td></td><td></td><td></td><td>' + esc(U.toThaiDigits(r.subject || '')) + '</td></tr>';
      }).join('');
      const F = fontOf();
      EN.sendToPrinter('<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>สมุดส่งหนังสือ</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">' +
        '<style>@page{size:297mm 210mm;margin:12mm}body{margin:0;font-family:' + F.css + ';font-size:' + (15 * F.s).toFixed(1) + 'pt}' +
        'h1{font-size:' + (20 * F.s).toFixed(1) + 'pt;text-align:center;margin:0 0 2mm}.n{text-align:right;font-size:' + (13 * F.s).toFixed(1) + 'pt}' +
        'table{width:100%;border-collapse:collapse}th,td{border:.2mm solid #000;padding:1mm 2mm;vertical-align:top}th{text-align:center}.c{text-align:center}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body>' +
        '<div class="n">บ.๑-๐๓</div><h1>สมุดส่งหนังสือ</h1><div style="text-align:center;margin-bottom:3mm">เดือน' + esc(U.toThaiDigits(label(k))) + '</div>' +
        '<table><thead><tr><th style="width:8%">เลขทะเบียน</th><th style="width:9%">ลงวันที่</th><th style="width:9%">จาก</th><th style="width:13%">ถึง</th><th style="width:10%">หน่วยรับ</th><th style="width:10%">ผู้รับ</th><th style="width:10%">วันและเวลา</th><th>หมายเหตุ (เรื่อง)</th></tr></thead><tbody>' + body + '</tbody></table>' +
        '<script>document.fonts.ready.then(function(){setTimeout(function(){window.focus();window.print();},300)});<\/script></body></html>');
      m.close();
    };
  }

  /* ======================= ทะเบียนส่ง ======================= */
  A.views.out = function (el) {
    if (OS.rec) { if (!el.querySelector('#ofForm')) renderEditor(el); return; }
    const ui = OS.ui;
    let rows = A.outs();
    if (ui.st !== 'all') rows = rows.filter(function (r) { return r.status === ui.st; });
    if (ui.q) {
      const q = U.toArabic(ui.q).toLowerCase();
      rows = rows.filter(function (r) { return U.toArabic([r.docSuffix, r.subject, r.to, r.body].join(' ')).toLowerCase().indexOf(q) >= 0; });
    }
    rows.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
      if (a.status === 'issued') return numOf(b) - numOf(a);
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    el.innerHTML = '<div class="card"><div class="section-title">ทะเบียนหนังสือส่ง <span class="sub">' + rows.length + ' ฉบับ</span>' +
      '<span class="right"><button class="btn btn-sm btn-outline" id="olBook">พิมพ์ บ.1-03</button><button class="btn btn-sm btn-primary" id="olNew">+ ร่างบันทึกข้อความ</button></span></div>' +
      '<div class="toolbar"><input class="inp grow" id="olQ" placeholder="ค้นหา เลขที่ / เรื่อง / เรียน / เนื้อหา" value="' + esc(ui.q) + '"><select class="inp" id="olSt">' +
      A.opts([{ key: 'all', name: 'ทั้งหมด' }, { key: 'draft', name: 'ร่าง' }, { key: 'issued', name: 'ออกแล้ว' }], ui.st) + '</select></div>' +
      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>เลขที่</th><th>ลงวันที่</th><th>เรื่อง</th><th>เรียน</th><th>ใบแยก</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr class="clickable" data-oopen="' + esc(r.id) + '"><td class="nowrap">' + esc(r.docSuffix || '-') + '</td><td class="nowrap">' + esc(U.thDate(r.docDate, 'short')) + '</td><td>' + esc(r.subject || '(ยังไม่มีเรื่อง)') + '</td><td class="small">' + esc(r.to || '') + '</td>' +
            '<td class="c">' + ((r.attachments || []).length || '') + '</td><td><span class="badge ' + (r.status === 'issued' ? 'b-ok' : 'b-info') + '">' + (r.status === 'issued' ? 'ออกแล้ว' : 'ร่าง') + '</span></td>' +
            '<td class="nowrap"><button class="btn btn-sm btn-outline" data-ocopy="' + esc(r.id) + '">คัดลอก</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีหนังสือส่ง — กด "+ ร่างบันทึกข้อความ"</div>') +
      '<p class="hint" style="margin-top:10px">ดับเบิลคลิกแถวเพื่อเปิด · คัดลอกจะได้ร่างใหม่ที่ไม่มีเลขที่ วันที่ และรูป</p></div>';
    $('olNew').onclick = newDialog;
    $('olBook').onclick = printBook;
    const q = $('olQ');
    q.oninput = function () { ui.q = q.value; clearTimeout(q._t); q._t = setTimeout(function () { A.render(); const n = $('olQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    $('olSt').onchange = function () { ui.st = this.value; A.render(); };
    el.querySelectorAll('[data-oopen]').forEach(function (tr) { tr.ondblclick = function () { openRec(tr.dataset.oopen); }; });
    el.querySelectorAll('[data-ocopy]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); copyRec(b.dataset.ocopy); };
      b.ondblclick = function (e) { e.stopPropagation(); };
    });
  };

  function newDialog() {
    const T = D.OUT_TEMPLATES;
    const m = A.modal({
      title: 'เลือกแบบบันทึกข้อความ', size: '',
      body: '<div class="grid grid-2"><button class="btn btn-outline" style="white-space:normal;justify-content:flex-start;text-align:left" data-tp="">เริ่มจากหน้าว่าง</button>' +
        T.map(function (t) { return '<button class="btn btn-outline" style="white-space:normal;justify-content:flex-start;text-align:left" data-tp="' + esc(t.id) + '">' + esc(t.title) + '</button>'; }).join('') + '</div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button>'
    });
    document.querySelectorAll('[data-tp]').forEach(function (b) {
      b.onclick = function () {
        const t = T.find(function (x) { return x.id === b.dataset.tp; });
        m.close(); startEdit(blankRec(t), true);
      };
    });
  }
  function openRec(id) {
    const r = A.outs().find(function (x) { return x.id === id; });
    if (r) startEdit(JSON.parse(JSON.stringify(r)), false);
  }
  function copyRec(id) {
    const r = A.outs().find(function (x) { return x.id === id; });
    if (!r) return;
    const c = JSON.parse(JSON.stringify(r));
    Object.assign(c, { id: newId(), status: 'draft', docSuffix: '', docDate: '', createdAt: new Date().toISOString(), createdBy: FBL.user.name, copiedFrom: r.id });
    delete c.updatedAt; delete c.updatedBy;
    (c.attachments || []).forEach(function (a) { a.images = []; });
    startEdit(c, true);
  }
  function startEdit(rec, dirty) {
    OS.rec = rec; OS.id = rec.id; OS.dirty = !!dirty;
    const el = $('view-out'); el.innerHTML = ''; renderEditor(el);
  }
  async function closeEditor() {
    if (OS.dirty && !(await A.confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกโดยไม่บันทึก?', 'ออกโดยไม่บันทึก', true))) return;
    OS.rec = null; OS.id = null; OS.dirty = false;
    $('view-out').innerHTML = ''; A.render();
  }

  /* ======================= หน้าร่าง ======================= */
  function setDirty() { OS.dirty = true; const h = $('ofDirty'); if (h) h.textContent = 'มีการแก้ไขที่ยังไม่บันทึก'; }
  function schedulePreview() { clearTimeout(OS.timer); OS.timer = setTimeout(renderPreview, 250); renderLint(); }
  // ตรวจถ้อยคำตามหลักการเขียนหนังสือราชการ — เตือนเท่านั้น ไม่แก้ข้อความให้
  function lintOf(r) {
    const out = [], all = [r.subject, r.to, r.body, r.closing].join('\n');
    String(r.body || '').split('\n').forEach(function (p) {
      const t = p.trim();
      if (/^(ด้วย|เนื่องจาก)/.test(t) && /นั้น\s*$/.test(t)) out.push('ย่อหน้าที่ขึ้นต้นด้วย "ด้วย/เนื่องจาก" ไม่ปิดด้วยคำว่า "นั้น": ' + t.slice(0, 30) + '...');
    });
    if (/\.{3,}/.test(all)) out.push('ยังมีจุดไข่ปลาที่ต้องกรอก');
    if (/ข้าฯ/.test(all)) out.push('ไม่เขียนคำว่า "ข้าพเจ้า" ย่อเป็น "ข้าฯ"');
    return out;
  }
  function renderLint() {
    const el = $('ofLint');
    if (!el || !OS.rec) return;
    const L = lintOf(OS.rec);
    el.innerHTML = L.map(function (x) { return '<div class="hint" style="color:var(--warn)">• ' + esc(x) + '</div>'; }).join('');
  }
  async function renderPreview() {
    const box = $('ofPreview');
    if (!box || !OS.rec) return;
    const b = await buildAll(OS.rec);
    const avail = box.clientWidth - 16;
    const zoom = Math.min(1, avail / (297 * 96 / 25.4));
    const pz = Math.min(1, avail / (210 * 96 / 25.4));
    box.innerHTML = '<style>' + b.css + '.ob-prev{margin:0 auto 10px;box-shadow:0 2px 10px rgba(0,0,0,.25);width:max-content}</style>' +
      b.sheets.map(function (s) { return '<div class="ob-prev" style="zoom:' + (/ob-sheet land/.test(s) ? zoom : pz).toFixed(3) + '">' + s + '</div>'; }).join('');
    const c = $('ofPages'); if (c) c.textContent = b.sheets.length + ' หน้า';
  }
  async function saveRec(summary) {
    const r = OS.rec;
    await FBL.save('out', r, summary || r.subject || 'ร่างบันทึกข้อความ');
    OS.dirty = false;
    const h = $('ofDirty'); if (h) h.textContent = '';
  }
  function renderEditor(el) {
    const r = OS.rec;
    const ppl = A.people().map(function (p) { return { key: p.id, name: A.personLabel(p) }; });
    el.innerHTML = '<div class="ws-head"><button class="btn btn-sm btn-outline" id="ofBack">← ทะเบียน</button><h2>' + (r.status === 'issued' ? 'หนังสือที่ ' + esc(r.docSuffix) : 'ร่างบันทึกข้อความ') + '</h2>' +
      '<span class="small muted" id="ofPages"></span><span class="hint" id="ofDirty">' + (OS.dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : '') + '</span>' +
      '<button class="btn btn-sm btn-danger" id="ofDel">ลบ</button></div>' +
      '<div class="ws"><div class="viewer card" style="padding:10px"><div class="pagebox" id="ofPreview"></div></div>' +
      '<div id="ofForm"><div class="card"><div class="section-title">บันทึกข้อความ</div>' +
      '<div class="grid grid-2">' +
      '<div class="field"><label>ที่</label><input value="' + esc(fullNo(r)) + '" disabled></div>' +
      '<div class="field"><label>ลงวันที่</label><input value="' + esc(U.thDate(r.docDate) || 'เว้นไว้ กรอกหลังลงนาม') + '" disabled></div>' +
      '<div class="field"><label>ชั้นความเร็ว</label><select data-o="urgency">' + A.opts(D.URGENCY, r.urgency || D.URGENCY[0]) + '</select></div>' +
      '<div class="field"></div>' +
      '<div class="field span-all"><label>เรื่อง</label><input data-o="subject" value="' + esc(r.subject) + '"></div>' +
      '<div class="field"><label>เรียน</label><input data-o="to" value="' + esc(r.to) + '"></div>' +
      '<div class="field"><label>ผ่าน (เว้นว่างได้)</label><input data-o="via" list="ofVia" value="' + esc(r.via) + '"><datalist id="ofVia">' + CFG.via.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field span-all"><label>เนื้อหา (ขึ้นบรรทัดใหม่ = ขึ้นย่อหน้าใหม่ ไม่ต้องเว้นวรรคเอง)</label><textarea data-o="body" rows="11">' + esc(r.body) + '</textarea><span class="hint">ปกติมี 3 ย่อหน้า: ที่มา (ด้วย.../เนื่องจาก... หรือถ้าตอบ ตามที่...นั้น) · ความประสงค์ · ย้ำความประสงค์ (คำลงท้าย)</span><div id="ofLint"></div></div>' +
      '<div class="field span-all"><label>คำลงท้าย</label><input data-o="closing" list="ofCl" value="' + esc(r.closing) + '"><datalist id="ofCl">' + D.OUT_CLOSINGS.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field span-all"><label>ผู้ลงนาม</label><select id="ofSigner">' + A.opts(ppl, r.signerId, 'กำหนดเอง') + '</select></div>' +
      '<div class="field"><label>ชื่อในวงเล็บ</label><input data-o="signerName" value="' + esc(r.signerName) + '"></div>' +
      '<div class="field"><label>ตำแหน่งใต้ชื่อ</label><input data-o="signerPos" value="' + esc(r.signerPos) + '"></div>' +
      '<div class="field span-all"><label><input type="checkbox" id="ofThai"' + (r.thaiDigits === false ? '' : ' checked') + '>แปลงตัวเลขทั้งฉบับเป็นเลขไทย</label></div></div></div>' +
      '<div class="card"><div class="section-title">ใบแยก <span class="sub">ใบแนบรูป/ผัง มีช่องลงนามของผู้ลงนามด้านล่างขวาทุกแผ่น</span><span class="right"><button class="btn btn-sm btn-outline" id="ofAddAtt">+ เพิ่มใบแยก</button></span></div><div id="ofAtts"></div></div>' +
      '<div class="flex" style="margin-bottom:16px"><button class="btn btn-primary" id="ofSave">บันทึก</button><button class="btn btn-outline" id="ofPrint">พิมพ์ / บันทึก PDF</button>' +
      (r.status === 'issued' ? '<button class="btn btn-outline" id="ofIssue">แก้เลขที่/วันที่</button><button class="btn btn-outline" id="ofUndo">กลับเป็นร่าง</button>' : '<button class="btn btn-gold" id="ofIssue">กรอกเลขที่หลังลงนาม</button>') +
      '</div><p class="hint">หน้าต่างพิมพ์ต้องตั้ง: A4 · ระยะขอบ "ไม่มี" · มาตราส่วน 100% · ปิดส่วนหัว/ท้าย</p></div></div>';

    el.querySelectorAll('[data-o]').forEach(function (i) {
      const onEdit = function () { r[i.dataset.o] = i.value; setDirty(); schedulePreview(); };
      i.addEventListener('input', onEdit);
      if (i.tagName === 'SELECT') i.addEventListener('change', onEdit);
    });
    renderLint();
    $('ofSigner').onchange = function () {
      const p = A.person(this.value);
      r.signerId = this.value;
      if (p) { Object.assign(r, signerOf(p)); el.querySelector('[data-o="signerName"]').value = r.signerName; el.querySelector('[data-o="signerPos"]').value = r.signerPos; }
      setDirty(); schedulePreview();
    };
    $('ofThai').onchange = function () { r.thaiDigits = this.checked; setDirty(); schedulePreview(); };
    $('ofBack').onclick = closeEditor;
    $('ofSave').onclick = async function () {
      const done = A.busy(this);
      try { await saveRec(); A.toast('บันทึกแล้ว'); } catch (e) { A.toast(e.message, true); }
      done();
    };
    $('ofPrint').onclick = async function () {
      if (!String(r.subject || '').trim()) return A.toast('กรอกเรื่องก่อนพิมพ์', true);
      const done = A.busy(this, 'กำลังเตรียม...');
      try { if (OS.dirty) await saveRec(); await printRec(r); } catch (e) { A.toast(e.message, true); }
      done();
    };
    $('ofIssue').onclick = issueDialog;
    if ($('ofUndo')) $('ofUndo').onclick = async function () {
      if (!(await A.confirm('กลับเป็นร่าง? เลขที่และวันที่จะถูกล้าง', 'กลับเป็นร่าง', true))) return;
      Object.assign(r, { status: 'draft', docSuffix: '', docDate: '' });
      try { await saveRec('กลับเป็นร่าง'); renderEditor(el); } catch (e) { A.toast(e.message, true); }
    };
    $('ofDel').onclick = async function () {
      if (!(await A.confirm('ย้ายฉบับนี้ไปถังขยะ? (กู้คืนได้ที่แท็บตั้งค่า)', 'ย้ายไปถังขยะ', true))) return;
      const saved = A.outs().some(function (x) { return x.id === r.id; });
      try { if (saved) await FBL.softDelete('out', r.id, r.subject || ''); OS.dirty = false; await closeEditor(); A.toast('ย้ายไปถังขยะแล้ว'); } catch (e) { A.toast(e.message, true); }
    };
    $('ofAddAtt').onclick = function () {
      (r.attachments = r.attachments || []).push({ id: newId(), title: '', subtitle: '', layout: 'two', images: [] });
      setDirty(); renderAtts(); schedulePreview();
    };
    renderAtts();
    renderPreview();
  }

  window.addEventListener('resize', function () { if (OS.rec && $('ofPreview')) schedulePreview(); });

  /* ---------- ใบแยก ---------- */
  const LAYOUTS = [{ key: 'one', name: '1 รูปต่อหน้า' }, { key: 'two', name: '2 รูปต่อหน้า' }, { key: 'land', name: 'ผังแนวนอน' }];
  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise(function (res, rej) { const i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.82); });
    } finally { URL.revokeObjectURL(url); }
  }
  function renderAtts() {
    const box = $('ofAtts'), r = OS.rec;
    const list = r.attachments || [];
    box.innerHTML = list.length ? list.map(function (a, i) {
      return '<div class="en-item" data-att="' + i + '"><div class="grid grid-2">' +
        '<div class="field span-all"><label>หัวเรื่อง</label><input data-a="title" value="' + esc(a.title) + '" placeholder="เช่น ภาพถ่ายจุดที่ 1 / ผังแสดงตำแหน่งและทิศทาง"></div>' +
        '<div class="field span-all"><label>รายละเอียดใต้หัวเรื่อง</label><input data-a="subtitle" value="' + esc(a.subtitle) + '" placeholder="เช่น ทางหลวงหมายเลข 3139 ตอน ... ช่วง กม. ..."></div>' +
        '<div class="field"><label>รูปแบบหน้า</label><select data-a="layout">' + A.opts(LAYOUTS, a.layout) + '</select></div>' +
        '<div class="field"><label>รูป (เลือกได้หลายรูป)</label><input type="file" data-img accept="image/*" multiple></div></div>' +
        '<div class="flex" style="margin-top:8px">' + (a.images || []).map(function (im, j) {
          return '<span class="chip">' + esc(im.name) + ' <a href="#" data-rmimg="' + j + '" title="เอาออก">×</a></span>';
        }).join('') + '<button class="btn btn-sm btn-danger" data-rmatt style="margin-left:auto">ลบใบแยกนี้</button></div></div>';
    }).join('') : '<div class="empty" style="padding:12px">ยังไม่มีใบแยก</div>';
    box.querySelectorAll('[data-att]').forEach(function (card) {
      const a = list[+card.dataset.att];
      card.querySelectorAll('[data-a]').forEach(function (i) {
        i.addEventListener('input', function () { a[i.dataset.a] = i.value; setDirty(); schedulePreview(); });
      });
      card.querySelector('[data-img]').onchange = async function () {
        const files = Array.from(this.files);
        this.disabled = true; A.toast('กำลังอัปโหลดรูป...');
        try {
          for (const f of files) {
            if (!/^image\//.test(f.type)) { A.toast(f.name + ' ไม่ใช่ไฟล์รูป', true); continue; }
            const blob = await compress(f);
            const path = 'letters/' + r.id + '/out-' + newId() + '.jpg';
            await FBL.uploadFile(path, blob);
            (a.images = a.images || []).push({ path: path, name: f.name, type: 'image/jpeg', size: blob.size });
          }
          setDirty();
        } catch (e) { A.toast(e.message, true); }
        renderAtts(); renderPreview();
      };
      card.querySelectorAll('[data-rmimg]').forEach(function (x) {
        x.onclick = function (e) { e.preventDefault(); a.images.splice(+x.dataset.rmimg, 1); setDirty(); renderAtts(); schedulePreview(); };
      });
      card.querySelector('[data-rmatt]').onclick = function () { list.splice(+card.dataset.att, 1); setDirty(); renderAtts(); schedulePreview(); };
    });
  }

  /* ---------- กรอกเลขที่และวันที่หลังลงนาม ---------- */
  function issueDialog() {
    const r = OS.rec, last = lastNo();
    const m = A.modal({
      title: 'กรอกเลขที่และวันที่หลังลงนาม', size: 'narrow',
      body: '<div class="field"><label>เลขที่ต่อจาก ' + esc(CFG.docPrefix) + '</label><input id="oiNo" inputmode="numeric" value="' + esc(r.docSuffix) + '" placeholder="เช่น 365"><span class="hint">' + (last ? 'เลขล่าสุดในทะเบียนนี้: ' + last : 'ยังไม่มีเลขในทะเบียนนี้') + ' — ถ้าคนอื่นใช้สมุดเล่มเดียวกัน ให้ดูเลขจากสมุด</span></div>' +
        '<div class="field" style="margin-top:10px"><label>ลงวันที่</label><input type="date" id="oiDate" value="' + esc(r.docDate || U.today()) + '"></div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="oiOk">บันทึก</button>'
    });
    m.q('#oiOk').onclick = async function () {
      const no = U.toArabic(m.q('#oiNo').value).trim(), dt = m.q('#oiDate').value;
      if (!no) return A.toast('กรอกเลขที่ก่อน', true);
      if (!dt) return A.toast('เลือกวันที่ก่อน', true);
      const dup = issued().find(function (x) { return x.id !== r.id && U.toArabic(x.docSuffix) === no && String(x.docDate || '').slice(0, 4) === dt.slice(0, 4); });
      if (dup && !(await A.confirm('เลขที่ ' + no + ' ถูกใช้แล้วกับเรื่อง "' + (dup.subject || '') + '" ยืนยันใช้ซ้ำ?', 'ยืนยัน', true))) return;
      Object.assign(r, { status: 'issued', docSuffix: no, docDate: dt, issuedAt: new Date().toISOString() });
      const done = A.busy(this);
      try { await saveRec('ออกเลข ' + no); m.close(); renderEditor($('view-out')); A.toast('บันทึกเลขที่แล้ว'); } catch (e) { done(); A.toast(e.message, true); }
    };
  }
})();
