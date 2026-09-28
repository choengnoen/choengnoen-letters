/* ==========================================================================
   app-letter.js — หน้าทำงานกับหนังสือ 1 ฉบับ
     ซ้าย: ภาพต้นฉบับ (ลากกรอบเกษียณวางได้) · ขวา: สรุป/ข้อมูล · QR & ลิงก์ · เกษียณ & พิมพ์ · ตรวจหลังพิมพ์ · ประวัติ
   ========================================================================== */
(function () {
  'use strict';
  const A = window.App, S = A.S, D = window.LTR_DATA, esc = U.esc, $ = A.$;
  const LS = { id: null, rec: null, doc: null, loading: false, page: 0, sub: 'sum', en: null, dirty: false, showQR: true, testPrinted: false, busy: '' };
  A.LS = LS;

  /* ======================= เปิดหนังสือ ======================= */
  A.openLetter = async function (id, opt) {
    opt = opt || {};
    const l = A.letter(id);
    if (!l) return A.toast('ไม่พบหนังสือ', true);
    const fresh = LS.id !== id;
    if (fresh) {
      Object.assign(LS, { id: id, rec: JSON.parse(JSON.stringify(l)), doc: null, files: [], page: 0, sub: opt.sub || 'sum', en: null, dirty: false, testPrinted: false, busy: '', lastPrintedId: null });
    }
    S.openId = id;
    $('tabLetter').style.display = '';
    $('tabLetter').textContent = 'หนังสือ ' + (l.regNo || '');
    A.go('letter');
    if (fresh) renderAll();
    if (!LS.doc && !LS.loading) {
      LS.loading = true;
      try {
        const files = [];
        for (const f of (l.files || [])) {
          const blob = await FBL.fileBlob(f.path);
          if (blob) files.push({ blob: blob, name: f.name, type: f.type || blob.type });
        }
        LS.files = files;
        LS.doc = files.length ? await DOC.open(files) : { pages: [], text: '', pdfLinks: [] };
      } catch (e) { A.toast('เปิดไฟล์ไม่สำเร็จ: ' + e.message, true); LS.doc = { pages: [], text: '', pdfLinks: [] }; }
      LS.loading = false;
      if (LS.id !== id) return;
      renderAll();
      if (opt.autoAnalyze) autoAnalyze();
    }
  };
  async function autoAnalyze() {
    await runLocal(true);
    const c = AI.cfg();
    if (c.auto && AI.ready() && !isSecret()) await runAI(true);
  }
  function isSecret() {
    return !!LS.rec.secrecy || /(^|\s)(ลับ|ลับมาก|ลับที่สุด)(\s|$)/.test((LS.doc && LS.doc.text || '').slice(0, 400));
  }
  // ข้อมูลในฐานข้อมูลเปลี่ยน (เช่น บันทึกเสร็จ หรือคนอื่นแก้) → อัปเดตถ้าไม่มีการแก้ค้าง
  A.views.letterRefresh = function () {
    const l = A.letter(LS.id);
    if (!l || l.deletedAt) { S.openId = null; LS.id = null; $('tabLetter').style.display = 'none'; A.go('list'); return; }
    if (!LS.dirty) { LS.rec = JSON.parse(JSON.stringify(l)); renderPanel(); drawViewer(); }
  };
  A.views.letter = function () { renderAll(); };

  async function save(summary, historyText) {
    if (historyText) (LS.rec.history = LS.rec.history || []).push({ at: new Date().toISOString(), by: FBL.user.name, what: historyText });
    LS.dirty = false;
    try { await A.saveLetter(LS.rec, summary); } catch (e) { LS.dirty = true; A.toast(e.message, true); throw e; }
  }
  function curPage() { return LS.doc && LS.doc.pages[LS.page]; }

  /* ======================= โครงหน้า ======================= */
  function renderAll() {
    const el = $('view-letter');
    if (!LS.rec) { el.innerHTML = ''; return; }
    const r = LS.rec;
    el.innerHTML = '<div class="ws-head"><button class="btn btn-sm btn-outline" id="lwBack">← ทะเบียน</button>' +
      '<h2 id="lwTitle"></h2>' +
      '<span id="lwBadges"></span>' +
      '<select class="inp" id="lwStatus" style="width:auto">' + A.opts(Object.keys(D.STATUS).map(function (k) { return { key: k, name: D.STATUS[k].name }; }), r.status) + '</select>' +
      '<button class="btn btn-sm btn-danger" id="lwDel">ลบ</button></div>' +
      '<div class="ws"><div class="viewer card" style="padding:12px" id="lwViewer"></div><div id="lwPanel"></div></div>';
    $('lwBack').onclick = function () { A.go('list'); };
    $('lwStatus').onchange = async function () {
      LS.rec.status = this.value;
      await save('เปลี่ยนสถานะ', 'เปลี่ยนสถานะเป็น "' + D.STATUS[this.value].name + '"');
    };
    $('lwDel').onclick = async function () {
      if (!(await A.confirm('ย้ายหนังสือนี้ไปถังขยะ? (กู้คืนได้ที่แท็บตั้งค่า)', 'ย้ายไปถังขยะ', true))) return;
      try { await FBL.softDelete('letters', LS.id, LS.rec.regNo); A.toast('ย้ายไปถังขยะแล้ว'); } catch (e) { A.toast(e.message, true); }
    };
    renderViewerShell();
    renderPanel();
  }
  function badges() {
    const r = LS.rec, due = A.dueInfo(r);
    return A.urgBadge(r.urgency) + ' ' + (r.secrecy ? '<span class="badge b-bad">' + esc(r.secrecy) + '</span> ' : '') +
      (due ? '<span class="badge ' + due.cls + '">กำหนดส่ง ' + esc(due.text) + '</span>' : '');
  }

  /* ======================= ภาพต้นฉบับ ======================= */
  function renderViewerShell() {
    const v = $('lwViewer');
    if (!v) return;
    if (LS.loading || !LS.doc) { v.innerHTML = '<div class="empty"><span class="page-loading-spin" style="display:inline-block"></span><br>กำลังเปิดไฟล์...</div>'; return; }
    const n = LS.doc.pages.length;
    if (!n) { v.innerHTML = '<div class="empty">ไม่มีไฟล์ต้นฉบับ</div>'; return; }
    v.innerHTML = '<div class="vbar"><button class="btn btn-sm btn-outline" id="pgPrev">◀</button><span class="small">หน้า <b id="pgNo"></b> / ' + n + '</span>' +
      '<button class="btn btn-sm btn-outline" id="pgNext">▶</button>' +
      '<button class="btn btn-sm btn-outline" id="zmOut" title="ย่อ">−</button><button class="btn btn-sm btn-outline" id="zmIn" title="ขยาย">+</button><span style="flex:1"></span>' +
      '<label class="small flex" style="gap:4px"><input type="checkbox" id="pgQR"' + (LS.showQR ? ' checked' : '') + '> แสดง QR</label>' +
      '<button class="btn btn-sm btn-outline" id="pgOpen" title="เปิดไฟล์ต้นฉบับ">เปิดไฟล์</button></div>' +
      '<div class="pagebox" id="pgBox"><canvas id="pgCv"></canvas></div>' +
      '<p class="hint" style="margin:6px 0 0">กรอบสีน้ำเงิน = เกษียณที่กำลังทำ (ลากย้ายได้ · กลายเป็น<b style="color:var(--bad)">สีแดง</b>เมื่อทับข้อความ) · กรอบเทาประ = เกษียณที่พิมพ์แล้ว · กรอบส้ม = QR Code</p>';
    $('pgPrev').onclick = function () { if (LS.page > 0) { LS.page--; onPageChange(); } };
    $('pgNext').onclick = function () { if (LS.page < n - 1) { LS.page++; onPageChange(); } };
    $('pgQR').onchange = function () { LS.showQR = this.checked; drawViewer(); };
    $('zmIn').onclick = function () { LS.zoom = Math.min(3, (LS.zoom || 1) * 1.25); drawViewer(); };
    $('zmOut').onclick = function () { LS.zoom = Math.max(1, (LS.zoom || 1) / 1.25); drawViewer(); };
    $('pgOpen').onclick = function () { if (LS.files && LS.files[0]) window.open(URL.createObjectURL(LS.files[0].blob), '_blank', 'noopener'); };
    bindDrag();
    drawViewer();
    if (window.ResizeObserver) {
      let lastW = 0;
      new ResizeObserver(function (en) { const w = Math.round(en[0].contentRect.width); if (w !== lastW) { lastW = w; drawViewerThrottled(); } }).observe($('pgBox'));
    }
  }
  let rzT = null;
  function drawViewerThrottled() { clearTimeout(rzT); rzT = setTimeout(drawViewer, 120); }
  function onPageChange() {
    if (LS.en) { LS.en.page = LS.page; }
    drawViewer();
    if (LS.sub === 'en') { syncEnInputs(); updateChecks(); }
  }
  let VS = { s: 1 };   // พิกเซลบนจอต่อ มม.
  function drawViewer() {
    const cv = $('pgCv'), p = curPage();
    if (!cv || !p) return;
    $('pgNo').textContent = LS.page + 1;
    const box = $('pgBox');
    const avail = Math.max(260, box.clientWidth - 22);
    const s = Math.min(avail / p.wMm, 4.5) * (LS.zoom || 1);
    VS.s = s;
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = (p.wMm * s) + 'px'; cv.style.height = (p.hMm * s) + 'px';
    cv.width = Math.round(p.wMm * s * dpr); cv.height = Math.round(p.hMm * s * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(p.canvas, 0, 0, p.wMm * s, p.hMm * s);
    // ขอบที่เครื่องพิมพ์พิมพ์ไม่ถึง
    ctx.save(); ctx.strokeStyle = 'rgba(193,64,47,.25)'; ctx.setLineDash([3, 4]);
    ctx.strokeRect(EN.SAFE_MARGIN * s, EN.SAFE_MARGIN * s, (p.wMm - 2 * EN.SAFE_MARGIN) * s, (p.hMm - 2 * EN.SAFE_MARGIN) * s); ctx.restore();
    // เกษียณที่พิมพ์แล้ว
    (LS.rec.endorsements || []).forEach(function (e) {
      if (e.page !== LS.page || e.status !== 'printed' || (LS.en && e.id === LS.en.id)) return;
      EN.draw(ctx, layoutOf(e), e.x, e.y, s, { stroke: '#8792a0', dash: [5, 4], fill: 'rgba(135,146,160,.08)', color: 'rgba(60,60,60,.55)' });
    });
    if (LS.showQR) (LS.rec.links || []).forEach(function (k) {
      if (k.source !== 'qr' || k.page !== LS.page + 1) return;
      ctx.save(); ctx.strokeStyle = '#e0620f'; ctx.lineWidth = 2; ctx.strokeRect(k.xMm * s - 3, k.yMm * s - 3, k.wMm * s + 6, k.hMm * s + 6); ctx.restore();
    });
    if (LS.en && LS.en.page === LS.page && LS.sub === 'en') {
      const L = layoutOf(LS.en), c = checkBox(L);
      EN.draw(ctx, L, LS.en.x, LS.en.y, s, c.bad ? { stroke: '#c1402f', fill: 'rgba(193,64,47,.12)' } : {});
      // จุดหมึกที่ทับ
      if (c.inkCells.length) { ctx.fillStyle = 'rgba(193,64,47,.55)'; c.inkCells.forEach(function (q) { ctx.fillRect(q[0] * s, q[1] * s, s, s); }); }
    }
  }
  function bindDrag() {
    const cv = $('pgCv');
    let drag = null;
    cv.addEventListener('pointerdown', function (e) {
      if (!LS.en || LS.sub !== 'en' || LS.en.page !== LS.page) return;
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) / VS.s, y = (e.clientY - r.top) / VS.s;
      const L = layoutOf(LS.en);
      const inside = x >= LS.en.x - 2 && x <= LS.en.x + L.wMm + 2 && y >= LS.en.y - 2 && y <= LS.en.y + L.hMm + 2;
      // คลิกนอกกรอบ = ย้ายกรอบไปที่จุดนั้น · คลิกในกรอบ = ลาก
      if (!inside) { LS.en.x = round(x); LS.en.y = round(y); LS.dirty = true; drawViewer(); syncEnInputs(); updateChecks(); }
      drag = { dx: x - LS.en.x, dy: y - LS.en.y };
      cv.setPointerCapture(e.pointerId); cv.classList.add('drag');
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const r = cv.getBoundingClientRect();
      LS.en.x = round((e.clientX - r.left) / VS.s - drag.dx);
      LS.en.y = round((e.clientY - r.top) / VS.s - drag.dy);
      LS.dirty = true;
      drawViewer(); syncEnInputs();
    });
    const up = function () { if (drag) { drag = null; cv.classList.remove('drag'); updateChecks(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  function round(v) { return Math.round(v * 2) / 2; }

  /* ======================= แผงขวา ======================= */
  const SUBS = [['sum', 'สรุป / ข้อมูล'], ['qr', 'QR & ลิงก์'], ['en', 'เกษียณ & พิมพ์'], ['verify', 'ตรวจหลังพิมพ์'], ['hist', 'ประวัติ']];
  function renderPanel() {
    const el = $('lwPanel'); if (!el) return;
    const b = $('lwBadges'); if (b) b.innerHTML = badges();
    const t = $('lwTitle'); if (t) t.textContent = (LS.rec.regNo || '') + ' · ' + (LS.rec.subject || '(ยังไม่ได้อ่านเรื่อง)');
    const st = $('lwStatus'); if (st) st.value = LS.rec.status || 'new';
    const nl = (LS.rec.links || []).length;
    el.innerHTML = '<div class="subtabs">' + SUBS.map(function (x) {
      return '<button class="subtab' + (LS.sub === x[0] ? ' active' : '') + '" data-sub="' + x[0] + '">' + x[1] + (x[0] === 'qr' && nl ? ' (' + nl + ')' : '') + '</button>';
    }).join('') + '</div><div id="lwSub"></div>';
    el.querySelectorAll('[data-sub]').forEach(function (t) { t.onclick = function () { LS.sub = t.dataset.sub; renderPanel(); drawViewer(); }; });
    ({ sum: panelSum, qr: panelQR, en: panelEn, verify: panelVerify, hist: panelHist })[LS.sub]($('lwSub'));
  }

  /* ---------------- สรุป / ข้อมูล ---------------- */
  function panelSum(el) {
    const r = LS.rec, ai = r.ai || null;
    const typeOpts = Object.keys(D.TYPES).map(function (k) { return { key: k, name: D.TYPES[k].name }; });
    const ppl = A.people().map(function (p) { return { key: p.id, name: A.personLabel(p) }; });
    el.innerHTML = '<div class="card"><div class="section-title">อ่าน & วิเคราะห์หนังสือ</div>' +
      '<div class="flex"><button class="btn btn-sm btn-outline" id="suLocal">📄 อ่านข้อความ + QR (ไม่ใช้ AI)</button>' +
      '<button class="btn btn-sm btn-outline" id="suOcr">🔍 OCR ภาพสแกน</button>' +
      '<button class="btn btn-sm btn-primary" id="suAI">🤖 AI วิเคราะห์ทั้งหมด</button>' +
      '<button class="btn btn-sm btn-outline" id="suReply">✉️ ร่างหนังสือตอบ (AI)</button></div>' +
      '<p class="hint" style="margin:8px 0 0">' + (LS.busy ? '<b>' + esc(LS.busy) + '</b>' :
        (AI.ready() ? 'AI พร้อมใช้ (' + esc(AI.cfg().model) + ')' : 'ยังไม่ได้ตั้งค่า AI — ปุ่ม 🤖 ใช้ไม่ได้ (ตั้งที่แท็บ "AI ช่วยงาน")') +
        (ai ? ' · วิเคราะห์ล่าสุด ' + esc((ai.at || '').slice(0, 16).replace('T', ' ')) : '')) + '</p></div>' +
      (ai ? '<div class="card"><div class="section-title">🤖 ผลวิเคราะห์จาก AI <span class="sub">ตรวจทานก่อนใช้ทุกครั้ง</span></div>' +
        (ai.keyPoints && ai.keyPoints.length ? '<b class="small">ประเด็นสำคัญ</b><ul class="small" style="margin:4px 0 10px">' + ai.keyPoints.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        (ai.actions && ai.actions.length ? '<b class="small">สิ่งที่ต้องดำเนินการ</b><div class="table-wrap" style="margin:4px 0 10px"><table class="data"><tbody>' + ai.actions.map(function (x) {
          return '<tr><td>' + esc(x.what) + (x.how ? '<br><span class="muted small">' + esc(x.how) + '</span>' : '') + '</td><td class="nowrap">' + (x.deadline ? esc(U.thDate(x.deadline, 'short')) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
        (ai.assigneeReason ? '<p class="small" style="margin:0 0 8px"><b>ผู้รับผิดชอบที่แนะนำ:</b> ' + esc((D.ROLES[ai.assigneeRole] || {}).name || '') + ' — ' + esc(ai.assigneeReason) + '</p>' : '') +
        (ai.cautions && ai.cautions.length ? '<div class="alert warn"><span class="ic">⚠️</span><span>' + ai.cautions.map(esc).join('<br>') + '</span></div>' : '') + '</div>' : '') +
      '<div class="card"><div class="section-title">ข้อมูลหนังสือ</div><div class="grid grid-2">' +
      fld('regNo', 'เลขทะเบียนรับ') + fld('receivedDate', 'วันที่รับ', 'date') +
      fld('docNo', 'ที่ (เลขที่หนังสือ)') + fld('docDate', 'ลงวันที่', 'date') +
      fld('from', 'จาก (หน่วยงานผู้ส่ง)') + fld('to', 'เรียน') +
      '<div class="field span-all"><label>เรื่อง</label><input data-k="subject" value="' + esc(r.subject) + '"></div>' +
      '<div class="field"><label>ความเร่งด่วน</label><select data-k="urgency">' + A.opts(D.URGENCY, r.urgency || 'ปกติ') + '</select></div>' +
      '<div class="field"><label>ชั้นความลับ</label><select data-k="secrecy">' + A.opts(['ลับ', 'ลับมาก', 'ลับที่สุด'], r.secrecy, 'ไม่มี') + '</select></div>' +
      '<div class="field"><label>ประเภทหนังสือ</label><select data-k="type">' + A.opts(typeOpts, r.type || 'other') + '</select></div>' +
      '<div class="field"><label>กำหนดส่ง / ต้องเสร็จภายใน</label><input type="date" data-k="dueDate" value="' + esc(r.dueDate) + '"></div>' +
      '<div class="field span-all"><label>ผู้รับผิดชอบ</label><select data-k="assigneeId">' + A.opts(ppl, r.assigneeId, '— ยังไม่มอบหมาย —') + '</select></div>' +
      '<div class="field span-all"><label>สรุปเรื่อง</label><textarea data-k="summary" rows="4">' + esc(r.summary) + '</textarea></div>' +
      '<div class="field span-all"><label>สิ่งที่ขอให้ดำเนินการ (ใช้เติม {สรุป} ในเกษียณ — เขียนต่อจากคำว่า "ขอให้")</label><input data-k="request" value="' + esc(r.request) + '"></div>' +
      '<div class="field"><label>อ้างถึง</label><input data-k="refs" value="' + esc(r.refs) + '"></div>' +
      '<div class="field"><label>สิ่งที่ส่งมาด้วย</label><input data-k="attachments" value="' + esc(r.attachments) + '"></div></div>' +
      '<div class="flex" style="margin-top:12px"><button class="btn btn-primary" id="suSave">บันทึก</button><span class="hint" id="suDirty"></span></div></div>' +
      '<div class="card"><details><summary class="small" style="cursor:pointer">ข้อความที่อ่านได้จากไฟล์ (' + ((r.text || '').length) + ' ตัวอักษร)</summary>' +
      '<textarea class="inp" id="suText" rows="10" style="margin-top:8px">' + esc(r.text || '') + '</textarea></details></div>';
    el.querySelectorAll('[data-k]').forEach(function (i) {
      i.addEventListener('input', function () { LS.rec[i.dataset.k] = i.value; LS.dirty = true; $('suDirty').textContent = 'มีการแก้ไขที่ยังไม่บันทึก'; });
      i.addEventListener('change', function () { LS.rec[i.dataset.k] = i.value; LS.dirty = true; });
    });
    $('suText').oninput = function () { LS.rec.text = this.value; LS.dirty = true; };
    $('suSave').onclick = async function () {
      const done = A.busy(this);
      try { await save('แก้ไขข้อมูลหนังสือ', 'แก้ไขข้อมูล/สรุปเรื่อง'); A.toast('บันทึกแล้ว'); $('tabLetter').textContent = 'หนังสือ ' + (LS.rec.regNo || ''); renderAll(); } catch (e) { /* แจ้งแล้ว */ }
      done();
    };
    $('suLocal').onclick = function () { runLocal(false); };
    $('suOcr').onclick = runOcr;
    $('suAI').onclick = function () { runAI(false); };
    $('suReply').onclick = draftReply;
    ['suAI', 'suReply'].forEach(function (id) { if (!AI.ready()) $(id).disabled = true; });
    if (LS.busy) ['suLocal', 'suOcr', 'suAI', 'suReply'].forEach(function (id) { $(id).disabled = true; });
  }
  function fld(k, label, type) {
    return '<div class="field"><label>' + label + '</label><input ' + (type ? 'type="' + type + '" ' : '') + 'data-k="' + k + '" value="' + esc(LS.rec[k]) + '"></div>';
  }
  function setBusy(t) { LS.busy = t; if (LS.sub === 'sum' || LS.sub === 'qr') renderPanel(); }

  // อ่านข้อความจากไฟล์ + สแกน QR + หาลิงก์ แล้วเติมเฉพาะช่องที่ยังว่าง
  async function runLocal(silent) {
    if (!LS.doc || !LS.doc.pages.length) return;
    const r = LS.rec;
    LS.dirty = true;   // กันข้อมูลจากฐานข้อมูลทับระหว่างประมวลผล
    try {
      setBusy('กำลังอ่านข้อความและสแกน QR...');
      if (LS.doc.text && LS.doc.text.replace(/\s/g, '').length > 30) r.text = LS.doc.text;
      const p = U.parseLetterText(r.text || '');
      ['docNo', 'docDate', 'subject', 'to', 'from', 'refs', 'attachments', 'summary', 'request'].forEach(function (k) { if (!r[k] && p[k]) r[k] = p[k]; });
      if ((!r.urgency || r.urgency === 'ปกติ') && p.urgency) r.urgency = p.urgency;
      if (!r.secrecy && p.secrecy) r.secrecy = p.secrecy;
      if (!r.type || r.type === 'other') r.type = p.type;
      if (!r.dueDate && p.deadline) r.dueDate = p.deadline;
      const qrs = await DOC.scanQR(LS.doc.pages, function (i, n) { setBusy('กำลังสแกน QR หน้า ' + i + '/' + n + '...'); });
      mergeLinks(qrs.map(function (q) { return { url: q.data, source: 'qr', page: q.page, xMm: q.xMm, yMm: q.yMm, wMm: q.wMm, hMm: q.hMm, thumb: q.thumb }; }));
      mergeLinks(LS.doc.pdfLinks.map(function (k) { return { url: k.url, source: 'pdf', page: k.page }; }));
      mergeLinks(U.findUrls(r.text).map(function (u) { return { url: u, source: 'text' }; }));
      setBusy('');
      await save('อ่านข้อความ/QR', 'อ่านข้อความและสแกน QR (พบ ' + (r.links || []).length + ' ลิงก์)');
      if (!silent || qrs.length) A.toast('อ่านแล้ว' + (qrs.length ? ' · พบ QR ' + qrs.length + ' รหัส' : '') + ((r.text || '').length < 30 ? ' · ไม่มีข้อความในไฟล์ (ภาพสแกน) ลองกด OCR หรือ AI' : ''));
    } catch (e) { setBusy(''); A.toast(e.message, true); }
    renderPanel(); drawViewer();
  }
  function mergeLinks(list) {
    const r = LS.rec; r.links = r.links || [];
    list.forEach(function (k) {
      const key = String(k.url).replace(/\/$/, '');
      const ex = r.links.find(function (x) { return String(x.url).replace(/\/$/, '') === key; });
      if (ex) { if (k.source === 'qr' && ex.source !== 'qr') Object.assign(ex, k); if (k.purpose && !ex.purpose) ex.purpose = k.purpose; }
      else r.links.push(k);
    });
  }
  async function runOcr() {
    if (!LS.doc || !LS.doc.pages.length) return;
    LS.dirty = true;
    try {
      setBusy('กำลังโหลดตัวอ่าน OCR ภาษาไทย (ครั้งแรกใช้เวลาสักครู่)...');
      const t = await DOC.ocr(LS.doc.pages, function (i, n, pr) { setBusy('OCR หน้า ' + i + '/' + n + ' ' + Math.round((pr || 0) * 100) + '%'); });
      LS.rec.text = t;
      setBusy('');
      LS.doc.text = t;
      await runLocal(true);
      A.toast('OCR เสร็จ — ตรวจทานข้อความ (OCR อาจอ่านผิดบางคำ)');
    } catch (e) { setBusy(''); A.toast('OCR ไม่สำเร็จ: ' + e.message, true); }
  }
  function aiCtx() {
    return {
      org: A.settings().org || 'หมวดทางหลวงเชิงเนิน แขวงทางหลวงระยอง',
      people: A.people(), templates: A.templates(),
      qr: (LS.rec.links || []).filter(function (k) { return k.source === 'qr'; }).map(function (k) { return k.url; })
    };
  }
  async function runAI(silent) {
    if (!AI.ready()) return A.toast('ตั้งค่า AI ที่แท็บ "AI ช่วยงาน" ก่อน', true);
    if (!LS.files || !LS.files.length) return A.toast('ไม่มีไฟล์ให้ AI อ่าน', true);
    if (isSecret()) {
      if (silent) return;
      if (!(await A.confirm('หนังสือนี้อาจเป็นหนังสือชั้นความลับ\nการใช้ AI จะส่งไฟล์ไปประมวลผลภายนอกหน่วยงาน\n\nยืนยันว่าส่งได้?', 'ส่งให้ AI อ่าน', true))) return;
    }
    LS.dirty = true;
    try {
      setBusy('🤖 AI กำลังอ่านและวิเคราะห์หนังสือ (ประมาณ 20–60 วินาที)...');
      const res = await AI.analyze(LS.files, LS.doc.pages, aiCtx());
      const r = LS.rec;
      ['docNo', 'docDate', 'from', 'to', 'subject', 'summary', 'urgency', 'secrecy', 'type'].forEach(function (k) { if (res[k]) r[k] = res[k]; });
      if (res.deadline) r.dueDate = res.deadline;
      if (res.actions && res.actions[0]) r.request = res.actions[0].what;
      if (res.references && res.references.length) r.refs = res.references.join(' · ');
      if (res.attachments && res.attachments.length) r.attachments = res.attachments.join(' · ');
      if (!r.assigneeId && res.assigneeRole) {
        const p = A.people().find(function (x) { return x.role === res.assigneeRole; });
        if (p) r.assigneeId = p.id;
      }
      mergeLinks((res.links || []).map(function (k) { return { url: k.url, source: 'ai', purpose: k.purpose }; }));
      r.ai = { at: new Date().toISOString(), model: AI.cfg().model, keyPoints: res.keyPoints, actions: res.actions, cautions: res.cautions, assigneeRole: res.assigneeRole, assigneeReason: res.assigneeReason, endorse: res.endorse };
      setBusy('');
      await save('AI วิเคราะห์', 'AI วิเคราะห์หนังสือ (' + AI.cfg().model + ')');
      A.toast('AI วิเคราะห์เสร็จ — ตรวจทานข้อมูลก่อนใช้');
    } catch (e) { setBusy(''); A.toast(e.message, true); }
    renderPanel();
  }
  async function draftReply() {
    const me = A.me();
    const m = A.modal({
      title: 'ร่างหนังสือตอบต้นเรื่อง (AI)', size: 'wide',
      body: '<div class="grid grid-3"><div class="field"><label>รูปแบบ</label><select id="rpK">' + A.opts(['แบบบันทึกข้อความ (ภายในกรม)', 'แบบหนังสือภายนอก']) + '</select></div>' +
        '<div class="field span-2"><label>ผู้ลงนาม</label><select id="rpS">' + A.opts(A.people().map(function (p) { return { key: p.id, name: A.personLabel(p) }; }), me ? me.id : 'p-head') + '</select></div>' +
        '<div class="field span-all"><label>ประเด็นที่ต้องการตอบ (เช่น ส่งข้อมูลตามแบบแล้ว / ไม่มีข้อมูล / ขอขยายเวลา)</label><textarea id="rpP" rows="3"></textarea></div></div>' +
        '<div id="rpOut" style="margin-top:12px"></div>',
      foot: '<button class="btn btn-outline" data-close>ปิด</button><button class="btn btn-outline" id="rpCopy" disabled>คัดลอก</button><button class="btn btn-primary" id="rpGo">🤖 ร่าง</button>'
    });
    m.q('#rpGo').onclick = async function () {
      const done = A.busy(this, 'กำลังร่าง...');
      try {
        const p = A.person(m.q('#rpS').value);
        const t = await AI.draftReply(LS.files, LS.doc.pages, { org: aiCtx().org, kind: m.q('#rpK').value, signer: p ? A.fullName(p) + ' ' + p.position : '', point: m.q('#rpP').value });
        m.q('#rpOut').innerHTML = '<pre class="out" id="rpTxt">' + esc(t) + '</pre><p class="hint">ร่างนี้เป็นจุดเริ่มต้น — ตรวจข้อเท็จจริง เลขที่หนังสือ และถ้อยคำก่อนนำไปใช้</p>';
        m.q('#rpCopy').disabled = false;
        m.q('#rpCopy').onclick = function () { navigator.clipboard.writeText(t).then(function () { A.toast('คัดลอกแล้ว'); }); };
      } catch (e) { A.toast(e.message, true); }
      done();
    };
  }

  /* ---------------- QR & ลิงก์ ---------------- */
  function panelQR(el) {
    const links = LS.rec.links || [];
    el.innerHTML = '<div class="card"><div class="section-title">QR Code และลิงก์ที่แนบมากับหนังสือ' +
      '<span class="right"><button class="btn btn-sm btn-primary" id="qrScan"' + (LS.busy ? ' disabled' : '') + '>สแกน QR ทุกหน้า</button><button class="btn btn-sm btn-outline" id="qrAdd">+ เพิ่มลิงก์เอง</button></span></div>' +
      (LS.busy ? '<p class="hint"><b>' + esc(LS.busy) + '</b></p>' : '') +
      '<p class="hint" style="margin-top:0">ระบบ<b>ไม่เปิดลิงก์เอง</b> — ตรวจชื่อเว็บ (โดเมน) ก่อนกดเปิดทุกครั้ง · ✅ โดเมนหน่วยงานรัฐ .go.th · ⚠️ ลิงก์ย่อ/โดเมนทั่วไป ควรตรวจกับผู้ส่ง</p>' +
      (links.length ? links.map(function (k, i) {
        const info = U.linkInfo(k.url);
        const lv = { ok: ['b-ok', '✅ น่าเชื่อถือ'], info: ['b-info', 'ℹ️ บริการสาธารณะ'], warn: ['b-warn', '⚠️ ตรวจก่อนเปิด'], bad: ['b-bad', '⛔ ระวัง'], text: ['b-mute', 'ข้อความ'] }[info.level];
        const src = { qr: 'QR หน้า ' + k.page, pdf: 'ลิงก์ในไฟล์ หน้า ' + k.page, text: 'พบในข้อความ', ai: 'AI พบในเนื้อหา', manual: 'เพิ่มเอง' }[k.source] || '';
        return '<div class="qr-item">' + (k.thumb ? '<img src="' + k.thumb + '" alt="QR">' : '<div style="width:84px;height:84px;border-radius:6px;background:var(--paper-2);display:flex;align-items:center;justify-content:center;font-size:28px">🔗</div>') +
          '<div><div class="flex" style="gap:6px"><span class="badge ' + lv[0] + '">' + lv[1] + '</span><span class="muted small">' + esc(src) + '</span>' +
          (info.host ? '<b class="small">' + esc(info.host) + '</b>' : '') + '</div>' +
          '<div class="u" style="margin:4px 0">' + esc(k.url) + '</div>' +
          (k.purpose ? '<div class="small">🤖 ' + esc(k.purpose) + '</div>' : '') +
          '<div class="small muted">' + esc(info.note) + '</div>' +
          '<div class="flex" style="margin-top:6px">' + (info.url ? '<a class="btn btn-sm btn-outline" href="' + esc(info.url) + '" target="_blank" rel="noopener noreferrer">เปิดลิงก์ ↗</a>' : '') +
          '<button class="btn btn-sm btn-outline" data-cp="' + i + '">คัดลอก</button>' +
          (k.source === 'qr' ? '<button class="btn btn-sm btn-outline" data-see="' + i + '">ดูบนหน้า</button>' : '') +
          '<button class="btn btn-sm btn-ghost" data-rm="' + i + '">ลบ</button></div></div></div>';
      }).join('') : '<div class="empty">ยังไม่พบ QR/ลิงก์ — กด "สแกน QR ทุกหน้า"</div>') + '</div>' +
      '<div class="card guide"><div class="section-title">เมื่อ QR อ่านไม่ออก</div><ul class="small">' +
      '<li>สแกนต้นฉบับใหม่ที่ 300 dpi (QR ขนาดเล็กกว่า 1.5 ซม. ต้องใช้ความละเอียดสูง)</li>' +
      '<li>สำเนาถ่ายเอกสารหลายทอดทำให้ QR เบลอ — ขอไฟล์ PDF ต้นฉบับจากผู้ส่ง หรือดูลิงก์ในระบบสารบรรณอิเล็กทรอนิกส์</li>' +
      '<li>ใช้กล้องมือถือสแกนจากกระดาษโดยตรง แล้วกด "+ เพิ่มลิงก์เอง" เพื่อเก็บไว้ในทะเบียน</li></ul></div>';
    $('qrScan').onclick = function () { runLocal(false); };
    $('qrAdd').onclick = async function () {
      const m = A.modal({ title: 'เพิ่มลิงก์', size: 'narrow', body: '<div class="field"><label>ลิงก์</label><input id="lkU" placeholder="https://"></div><div class="field" style="margin-top:8px"><label>ใช้ทำอะไร</label><input id="lkP"></div>',
        foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="lkOk">เพิ่ม</button>' });
      m.q('#lkOk').onclick = async function () {
        const u = m.q('#lkU').value.trim(); if (!u) return;
        mergeLinks([{ url: u, source: 'manual', purpose: m.q('#lkP').value.trim() }]);
        m.close();
        try { await save('เพิ่มลิงก์', 'เพิ่มลิงก์ ' + u); } catch (e) { /* แจ้งแล้ว */ }
        renderPanel();
      };
    };
    el.querySelectorAll('[data-cp]').forEach(function (b) { b.onclick = function () { navigator.clipboard.writeText(links[+b.dataset.cp].url).then(function () { A.toast('คัดลอกแล้ว'); }); }; });
    el.querySelectorAll('[data-see]').forEach(function (b) { b.onclick = function () { LS.page = links[+b.dataset.see].page - 1; LS.showQR = true; const q = $('pgQR'); if (q) q.checked = true; drawViewer(); }; });
    el.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = async function () {
        LS.rec.links.splice(+b.dataset.rm, 1);
        try { await save('ลบลิงก์'); } catch (e) { /* แจ้งแล้ว */ }
        renderPanel(); drawViewer();
      };
    });
  }

  /* ---------------- เกษียณ & พิมพ์ ---------------- */
  const PREF_KEY = 'ltr_enpref';
  function prefs() { return U.lsGet(PREF_KEY, { fontKey: 'TH SarabunIT๙', pt: 16, lineF: 1.15, w: 85, dateStyle: 'short', thaiDigits: false, anchor: 'next' }); }
  function newDraft() {
    const pf = prefs(), me = A.me() || A.people()[0] || null;
    const e = {
      id: 'e' + Date.now().toString(36), status: 'draft', page: LS.page, x: 20, y: 200, w: pf.w,
      signerId: me ? me.id : '', date: U.today(), dateStyle: pf.dateStyle, thaiDigits: pf.thaiDigits,
      fontKey: pf.fontKey, pt: pf.pt, lineF: pf.lineF, sig: true, tplId: '', tplRaw: '', manual: false,
      assignId: LS.rec.assigneeId || '', toText: '', replyNo: '', text: ''
    };
    e.toText = defaultTo(e.signerId);
    const g = groupOf(e.signerId), sug = suggested(g);
    if (sug) applyTpl(e, sug); else e.text = 'เรียน ' + e.toText + '\n     ';
    return e;
  }
  function groupOf(signerId) { const p = A.person(signerId); return p && D.ROLES[p.role] ? D.ROLES[p.role].group : 'propose'; }
  function defaultTo(signerId) {
    const p = A.person(signerId), boss = p && A.person(p.reportsTo);
    return boss ? (boss.abbr || boss.position) : '';
  }
  function suggested(group) {
    const t = D.TYPES[LS.rec.type || 'other'] || D.TYPES.other;
    return A.templates().find(function (x) { return x.id === t.suggest[group]; }) || A.templates().find(function (x) { return x.group === group; });
  }
  function vars(e) {
    const r = LS.rec, asg = A.person(e.assignId);
    const req = (r.request || (r.ai && r.ai.actions && r.ai.actions[0] && r.ai.actions[0].what) || r.subject || '').replace(/^ขอให้\s*/, '');
    return {
      'เรียน': e.toText, 'ผู้รับมอบ': asg ? ((A.fullName(asg) ? A.fullName(asg) + ' ' : '') + (asg.abbr || asg.position)).trim() : '',
      'เรื่อง': r.subject || '', 'สรุป': req, 'กำหนดส่ง': U.thDate(r.dueDate, 'long', e.thaiDigits), 'จาก': r.from || '',
      'เลขที่': r.docNo || '', 'ลงวันที่': U.thDate(r.docDate, 'long', e.thaiDigits), 'เลขที่ตอบ': e.replyNo || ''
    };
  }
  function applyTpl(e, t) { e.tplId = t.id; e.tplRaw = t.text; e.manual = false; e.text = EN.fill(t.text, vars(e)); }
  function refill(e) { if (e.tplRaw && !e.manual) e.text = EN.fill(e.tplRaw, vars(e)); }
  function layoutOf(e) {
    const p = A.person(e.signerId);
    return EN.layout({
      text: e.text, wMm: e.w, pt: e.pt, lineF: e.lineF, fontKey: e.fontKey,
      sig: { show: e.sig !== false, name: A.fullName(p), pos: p ? p.position : '', date: U.thDate(e.date, e.dateStyle, e.thaiDigits) }
    });
  }
  function occupied(page, exceptId) {
    return (LS.rec.endorsements || []).filter(function (o) { return o.page === page && o.status === 'printed' && o.id !== exceptId; })
      .map(function (o) { const L = layoutOf(o); return { x: o.x, y: o.y, w: L.wMm, h: L.hMm }; });
  }
  function checkBox(L) {
    const e = LS.en, p = curPage();
    const box = { x: e.x, y: e.y, w: L.wMm, h: L.hMm };
    const out = { items: [], bad: false, inkCells: [] };
    if (!p) return out;
    const ink = DOC.inkInBox(p, box);
    out.inkCells = ink.ratio > 0 ? ink.cells : [];
    const add = function (lv, t) { out.items.push([lv, t]); if (lv === 'bad') out.bad = true; };
    if (ink.ratio === 0) add('ok', 'ไม่ทับข้อความ/ตรายางเดิมบนภาพสแกน');
    else if (ink.ratio < 0.015) add('warn', 'แตะหมึกเดิมเล็กน้อย (' + ink.cells.length + ' จุด) — ขยับออกเล็กน้อย');
    else add('bad', 'ทับข้อความเดิม ' + Math.round(ink.ratio * 100) + '% ของกรอบ — ย้ายตำแหน่ง หรือกด "หาที่ว่างอัตโนมัติ"');
    if (occupied(e.page, e.id).some(function (o) { return DOC.boxesOverlap(box, o, 1); })) add('bad', 'ทับเกษียณที่พิมพ์ไปแล้วบนหน้านี้');
    const m = EN.SAFE_MARGIN;
    if (box.x < m || box.y < m || box.x + box.w > p.wMm - m || box.y + box.h > p.hMm - m) add('bad', 'ออกนอกขอบที่เครื่องพิมพ์พิมพ์ได้ (ต้องห่างขอบกระดาษ ≥ ' + m + ' มม.)');
    else if (box.x < 10 || box.y < 10 || box.x + box.w > p.wMm - 10 || box.y + box.h > p.hMm - 10) add('warn', 'ชิดขอบกระดาษ (< 10 มม.) — ถ้ากระดาษเยื้องอาจตกขอบ');
    else add('ok', 'อยู่ในขอบพิมพ์ได้');
    const pc = EN.printerCfg();
    add(pc.calibratedAt ? 'ok' : 'warn', pc.calibratedAt ? 'ปรับเทียบเครื่องพิมพ์แล้ว (' + esc(pc.name || 'เครื่องนี้') + ')' : 'ยังไม่ปรับเทียบเครื่องพิมพ์ — ตำแหน่งอาจคลาด 2–5 มม.');
    const sg = A.person(e.signerId);
    if (!sg) add('bad', 'ยังไม่เลือกผู้ลงนาม');
    else if (!sg.name) add('warn', 'ผู้ลงนามยังไม่มีชื่อ — กรอกที่แท็บบุคลากร/ตำแหน่ง');
    if (/\.{6,}/.test(e.text)) add('warn', 'มีข้อความที่ยังไม่ได้เติม (........)');
    if (L.font.key.indexOf('เว็บ') >= 0) add('warn', 'เครื่องนี้ไม่มีแบบอักษร TH Sarabun — ใช้ Sarabun แทน (หน้าตาต่างเล็กน้อย)');
    add(LS.testPrinted ? 'ok' : 'warn', LS.testPrinted ? 'พิมพ์ทดสอบบนกระดาษเปล่าแล้ว' : 'แนะนำ: พิมพ์ทดสอบบนกระดาษเปล่าแล้วส่องซ้อนต้นฉบับก่อน');
    return out;
  }
  function updateChecks() {
    const box = $('enChecks'); if (!box || !LS.en) return;
    const L = layoutOf(LS.en), c = checkBox(L);
    box.innerHTML = c.items.map(function (x) { return '<div class="ck ' + x[0] + '">' + ({ ok: '✅', warn: '⚠️', bad: '⛔' }[x[0]]) + ' <span>' + x[1] + '</span></div>'; }).join('');
    const sz = $('enSize'); if (sz) sz.textContent = 'ขนาดกรอบ ' + L.wMm.toFixed(0) + ' × ' + L.hMm.toFixed(0) + ' มม. · ' + L.lines.length + ' บรรทัด';
    drawViewer();
  }
  function syncEnInputs() {
    const e = LS.en; if (!e) return;
    const x = $('enX'), y = $('enY'), pg = $('enPage');
    if (x) x.value = e.x; if (y) y.value = e.y; if (pg) pg.value = e.page;
  }

  function panelEn(el) {
    if (!LS.doc || !LS.doc.pages.length) { el.innerHTML = '<div class="card empty">ต้องมีไฟล์ต้นฉบับก่อน</div>'; return; }
    if (!LS.en) { LS.en = newDraft(); LS.en.page = LS.page; autoPlaceEn(true); }
    const e = LS.en, pf = prefs();
    if (e.page !== LS.page) { LS.page = e.page; setTimeout(drawViewer, 0); }
    const group = groupOf(e.signerId);
    const T = A.templates();
    const sug = suggested(group);
    const aiTxt = LS.rec.ai && LS.rec.ai.endorse && LS.rec.ai.endorse[group];
    const showAll = LS.showAllTpl;
    const ppl = A.people().map(function (p) { return { key: p.id, name: A.personLabel(p) + ' [' + (D.ROLES[p.role] || {}).name + ']' }; });
    const list = (LS.rec.endorsements || []);
    el.innerHTML =
      '<div class="card"><div class="section-title">1) ผู้ลงนาม & แนวทางเกษียณ <span class="sub">' + esc(D.GROUPS[group]) + '</span></div>' +
      '<div class="grid grid-2"><div class="field span-all"><label>ผู้ลงนาม (ชื่อ-ตำแหน่งพิมพ์ท้ายเกษียณ)</label><select id="enSigner">' + A.opts(ppl, e.signerId, '— เลือก —') + '</select></div>' +
      '<div class="field"><label>เรียน (ผู้บังคับบัญชาที่เสนอถึง)</label><input id="enTo" value="' + esc(e.toText) + '"></div>' +
      '<div class="field"><label>ผู้รับมอบ (ใช้กับ {ผู้รับมอบ})</label><select id="enAsg">' + A.opts(A.people().map(function (p) { return { key: p.id, name: A.personLabel(p) }; }), e.assignId, '—') + '</select></div></div>' +
      '<div style="margin-top:10px">' +
      (aiTxt ? '<button class="chip sug" id="enAi" title="ร่างโดย AI จากเนื้อหาหนังสือ">🤖 ร่างจาก AI</button>' : '') +
      T.filter(function (t) { return showAll || t.group === group; }).map(function (t) {
        return '<button class="chip' + (e.tplId === t.id ? ' active' : (sug && sug.id === t.id ? ' sug' : '')) + '" data-tpl="' + t.id + '" title="' + esc(t.text) + '">' + (sug && sug.id === t.id ? '⭐ ' : '') + esc(t.title) + '</button>';
      }).join('') +
      '<button class="chip" id="enAllT">' + (showAll ? 'แสดงเฉพาะบทบาทนี้' : 'แสดงทุกแนวทาง…') + '</button></div>' +
      '<p class="hint" style="margin:2px 0 0">⭐ = แนะนำตามประเภทหนังสือ "' + esc((D.TYPES[LS.rec.type || 'other'] || D.TYPES.other).name) + '"</p>' +
      '<div class="field" style="margin-top:10px"><label>ข้อความเกษียณ (แก้ได้อิสระ · เว้นวรรค 5 ช่องหน้าบรรทัด = ย่อหน้า 1 ซม.)</label><textarea id="enText" rows="5">' + esc(e.text) + '</textarea></div>' +
      '<div class="grid grid-4" style="margin-top:10px">' +
      '<div class="field"><label>วันที่</label><input type="date" id="enDate" value="' + esc(e.date) + '"></div>' +
      '<div class="field"><label>รูปแบบวันที่</label><select id="enDs">' + A.opts([{ key: 'short', name: '27 ก.ย. 69' }, { key: 'shortFull', name: '27 ก.ย. 2569' }, { key: 'long', name: '27 กันยายน 2569' }], e.dateStyle) + '</select></div>' +
      '<div class="field"><label>ตัวเลข</label><select id="enTd">' + A.opts([{ key: '0', name: 'อารบิก 123' }, { key: '1', name: 'ไทย ๑๒๓' }], e.thaiDigits ? '1' : '0') + '</select></div>' +
      '<div class="field"><label>เลขที่หนังสือตอบ</label><input id="enRep" value="' + esc(e.replyNo) + '"></div>' +
      '<div class="field"><label>แบบอักษร</label><select id="enFont">' + A.opts(D.FONTS.map(function (f) { return { key: f.key, name: f.key + (EN.fontInstalled(f.key) ? '' : ' (ไม่มีในเครื่อง)') }; }), e.fontKey) + '</select></div>' +
      '<div class="field"><label>ขนาด (pt)</label><input type="number" id="enPt" min="10" max="24" step="0.5" value="' + e.pt + '"></div>' +
      '<div class="field"><label>ความกว้างกรอบ (มม.)</label><input type="number" id="enW" min="40" max="190" step="1" value="' + e.w + '"></div>' +
      '<div class="field"><label>ระยะบรรทัด</label><input type="number" id="enLf" min="0.9" max="1.6" step="0.05" value="' + e.lineF + '"></div>' +
      '<div class="field span-all"><label><input type="checkbox" id="enSig"' + (e.sig !== false ? ' checked' : '') + '> พิมพ์ส่วนลงนาม — เว้นที่เซ็นชื่อ + (ชื่อ-สกุล) + ตำแหน่ง + วันที่</label></div></div></div>' +

      '<div class="card"><div class="section-title">2) ตำแหน่งบนต้นฉบับ <span class="sub" id="enSize"></span></div>' +
      '<div class="flex"><select class="inp" id="enAnchor" style="width:auto">' + A.opts([{ key: 'next', name: 'ต่อจากเกษียณเดิม' }, { key: 'bottom-left', name: 'มุมล่างซ้าย' }, { key: 'bottom-right', name: 'มุมล่างขวา' }, { key: 'below-text', name: 'ใต้ข้อความสุดท้าย' }, { key: 'top-right', name: 'ขวาบน' }, { key: 'left-margin', name: 'ขอบซ้ายกลางหน้า' }], pf.anchor) + '</select>' +
      '<button class="btn btn-sm btn-primary" id="enAuto">🎯 หาที่ว่างอัตโนมัติ</button></div>' +
      '<div class="flex" style="margin-top:10px;align-items:flex-end">' +
      '<div class="field" style="width:80px"><label>หน้า</label><select id="enPage">' + A.opts(LS.doc.pages.map(function (p, i) { return { key: i, name: String(i + 1) }; }), e.page) + '</select></div>' +
      '<div class="field" style="width:100px"><label>ห่างซ้าย (มม.)</label><input type="number" step="0.5" id="enX" value="' + e.x + '"></div>' +
      '<div class="field" style="width:100px"><label>ห่างบน (มม.)</label><input type="number" step="0.5" id="enY" value="' + e.y + '"></div>' +
      '<div class="nudge"><span></span><button data-nd="0,-1">▲</button><span></span><button data-nd="-1,0">◀</button><button data-nd="0,1">▼</button><button data-nd="1,0">▶</button></div>' +
      '<span class="hint">ปุ่มลูกศรเลื่อนทีละ 1 มม. · ลาก/คลิกบนภาพได้</span></div>' +
      '<div class="checks" id="enChecks"></div></div>' +

      '<div class="card"><div class="section-title">3) พิมพ์</div>' +
      '<div class="flex"><button class="btn btn-outline" id="enTest">🧪 พิมพ์ทดสอบ (กระดาษเปล่า)</button>' +
      '<button class="btn btn-primary" id="enReal">🖨️ พิมพ์ลงต้นฉบับ</button>' +
      '<button class="btn btn-outline" id="enSheet">📄 พิมพ์แผ่นเกษียณต่อ</button>' +
      '<button class="btn btn-ghost" id="enDraft">บันทึกร่าง</button><button class="btn btn-ghost" id="enNew">+ ร่างใหม่</button></div>' +
      '<p class="hint" style="margin:8px 0 0">วิธีใส่ต้นฉบับ: <b>' + esc(EN.printerCfg().feedNote || 'ยังไม่ได้บันทึก (แท็บเครื่องพิมพ์)') + '</b> · หน้าต่างพิมพ์: A4 · ขอบ "ไม่มี" · มาตราส่วน 100% · ปิดส่วนหัว/ส่วนท้าย</p></div>' +

      '<div class="card"><div class="section-title">เกษียณของหนังสือฉบับนี้ <span class="sub">' + list.length + ' รายการ</span></div>' +
      (list.length ? list.map(function (x) {
        const p = A.person(x.signerId);
        return '<div class="en-item"><div class="flex"><span class="badge ' + (x.status === 'printed' ? 'b-ok' : 'b-mute') + '">' + (x.status === 'printed' ? 'พิมพ์แล้ว' : 'ร่าง') + '</span>' +
          '<b>' + esc(p ? A.fullName(p) || p.position : '') + '</b><span class="muted small">' + (x.page === 'sheet' ? 'แผ่นเกษียณต่อ' : 'หน้า ' + (x.page + 1) + ' · (' + x.x + ', ' + x.y + ') มม.') + ' · ' + esc(U.thDate(x.date, 'short')) + '</span>' +
          '<span style="margin-left:auto" class="flex"><button class="btn btn-sm btn-outline" data-load="' + esc(x.id) + '">' + (LS.en && LS.en.id === x.id ? 'กำลังแก้' : 'เปิด') + '</button><button class="btn btn-sm btn-ghost" data-drop="' + esc(x.id) + '">ลบ</button></span></div>' +
          '<pre>' + esc(x.text) + '</pre></div>';
      }).join('') : '<div class="empty">ยังไม่มี</div>') + '</div>';

    const q = function (id) { return $(id); };
    const touch = function (redo) { LS.dirty = true; if (redo) { refill(e); q('enText').value = e.text; } updateChecks(); };
    q('enSigner').onchange = function () {
      e.signerId = this.value; e.toText = defaultTo(e.signerId);
      const s = suggested(groupOf(e.signerId)); if (s && !e.manual) applyTpl(e, s);
      LS.dirty = true; renderPanel(); updateChecks();
    };
    q('enTo').oninput = function () { e.toText = this.value; touch(true); };
    q('enAsg').onchange = function () { e.assignId = this.value; touch(true); };
    el.querySelectorAll('[data-tpl]').forEach(function (b) {
      b.onclick = function () {
        applyTpl(e, T.find(function (t) { return t.id === b.dataset.tpl; }));
        LS.dirty = true; renderPanel(); updateChecks();
      };
    });
    if (q('enAi')) q('enAi').onclick = function () { e.tplId = 'ai'; e.tplRaw = ''; e.manual = true; e.text = aiTxt; LS.dirty = true; renderPanel(); updateChecks(); };
    q('enAllT').onclick = function () { LS.showAllTpl = !LS.showAllTpl; renderPanel(); updateChecks(); };
    q('enText').oninput = function () { e.text = this.value; e.manual = true; LS.dirty = true; clearTimeout(this._t); this._t = setTimeout(updateChecks, 200); };
    q('enDate').onchange = function () { e.date = this.value; touch(); };
    q('enDs').onchange = function () { e.dateStyle = this.value; savePref({ dateStyle: this.value }); touch(); };
    q('enTd').onchange = function () { e.thaiDigits = this.value === '1'; savePref({ thaiDigits: e.thaiDigits }); touch(true); };
    q('enRep').oninput = function () { e.replyNo = this.value; touch(true); };
    q('enFont').onchange = function () { e.fontKey = this.value; savePref({ fontKey: this.value }); touch(); };
    q('enPt').onchange = function () { e.pt = +this.value || 16; savePref({ pt: e.pt }); touch(); };
    q('enW').onchange = function () { e.w = +this.value || 85; savePref({ w: e.w }); touch(); };
    q('enLf').onchange = function () { e.lineF = +this.value || 1.15; savePref({ lineF: e.lineF }); touch(); };
    q('enSig').onchange = function () { e.sig = this.checked; touch(); };
    q('enAnchor').onchange = function () { savePref({ anchor: this.value }); };
    q('enAuto').onclick = function () { autoPlaceEn(false); };
    q('enPage').onchange = function () { e.page = +this.value; LS.page = e.page; drawViewer(); updateChecks(); };
    q('enX').onchange = function () { e.x = +this.value; touch(); };
    q('enY').onchange = function () { e.y = +this.value; touch(); };
    el.querySelectorAll('[data-nd]').forEach(function (b) {
      b.onclick = function () { const d = b.dataset.nd.split(','); e.x += +d[0]; e.y += +d[1]; syncEnInputs(); touch(); };
    });
    q('enTest').onclick = function () {
      EN.print('test', { page: curPage(), L: layoutOf(e), xMm: e.x, yMm: e.y });
      LS.testPrinted = true; setTimeout(updateChecks, 500);
    };
    q('enReal').onclick = printReal;
    q('enSheet').onclick = printSheet;
    q('enDraft').onclick = async function () { upsertEn('draft'); try { await save('บันทึกร่างเกษียณ', 'บันทึกร่างเกษียณ'); A.toast('บันทึกร่างแล้ว'); } catch (err) { /* แจ้งแล้ว */ } renderPanel(); updateChecks(); };
    q('enNew').onclick = function () { LS.en = newDraft(); autoPlaceEn(true); renderPanel(); updateChecks(); };
    el.querySelectorAll('[data-load]').forEach(function (b) {
      b.onclick = function () {
        const x = LS.rec.endorsements.find(function (o) { return o.id === b.dataset.load; });
        LS.en = JSON.parse(JSON.stringify(x));
        if (LS.en.page === 'sheet') LS.en.page = 0;
        LS.page = LS.en.page; renderPanel(); updateChecks();
      };
    });
    el.querySelectorAll('[data-drop]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await A.confirm('ลบรายการเกษียณนี้ออกจากระบบ? (ไม่มีผลกับกระดาษที่พิมพ์ไปแล้ว)', 'ลบ', true))) return;
        LS.rec.endorsements = LS.rec.endorsements.filter(function (o) { return o.id !== b.dataset.drop; });
        if (LS.en && LS.en.id === b.dataset.drop) LS.en = null;
        try { await save('ลบเกษียณ', 'ลบรายการเกษียณ'); } catch (err) { /* แจ้งแล้ว */ }
        renderPanel(); updateChecks();
      };
    });
    updateChecks();
  }
  function savePref(o) { U.lsSet(PREF_KEY, Object.assign(prefs(), o)); }
  function autoPlaceEn(quiet) {
    const e = LS.en, p = LS.doc.pages[e.page]; if (!p) return;
    const L = layoutOf(e);
    let anchor = prefs().anchor;
    const occ = occupied(e.page, e.id);
    if (anchor === 'next' || (quiet && occ.length)) {
      // ต่อจากเกษียณล่าสุดบนหน้านี้ (ด้านล่าง หรือด้านขวาถ้าข้างล่างไม่พอ)
      const last = occ.slice().sort(function (a, b) { return (b.y + b.h) - (a.y + a.h); })[0];
      anchor = last ? { x: last.x, y: last.y + last.h + 4 } : 'below-text';
    }
    const pos = DOC.autoPlace(p, L.wMm, L.hMm, occ, anchor, 12);
    if (pos) { e.x = round(pos.x); e.y = round(pos.y); LS.dirty = true; if (!quiet) A.toast('วางในที่ว่างแล้ว — ตรวจตำแหน่งบนภาพอีกครั้ง'); }
    else if (!quiet) A.toast('ไม่มีที่ว่างพอบนหน้านี้ — ลดความกว้าง/ขนาดตัวอักษร ลองหน้าอื่น หรือใช้ "แผ่นเกษียณต่อ"', true);
    syncEnInputs(); updateChecks();
  }
  function upsertEn(status) {
    const e = LS.en;
    const p = A.person(e.signerId);
    e.status = status === 'printed' ? 'printed' : (e.status === 'printed' ? 'printed' : 'draft');
    e.signerName = A.fullName(p); e.signerPos = p ? p.position : '';
    const list = LS.rec.endorsements = LS.rec.endorsements || [];
    const i = list.findIndex(function (o) { return o.id === e.id; });
    const copy = JSON.parse(JSON.stringify(e));
    if (i >= 0) list[i] = copy; else list.push(copy);
  }
  async function printReal() {
    const e = LS.en, L = layoutOf(e), c = checkBox(L);
    const bad = c.items.filter(function (x) { return x[0] === 'bad'; });
    const m = A.modal({
      title: 'พิมพ์ลงต้นฉบับ — ตรวจครั้งสุดท้าย', size: 'narrow',
      body: '<div class="checks">' + c.items.map(function (x) { return '<div class="ck ' + x[0] + '">' + ({ ok: '✅', warn: '⚠️', bad: '⛔' }[x[0]]) + ' <span>' + x[1] + '</span></div>'; }).join('') + '</div>' +
        '<div class="alert info"><span class="ic">📥</span><span>ใส่<b>ต้นฉบับหน้า ' + (e.page + 1) + '</b> ครั้งละ 1 แผ่น: <b>' + esc(EN.printerCfg().feedNote || 'ตามวิธีที่ทดสอบไว้') + '</b></span></div>' +
        (bad.length ? '<div class="field" style="margin-top:10px"><label><input type="checkbox" id="prOverride"> ฉันตรวจแล้ว ยืนยันพิมพ์แม้มีรายการ ⛔</label></div>' : ''),
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="prGo">พิมพ์</button>'
    });
    m.q('#prGo').onclick = function () {
      if (bad.length && !m.q('#prOverride').checked) return A.toast('ติ๊กยืนยันก่อน หรือแก้ตำแหน่งให้ผ่าน', true);
      m.close();
      EN.print('real', { page: LS.doc.pages[e.page], L: L, xMm: e.x, yMm: e.y });
      setTimeout(function () { afterPrint(false); }, 1500);
    };
  }
  function printSheet() {
    const e = LS.en;
    EN.print('sheet', { L: layoutOf(e), letter: LS.rec });
    setTimeout(function () { afterPrint(true); }, 1500);
  }
  function afterPrint(sheet) {
    const m = A.modal({
      title: 'พิมพ์ออกมาเรียบร้อยหรือไม่?', size: 'narrow',
      body: '<p style="margin-top:0">ถ้าพิมพ์ถูกต้อง กด "บันทึกว่าพิมพ์แล้ว" ระบบจะจำตำแหน่งนี้ไว้ (เกษียณครั้งต่อไปจะไม่ทับ) และปรับสถานะหนังสือให้</p>' +
        '<p class="hint">ถ้าตำแหน่งคลาด ให้สแกนแผ่นที่พิมพ์แล้วใช้แท็บ "ตรวจหลังพิมพ์" เพื่อปรับเครื่องพิมพ์</p>',
      foot: '<button class="btn btn-outline" data-close>ยังไม่บันทึก</button><button class="btn btn-primary" id="apOk">บันทึกว่าพิมพ์แล้ว</button>'
    });
    m.q('#apOk').onclick = async function () {
      const e = LS.en;
      if (sheet) e.page = 'sheet';
      e.printedAt = new Date().toISOString(); e.printedBy = FBL.user.name;
      upsertEn('printed');
      const g = groupOf(e.signerId), r = LS.rec;
      if (g === 'propose' && r.status === 'new') r.status = 'proposed';
      if (g === 'command' && (r.status === 'new' || r.status === 'proposed')) { r.status = 'assigned'; if (e.assignId) r.assigneeId = e.assignId; }
      if (g === 'report') r.status = 'done';
      const p = A.person(e.signerId);
      m.close();
      try {
        await save('พิมพ์เกษียณ', 'พิมพ์เกษียณ' + (sheet ? ' (แผ่นเกษียณต่อ)' : ' หน้า ' + (e.page + 1)) + ' โดย ' + (p ? (A.fullName(p) || p.position) : ''));
        A.toast('บันทึกแล้ว');
      } catch (err) { /* แจ้งแล้ว */ }
      LS.lastPrintedId = e.id;
      LS.en = null; LS.testPrinted = false;
      renderAll();
    };
  }

  /* ---------------- ตรวจหลังพิมพ์ ---------------- */
  function panelVerify(el) {
    const printed = (LS.rec.endorsements || []).filter(function (e) { return e.status === 'printed' && e.page !== 'sheet'; });
    el.innerHTML = '<div class="card"><div class="section-title">ตรวจตำแหน่งหลังพิมพ์ & ปรับเครื่องพิมพ์อัตโนมัติ</div>' +
      (printed.length ? '<div class="grid grid-2"><div class="field span-all"><label>เกษียณที่จะตรวจ</label><select id="vfE">' +
        A.opts(printed.map(function (e) { return { key: e.id, name: 'หน้า ' + (e.page + 1) + ' · ' + (e.signerName || e.signerPos || '') + ' · ' + U.thDate(e.date, 'short') }; }), LS.lastPrintedId || printed[printed.length - 1].id) + '</select></div>' +
        '<div class="field span-all"><label>ภาพสแกนหน้าที่พิมพ์แล้ว (สแกน A4 100% แบบเดียวกับตอนรับ)</label><input type="file" id="vfF" accept="image/*,application/pdf"></div></div>' +
        '<div id="vfOut" style="margin-top:12px"></div>' : '<div class="empty">ยังไม่มีเกษียณที่บันทึกว่าพิมพ์แล้ว</div>') + '</div>' +
      '<div class="card guide"><div class="section-title">หลักการ</div><ul class="small">' +
      '<li>ระบบซ้อนภาพสแกนใหม่กับภาพต้นฉบับเดิม (เลื่อนหาจุดที่ตรงกันที่สุดเอง ±12 มม.)</li>' +
      '<li>หมึกที่เพิ่มขึ้นมา = ข้อความที่พิมพ์ (แสดงเป็นสีแดง) เทียบกับกรอบที่ตั้งใจ (น้ำเงินประ)</li>' +
      '<li>ได้ค่าคลาดเคลื่อนเป็นมิลลิเมตร → กด "ปรับค่าเครื่องพิมพ์" ครั้งต่อไปจะแม่นขึ้น</li>' +
      '<li>ใช้เครื่องสแกนหรือแอปสแกนเอกสาร (เช่น Microsoft Lens) — ภาพถ่ายเอียงจะวัดไม่แม่น</li></ul></div>';
    if (!printed.length) return;
    $('vfF').onchange = async function () {
      const f = this.files[0]; if (!f) return;
      const e = printed.find(function (x) { return x.id === $('vfE').value; });
      const page = LS.doc.pages[e.page];
      const out = $('vfOut');
      out.innerHTML = '<p class="hint">กำลังวิเคราะห์...</p>';
      try {
        let blob = f;
        if (/pdf/.test(f.type)) {
          const d = await DOC.open([{ blob: f, name: f.name, type: f.type }]);
          const pg = d.pages[Math.min(e.page, d.pages.length - 1)];
          blob = await new Promise(function (res) { pg.canvas.toBlob(res, 'image/png'); });
        }
        const exp = inkBox(e);
        const L = layoutOf(e);
        const r = await DOC.verifyPrint(page, blob, exp, function (ctx, s) { EN.draw(ctx, L, e.x, e.y, s, { box: false, color: '#000' }); });
        const okLv = r.found ? (Math.abs(r.offX) <= 1.5 && Math.abs(r.offY) <= 1.5 ? 'ok' : (Math.abs(r.offX) <= 3 && Math.abs(r.offY) <= 3 ? 'warn' : 'bad')) : 'bad';
        out.innerHTML = '<div class="alert ' + okLv + '"><span class="ic">' + ({ ok: '✅', warn: '⚠️', bad: '⛔' }[okLv]) + '</span><span>' +
          (r.found ? 'ข้อความที่พิมพ์คลาดจากที่ตั้งใจ: แนวนอน <b>' + fmtOff(r.offX, 'ขวา', 'ซ้าย') + '</b> · แนวตั้ง <b>' + fmtOff(r.offY, 'ล่าง', 'บน') + '</b>' +
            (okLv === 'ok' ? ' — อยู่ในเกณฑ์ดี' : '') : 'หาข้อความที่พิมพ์ใหม่ไม่พบ — ตรวจว่าเลือกหน้าถูก และสแกนหลังพิมพ์แล้ว') +
          '<br><span class="small">(ภาพสแกนเลื่อนจากต้นฉบับ ' + r.shift.dx + ', ' + r.shift.dy + ' มม. — ปรับให้แล้ว)</span></span></div>' +
          '<img src="' + r.image + '" style="width:100%;border:1px solid var(--line);border-radius:8px;margin-top:10px">' +
          (r.found && okLv !== 'ok' ? '<div class="flex" style="margin-top:10px"><button class="btn btn-primary" id="vfFix">ปรับค่าเครื่องพิมพ์ตามผลนี้</button><span class="hint">แล้วพิมพ์ทดสอบซ้ำอีกครั้ง</span></div>' : '');
        if ($('vfFix')) $('vfFix').onclick = function () {
          const c = EN.printerCfg();
          c.dx = (+c.dx || 0) + r.offX; c.dy = (+c.dy || 0) + r.offY; c.calibratedAt = c.calibratedAt || new Date().toISOString();
          EN.setPrinterCfg(c);
          A.toast('ปรับแล้ว: เลื่อน ' + c.dx.toFixed(1) + ', ' + c.dy.toFixed(1) + ' มม.');
        };
      } catch (err) { out.innerHTML = '<div class="alert bad">' + esc(err.message) + '</div>'; }
    };
  }
  function fmtOff(v, pos, neg) { return Math.abs(v) < 0.5 ? 'ตรง' : Math.abs(v).toFixed(1) + ' มม. ไปทาง' + (v > 0 ? pos : neg); }
  // กรอบของหมึกที่คาดว่าจะพิมพ์ (ไม่รวมช่องว่างรอบตัวอักษร) — วาดข้อความลง canvas แล้ววัด
  function inkBox(e) {
    const L = layoutOf(e), s = 4;
    const c = document.createElement('canvas'); c.width = Math.ceil(L.wMm * s) + 8; c.height = Math.ceil(L.hMm * s) + 8;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    EN.draw(ctx, L, 0, 0, s, { box: false, color: '#000' });
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4] < 128) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    if (x1 < x0) return { x: e.x, y: e.y, w: L.wMm, h: L.hMm };
    return { x: e.x + x0 / s, y: e.y + y0 / s, w: (x1 - x0) / s, h: (y1 - y0) / s };
  }

  /* ---------------- ประวัติ ---------------- */
  function panelHist(el) {
    const h = (LS.rec.history || []).slice().reverse();
    el.innerHTML = '<div class="card"><div class="section-title">ประวัติการดำเนินการ</div>' +
      (h.length ? '<div class="table-wrap"><table class="data"><tbody>' + h.map(function (x) {
        return '<tr><td class="nowrap small">' + esc(U.thDate((x.at || '').slice(0, 10), 'short')) + ' ' + esc((x.at || '').slice(11, 16)) + '</td><td>' + esc(x.by) + '</td><td>' + esc(x.what) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มี</div>') + '</div>';
  }
})();
