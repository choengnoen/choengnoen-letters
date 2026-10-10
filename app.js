/* ==========================================================================
   app.js — แกนหลัก: ล็อกอิน, ภาพรวม, ทะเบียนหนังสือ, แนวทางเกษียณ, บุคลากร/ตำแหน่ง,
            เครื่องพิมพ์ (ปรับเทียบ), AI ช่วยงาน, คู่มือ, ตั้งค่า
   (หน้าทำงานกับหนังสือแต่ละฉบับ — สรุป/QR/เกษียณ/พิมพ์/ตรวจหลังพิมพ์ อยู่ใน app-letter.js)
   ========================================================================== */
(function () {
  'use strict';
  const D = window.LTR_DATA, esc = U.esc;
  const S = { team: [], letters: [], settings: null, view: 'dash', ui: { q: '', st: 'open' }, openId: null };
  const A = window.App = { S: S, views: {}, D: D };
  function $(id) { return document.getElementById(id); }
  A.$ = $;

  /* ======================= ตัวช่วยหน้าจอ ======================= */
  let toastTimer = null;
  A.toast = function (msg, isErr) {
    const t = $('toast'); t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, isErr ? 5200 : 2600);
  };
  A.modal = function (o) {
    const root = $('modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = '<div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + esc(o.title || '') + '</h3><button class="modal-close" type="button" title="ปิด">×</button></div>' +
      '<div class="modal-body">' + (o.body || '') + '</div>' +
      (o.foot === false ? '' : '<div class="modal-foot">' + (o.foot || '<button class="btn btn-outline" data-close>ปิด</button>') + '</div>') + '</div>';
    root.appendChild(wrap);
    const close = function () { wrap.remove(); if (o.onClose) o.onClose(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); }
    document.addEventListener('keydown', onKey);
    wrap.querySelector('.modal-close').onclick = close;
    wrap.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; });
    wrap.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
    const m = { el: wrap, close: close, q: function (s) { return wrap.querySelector(s); }, qa: function (s) { return wrap.querySelectorAll(s); } };
    if (o.onOpen) o.onOpen(m);
    return m;
  };
  A.confirm = function (msg, okText, danger) {
    return new Promise(function (resolve) {
      let done = false;
      const m = A.modal({
        title: 'ยืนยัน', size: 'narrow', body: '<p style="margin:0;white-space:pre-line">' + esc(msg) + '</p>',
        foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="cfOk">' + esc(okText || 'ตกลง') + '</button>',
        onClose: function () { if (!done) resolve(false); }
      });
      m.q('#cfOk').onclick = function () { done = true; m.close(); resolve(true); };
    });
  };
  A.busy = function (btn, text) {
    if (!btn) return function () {};
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin-sm" style="border-color:rgba(0,0,0,.15);border-top-color:currentColor"></span> ' + esc(text || 'กำลังบันทึก...');
    return function () { btn.disabled = false; btn.innerHTML = old; };
  };
  A.pwField = function (id, placeholder, ac) {
    return '<div class="pw-wrap"><input type="password" id="' + id + '" autocomplete="' + (ac || 'new-password') + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '><button type="button" class="pw-toggle" data-target="' + id + '" title="แสดง/ซ่อน">👁</button></div>';
  };
  function bindPwToggle(b) {
    b.onclick = function () { const i = document.getElementById(b.dataset.target); if (i) i.type = i.type === 'password' ? 'text' : 'password'; };
  }
  A.opts = function (list, sel, withBlank) {
    return (withBlank ? '<option value="">' + esc(withBlank === true ? '—' : withBlank) + '</option>' : '') + list.map(function (x) {
      const v = typeof x === 'object' ? x.key : x, n = typeof x === 'object' ? x.name : x;
      return '<option value="' + esc(v) + '"' + (String(v) === String(sel === undefined || sel === null ? '' : sel) ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  };
  A.roleTag = function (u) { return u && u.isOwner ? ' 👑' : (u && u.isAdmin ? ' 🛡️' : ''); };
  A.can = function () { return FBL.user && (FBL.user.isOwner || FBL.user.isAdmin); };

  /* ======================= ข้อมูลตั้งค่า (บุคลากร / แนวทางเกษียณ) ======================= */
  function defaults() {
    return { id: 'app', people: JSON.parse(JSON.stringify(D.PEOPLE)), templates: JSON.parse(JSON.stringify(D.TEMPLATES)), org: 'หมวดทางหลวงเชิงเนิน แขวงทางหลวงระยอง' };
  }
  A.settings = function () { return S.settings || defaults(); };
  A.people = function (all) { return (A.settings().people || []).filter(function (p) { return all || p.active !== false; }); };
  A.templates = function () { return A.settings().templates || []; };
  A.person = function (id) { return (A.settings().people || []).find(function (p) { return p.id === id; }) || null; };
  A.personLabel = function (p) { if (!p) return ''; return ((p.prefix || '') + (p.name || '(ยังไม่ระบุชื่อ)')) + ' · ' + (p.position || ''); };
  A.fullName = function (p) { return p ? (p.prefix || '') + (p.name || '') : ''; };
  // ผู้ใช้ที่ล็อกอินอยู่ ผูกกับบุคลากรคนไหน (ตั้งที่แท็บบุคลากร/ตำแหน่ง ช่อง "ผู้ใช้ระบบ")
  A.me = function () {
    const n = FBL.user && FBL.user.name;
    return (A.settings().people || []).find(function (p) { return p.loginName && p.loginName === n; }) || null;
  };
  A.saveSettings = async function (st, summary) {
    if (!A.can()) throw new Error('แก้ไขได้เฉพาะเจ้าของระบบหรือผู้ดูแลระบบ');
    await FBL.save('settings', Object.assign({}, st, { id: 'app' }), summary || 'แก้ไขการตั้งค่า');
    S.settings = Object.assign({}, st, { id: 'app' });
  };

  /* ======================= หนังสือ ======================= */
  A.letters = function () { return S.letters.filter(function (l) { return !l.deletedAt; }); };
  A.letter = function (id) { return S.letters.find(function (l) { return l.id === id; }) || null; };
  A.saveLetter = async function (rec, summary) {
    const id = await FBL.save('letters', rec, summary || rec.subject || rec.regNo);
    return id;
  };
  A.isOpen = function (l) { return l.status !== 'done' && l.status !== 'filed'; };
  A.dueInfo = function (l) {
    if (!l.dueDate || !A.isOpen(l)) return null;
    const d = U.daysBetween(U.today(), l.dueDate);
    if (d < 0) return { cls: 'b-bad', text: 'เกินกำหนด ' + (-d) + ' วัน', d: d };
    if (d === 0) return { cls: 'b-bad', text: 'ครบกำหนดวันนี้', d: d };
    if (d <= 3) return { cls: 'b-warn', text: 'อีก ' + d + ' วัน', d: d };
    return { cls: 'b-info', text: U.thDate(l.dueDate, 'short'), d: d };
  };
  A.urgBadge = function (u) {
    if (!u || u === 'ปกติ') return '';
    return '<span class="badge ' + (u === 'ด่วน' ? 'b-warn' : 'b-bad') + '">' + esc(u) + '</span>';
  };
  A.statusBadge = function (s) { const x = D.STATUS[s] || D.STATUS.new; return '<span class="badge ' + x.cls + '">' + x.name + '</span>'; };
  A.nextRegNo = function () {
    const be = new Date().getFullYear() + 543;
    const n = A.letters().filter(function (l) { return String(l.regNo || '').split('/')[1] === String(be); })
      .reduce(function (a, l) { return Math.max(a, parseInt(l.regNo, 10) || 0); }, 0);
    return (n + 1) + '/' + be;
  };

  /* ======================= หน้าล็อกอิน (เหมือนระบบผู้ควบคุมงานโครงการ) ======================= */
  let teamLoadError = '';
  let appStarted = false;
  function gate() { return $('authGate'); }
  function hideLoading() { const o = $('pageLoadingOverlay'); if (o) o.classList.add('hide'); }
  function showGateError(msg) { const el = $('gateError'); if (!el) return; el.textContent = msg; el.style.display = 'block'; }
  function renderAuthGate(errorMsg) {
    const g = gate(); hideLoading(); g.classList.add('show');
    $('appHeader').style.display = 'none'; $('main').style.display = 'none';
    const head = '<img src="logo.png" alt="ตรากรมทางหลวง" class="auth-logo"><h2>หนังสือราชการ &amp; เกษียณหนังสือ</h2>' +
      '<p class="auth-sub">หมวดทางหลวงเชิงเนิน · แขวงทางหลวงระยอง</p>';
    const demo = FBL.mode === 'demo' ? '<div class="auth-demo">โหมดทดลอง: ยังไม่ได้เชื่อม Firebase — ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</div>' : '';
    const errHtml = '<p class="hint auth-error" id="gateError" style="' + (errorMsg ? '' : 'display:none') + '">' + esc(errorMsg || '') + '</p>';
    if (teamLoadError) {
      g.innerHTML = '<div class="auth-card">' + head + '<h3 class="auth-h3">เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h3><p class="hint auth-error">' + esc(teamLoadError) +
        '</p><button class="btn btn-primary auth-btn" id="gateRetry">ลองอีกครั้ง</button></div>';
      $('gateRetry').onclick = function () { location.reload(); };
      return;
    }
    if (!S.team.length) {
      g.innerHTML = '<div class="auth-card">' + head + '<h3 class="auth-h3">ตั้งค่าเจ้าของระบบครั้งแรก</h3>' +
        '<p class="hint" style="margin-bottom:14px">ยังไม่มีผู้ใช้งานในระบบ — คนแรกที่ตั้งค่าจะเป็น "เจ้าของระบบ" และประตูนี้จะปิดถาวร</p>' +
        '<div class="field" style="margin-bottom:12px"><label>ชื่อ-นามสกุลของคุณ</label><input type="text" id="gateOwnerName" autocomplete="off"></div>' +
        '<div class="field" style="margin-bottom:12px"><label>ตั้งรหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</label>' + A.pwField('gateOwnerPass') + '</div>' +
        '<div class="field" style="margin-bottom:14px"><label>ยืนยันรหัสผ่าน</label>' + A.pwField('gateOwnerPass2') + '</div>' +
        errHtml + '<button class="btn btn-primary auth-btn" id="gateClaim">ตั้งค่าและเข้าสู่ระบบ</button>' + demo + '</div>';
      g.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
      const claim = async function () {
        const n = $('gateOwnerName').value.trim(), p1 = $('gateOwnerPass').value, p2 = $('gateOwnerPass2').value;
        if (!n || !p1) return showGateError('กรอกชื่อและรหัสผ่านให้ครบ');
        if (p1.length < 8) return showGateError('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
        if (p1 !== p2) return showGateError('รหัสผ่านสองช่องไม่ตรงกัน');
        const done = A.busy($('gateClaim'), 'กำลังตั้งค่า...');
        try { const u = await FBL.bootstrapOwner(n, p1); S.team = FBL.team(); handleAuth(u); }
        catch (e) { done(); showGateError(e.message); }
      };
      $('gateClaim').onclick = claim;
      g.querySelectorAll('input').forEach(function (i) { i.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') claim(); }); });
      return;
    }
    const options = S.team.map(function (m) { return '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>'; }).join('');
    g.innerHTML = '<div class="auth-card">' + head + '<h3 class="auth-h3">เข้าสู่ระบบ</h3>' +
      '<div class="field" style="margin-bottom:12px"><label>ชื่อผู้ใช้งาน</label><select id="gateName"><option value="">— เลือกชื่อของคุณ —</option>' + options + '</select></div>' +
      '<div class="field" style="margin-bottom:14px"><label>รหัสผ่าน</label><input type="text" id="gateUserShadow" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' + A.pwField('gatePass', '', 'current-password') + '</div>' +
      errHtml + '<button class="btn btn-primary auth-btn" id="gateOk">เข้าสู่ระบบ</button>' + demo + '</div>';
    g.querySelectorAll('.pw-toggle').forEach(bindPwToggle);
    const gSel = $('gateName'), gShadow = $('gateUserShadow');
    gSel.addEventListener('change', function () { gShadow.value = gSel.value; });
    gShadow.addEventListener('input', function () { if ([].some.call(gSel.options, function (o) { return o.value === gShadow.value; })) gSel.value = gShadow.value; });
    const login = async function () {
      const name = gSel.value, pass = $('gatePass').value;
      if (!name) return showGateError('เลือกชื่อของคุณก่อน');
      if (!pass) return showGateError('กรอกรหัสผ่าน');
      const done = A.busy($('gateOk'), 'กำลังตรวจสอบ...');
      try { await FBL.login(name, pass); } catch (e) { done(); showGateError(e.message); }
    };
    $('gateOk').onclick = login;
    $('gatePass').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') login(); });
    setTimeout(function () { (gSel.value ? $('gatePass') : gSel).focus(); }, 50);
  }
  function handleAuth(user, errorMsg) {
    if (!user) { appStarted = false; renderAuthGate(errorMsg); return; }
    S.team = FBL.team();   // ก่อนล็อกอินได้แค่สมุดชื่อ (ไม่มีสถานะเจ้าของ/ผู้ดูแล) — ล็อกอินแล้วใช้รายชื่อเต็มที่ชั้นเชื่อมต่อโหลดไว้
    const g = gate(); g.classList.remove('show'); g.innerHTML = '';
    startApp();
  }
  async function boot() {
    if (!window.FBL) { hideLoading(); gate().classList.add('show'); gate().innerHTML = '<div class="auth-card"><h3 class="auth-h3">โหลดระบบฐานข้อมูลไม่สำเร็จ</h3><p class="hint">ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้านี้</p></div>'; return; }
    FBL.onError = function (msg) { A.toast(msg, true); };
    try { S.team = await FBL.loadTeam(); teamLoadError = ''; } catch (e) { teamLoadError = FBL.errorText(e); }
    FBL.onAuth(handleAuth);
  }

  /* ======================= เริ่มระบบหลังล็อกอิน ======================= */
  async function startApp() {
    if (appStarted) return;
    appStarted = true;
    $('appHeader').style.display = ''; $('main').style.display = '';
    $('demoBadge').style.display = FBL.mode === 'demo' ? '' : 'none';
    $('btnLogout').onclick = async function () { await FBL.logout(); location.reload(); };
    $('btnNewLetter').onclick = function () { A.newLetterDialog(); };
    $('tabs').querySelectorAll('.tab-btn').forEach(function (b) { b.onclick = function () { A.go(b.dataset.view); }; });
    const [letters, settings] = await Promise.all([
      FBL.watch('letters', function (docs) { S.letters = docs; A.scheduleRender(); }),
      FBL.watch('settings', function (docs) { S.settings = docs.find(function (d) { return d.id === 'app'; }) || null; updateWho(); A.scheduleRender(); })
    ]);
    S.letters = letters; S.settings = settings.find(function (d) { return d.id === 'app'; }) || null;
    updateWho();
    hideLoading();
    A.go((location.hash || '').replace('#', '') || 'dash', true);
  }
  function updateWho() {
    const me = A.me();
    $('whoDisplay').textContent = 'ผู้ใช้: ' + FBL.user.name + A.roleTag(FBL.user) + (me ? ' · ' + me.position : '');
  }

  const VIEWS = ['dash', 'list', 'letter', 'tpl', 'people', 'printer', 'ai', 'guide', 'settings'];
  A.go = function (v, noHist) {
    if (VIEWS.indexOf(v) < 0) v = 'dash';
    if (v === 'letter' && !S.openId) v = 'list';
    S.view = v;
    $('tabs').querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    document.querySelectorAll('.view').forEach(function (s) { s.classList.toggle('active', s.id === 'view-' + v); });
    $('main').classList.toggle('wide', v === 'letter');
    if (!noHist) try { history.replaceState(null, '', '#' + v); } catch (e) { /* ข้าม */ }
    A.render();
    window.scrollTo(0, 0);
  };
  let renderTimer = null;
  A.scheduleRender = function () { clearTimeout(renderTimer); renderTimer = setTimeout(A.render, 60); };
  A.render = function () {
    const f = A.views[S.view];
    // หน้าหนังสือมีการแก้ไขค้างอยู่ — ไม่วาดใหม่ทั้งหน้าเมื่อข้อมูลในฐานข้อมูลเปลี่ยน
    if (S.view === 'letter') { if (!$('lwPanel')) A.views.letter(); else A.views.letterRefresh(); return; }
    if (f) f($('view-' + S.view));
    const n = A.letters().filter(function (l) { const d = A.dueInfo(l); return d && d.d <= 0; }).length;
    const t = $('tabs').querySelector('[data-view="list"]');
    t.innerHTML = 'ทะเบียนหนังสือรับ' + (n ? '<span class="cnt">' + n + '</span>' : '');
  };

  /* ======================= รับหนังสือใหม่ ======================= */
  A.newLetterDialog = function () {
    let files = [];
    const m = A.modal({
      title: 'รับหนังสือใหม่', size: '',
      body: '<div class="drop" id="nlDrop"><b>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</b><br><span class="small">PDF 1 ไฟล์ หรือภาพสแกน/ภาพถ่ายหลายหน้า (JPG/PNG) · ไม่เกิน 10 MB ต่อไฟล์</span>' +
        '<input type="file" id="nlFile" accept="application/pdf,image/*" multiple style="display:none"></div>' +
        '<div id="nlList" class="small" style="margin:8px 0 14px"></div>' +
        '<div class="grid grid-3"><div class="field"><label>เลขทะเบียนรับ</label><input id="nlReg" value="' + esc(A.nextRegNo()) + '"></div>' +
        '<div class="field"><label>วันที่รับ</label><input type="date" id="nlDate" value="' + U.today() + '"></div>' +
        '<div class="field"><label>ความเร่งด่วน</label><select id="nlUrg">' + A.opts(D.URGENCY, 'ปกติ') + '</select></div>' +
        '<div class="field span-all"><label>เรื่อง (เว้นว่างได้ — ระบบ/AI อ่านให้)</label><input id="nlSubj"></div></div>' +
        '<p class="hint" style="margin-top:10px">💡 สแกนต้นฉบับ<b>ทันทีที่รับ</b> (ก่อนเขียน/พิมพ์เกษียณใด ๆ) ขนาด A4 100% ความละเอียด 200–300 dpi — ระบบใช้ภาพนี้หาพื้นที่ว่างและตรวจการพิมพ์ทับ</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="nlOk">บันทึกและเปิดหนังสือ</button>'
    });
    const drop = m.q('#nlDrop'), inp = m.q('#nlFile');
    function show() {
      m.q('#nlList').innerHTML = files.map(function (f) { return '📄 ' + esc(f.name) + ' (' + U.fmtBytes(f.size) + ')'; }).join('<br>');
    }
    function add(list) {
      [].forEach.call(list, function (f) {
        if (!/pdf|image/.test(f.type)) return A.toast('รองรับเฉพาะ PDF และไฟล์ภาพ', true);
        if (f.size > FBL.maxFileBytes) return A.toast(f.name + ' ใหญ่เกิน ' + (FBL.maxFileBytes / 1048576) + ' MB', true);
        if (/pdf/.test(f.type)) files = files.filter(function (x) { return !/pdf/.test(x.type); });
        files.push(f);
      });
      if (files.some(function (f) { return /pdf/.test(f.type); }) && files.length > 1) {
        files = files.filter(function (f) { return /pdf/.test(f.type); });
        A.toast('ใช้ PDF 1 ไฟล์ หรือภาพหลายภาพ อย่างใดอย่างหนึ่ง');
      }
      show();
    }
    drop.onclick = function () { inp.click(); };
    inp.onchange = function () { add(inp.files); inp.value = ''; };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); };
    m.q('#nlOk').onclick = async function () {
      if (!files.length) return A.toast('เลือกไฟล์หนังสือก่อน', true);
      const done = A.busy(m.q('#nlOk'), 'กำลังอัปโหลด...');
      try {
        const id = FBL.newId();
        const saved = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const path = 'letters/' + id + '/' + i + '-' + f.name.replace(/[^\w.\-ก-๙]/g, '_');
          await FBL.uploadFile(path, f);
          saved.push({ path: path, name: f.name, type: f.type, size: f.size });
        }
        const now = new Date().toISOString();
        const rec = {
          id: id, createdAt: now, createdBy: FBL.user.name, regNo: m.q('#nlReg').value.trim(), receivedDate: m.q('#nlDate').value, urgency: m.q('#nlUrg').value,
          subject: m.q('#nlSubj').value.trim(), status: 'new', files: saved, endorsements: [], links: [], history: [{ at: new Date().toISOString(), by: FBL.user.name, what: 'ลงรับหนังสือ' }]
        };
        await A.saveLetter(rec, 'ลงรับ ' + rec.regNo);
        // ข้อมูลจากฐานข้อมูลอาจยังมาไม่ถึง — ใส่ไว้ก่อนเพื่อเปิดหน้าได้ทันที
        if (!A.letter(id)) S.letters.push(rec);
        m.close();
        A.openLetter(id, { autoAnalyze: true });
      } catch (e) { done(); A.toast(e.message, true); }
    };
  };

  /* ======================= ภาพรวม ======================= */
  A.views.dash = function (el) {
    const L = A.letters();
    const open = L.filter(A.isOpen);
    const over = open.filter(function (l) { const d = A.dueInfo(l); return d && d.d < 0; });
    const soon = open.filter(function (l) { const d = A.dueInfo(l); return d && d.d >= 0 && d.d <= 3; });
    const mon = U.today().slice(0, 7);
    const thisMonth = L.filter(function (l) { return (l.receivedDate || '').slice(0, 7) === mon; });
    const alerts = [];
    over.forEach(function (l) { alerts.push(['bad', '⛔', 'เกินกำหนด: ' + (l.subject || l.regNo) + ' (' + A.dueInfo(l).text + ')', l.id]); });
    soon.forEach(function (l) { alerts.push(['warn', '⏰', 'ใกล้ครบกำหนด: ' + (l.subject || l.regNo) + ' (' + A.dueInfo(l).text + ')', l.id]); });
    if (A.people().some(function (p) { return !p.name; })) alerts.push(['info', '👤', 'ยังไม่ได้กรอกชื่อบุคลากรบางตำแหน่ง — กรอกที่แท็บ "บุคลากร/ตำแหน่ง" เพื่อให้ชื่อ-ตำแหน่งในเกษียณถูกต้อง', 'people']);
    if (!A.me()) alerts.push(['info', '🔗', 'บัญชี "' + FBL.user.name + '" ยังไม่ได้ผูกกับบุคลากร — ผูกที่แท็บ "บุคลากร/ตำแหน่ง" ช่อง "ผู้ใช้ระบบ" ระบบจะเลือกชื่อ-ตำแหน่งผู้ลงนามให้อัตโนมัติ', 'people']);
    if (!EN.printerCfg().calibratedAt) alerts.push(['warn', '🖨️', 'เครื่องพิมพ์ของคอมพิวเตอร์เครื่องนี้ยังไม่ได้ปรับเทียบตำแหน่ง — ทำครั้งเดียวที่แท็บ "เครื่องพิมพ์"', 'printer']);
    if (!AI.ready()) alerts.push(['info', '🤖', 'ยังไม่ได้เปิดใช้ AI (ไม่บังคับ) — ระบบยังอ่านข้อความ/QR ได้เอง ดูประโยชน์ของ AI ที่แท็บ "AI ช่วยงาน"', 'ai']);
    const recent = L.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }).slice(0, 8);
    el.innerHTML =
      '<div class="kpis">' +
      kpi('หนังสือรับเดือนนี้', thisMonth.length, 'ฉบับ') + kpi('ค้างดำเนินการ', open.length, 'ฉบับ') +
      kpi('ใกล้ครบกำหนด (≤3 วัน)', soon.length, 'ฉบับ') + kpi('เกินกำหนด', over.length, 'ฉบับ') + '</div>' +
      '<div class="split"><div class="card"><div class="section-title">หนังสือล่าสุด<span class="right"><button class="btn btn-sm btn-outline" data-go="list">ดูทั้งหมด</button></span></div>' +
      (recent.length ? letterTable(recent, true) : '<div class="empty">ยังไม่มีหนังสือ — กด "+ รับหนังสือใหม่" ที่มุมขวาบน</div>') + '</div>' +
      '<div class="card"><div class="section-title">สิ่งที่ต้องทำ / แจ้งเตือน</div><div class="alert-list">' +
      (alerts.length ? alerts.map(function (a) {
        return '<div class="alert ' + a[0] + '"><span class="ic">' + a[1] + '</span><span>' + esc(a[2]) + '</span><button class="btn btn-sm btn-outline go" data-open="' + esc(a[3]) + '">เปิด</button></div>';
      }).join('') : '<div class="alert ok"><span class="ic">✅</span><span>ไม่มีงานค้างเร่งด่วน</span></div>') + '</div></div></div>';
    bindCommon(el);
  };
  function kpi(lb, n, unit) { return '<div class="kpi"><div class="lb">' + lb + '</div><div class="big">' + n + ' <small class="sm">' + unit + '</small></div></div>'; }
  function letterTable(rows, compact) {
    return '<div class="table-wrap"><table class="data"><thead><tr><th>เลขรับ</th>' + (compact ? '' : '<th>วันที่รับ</th><th>ที่ / ลงวันที่</th><th>จาก</th>') +
      '<th>เรื่อง</th><th>กำหนดส่ง</th>' + (compact ? '' : '<th>ผู้รับผิดชอบ</th>') + '<th>สถานะ</th></tr></thead><tbody>' +
      rows.map(function (l) {
        const due = A.dueInfo(l);
        const asg = A.person(l.assigneeId);
        return '<tr class="clickable" data-open="' + esc(l.id) + '"><td class="nowrap">' + esc(l.regNo || '') + '</td>' +
          (compact ? '' : '<td class="nowrap">' + esc(U.thDate(l.receivedDate, 'short')) + '</td><td class="small">' + esc(l.docNo || '') + '<br><span class="muted">' + esc(U.thDate(l.docDate, 'short')) + '</span></td><td class="small">' + esc(l.from || '') + '</td>') +
          '<td>' + A.urgBadge(l.urgency) + ' ' + esc(l.subject || '(ยังไม่ได้อ่านเรื่อง)') + ((l.links || []).length ? ' <span class="badge b-info" title="มี QR/ลิงก์">🔗 ' + l.links.length + '</span>' : '') + '</td>' +
          '<td class="nowrap">' + (due ? '<span class="badge ' + due.cls + '">' + esc(due.text) + '</span>' : (l.dueDate ? '<span class="muted small">' + esc(U.thDate(l.dueDate, 'short')) + '</span>' : '')) + '</td>' +
          (compact ? '' : '<td class="small">' + esc(asg ? A.fullName(asg) || asg.position : '') + '</td>') +
          '<td>' + A.statusBadge(l.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function bindCommon(el) {
    el.querySelectorAll('[data-open]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        const v = b.dataset.open;
        if (VIEWS.indexOf(v) >= 0) A.go(v); else A.openLetter(v);
      };
    });
    el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { A.go(b.dataset.go); }; });
  }

  /* ======================= ทะเบียนหนังสือรับ ======================= */
  A.views.list = function (el) {
    const ui = S.ui;
    let rows = A.letters();
    if (ui.st === 'open') rows = rows.filter(A.isOpen);
    else if (ui.st === 'late') rows = rows.filter(function (l) { const d = A.dueInfo(l); return d && d.d < 0; });
    else if (ui.st && ui.st !== 'all') rows = rows.filter(function (l) { return l.status === ui.st; });
    if (ui.q) {
      const q = ui.q.toLowerCase();
      rows = rows.filter(function (l) { return [l.regNo, l.docNo, l.subject, l.from, l.summary].join(' ').toLowerCase().indexOf(q) >= 0; });
    }
    rows.sort(function (a, b) { return String(b.receivedDate || '').localeCompare(String(a.receivedDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    const stOpts = [{ key: 'open', name: 'ค้างดำเนินการ' }, { key: 'late', name: 'เกินกำหนด' }, { key: 'all', name: 'ทั้งหมด' }]
      .concat(Object.keys(D.STATUS).map(function (k) { return { key: k, name: D.STATUS[k].name }; }));
    el.innerHTML = '<div class="card"><div class="section-title">ทะเบียนหนังสือรับ <span class="sub">' + rows.length + ' ฉบับ</span>' +
      '<span class="right"><button class="btn btn-sm btn-outline" id="lsCsv">ส่งออก CSV</button><button class="btn btn-sm btn-primary" id="lsNew">+ รับหนังสือใหม่</button></span></div>' +
      '<div class="toolbar"><input class="inp grow" id="lsQ" placeholder="ค้นหา เลขรับ / ที่ / เรื่อง / ผู้ส่ง" value="' + esc(ui.q) + '"><select class="inp" id="lsSt">' + A.opts(stOpts, ui.st) + '</select></div>' +
      (rows.length ? letterTable(rows, false) : '<div class="empty">ไม่พบหนังสือ</div>') + '</div>';
    bindCommon(el);
    const q = el.querySelector('#lsQ');
    q.oninput = function () { ui.q = q.value; clearTimeout(q._t); q._t = setTimeout(function () { A.render(); const n = $('lsQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    el.querySelector('#lsSt').onchange = function () { ui.st = this.value; A.render(); };
    el.querySelector('#lsNew').onclick = A.newLetterDialog;
    el.querySelector('#lsCsv').onclick = function () {
      const head = ['เลขรับ', 'วันที่รับ', 'ที่', 'ลงวันที่', 'จาก', 'เรื่อง', 'ความเร่งด่วน', 'กำหนดส่ง', 'ผู้รับผิดชอบ', 'สถานะ', 'สรุป', 'ลิงก์'];
      const lines = [head].concat(rows.map(function (l) {
        const a = A.person(l.assigneeId);
        return [l.regNo, U.thDate(l.receivedDate), l.docNo, U.thDate(l.docDate), l.from, l.subject, l.urgency, U.thDate(l.dueDate), a ? A.personLabel(a) : '',
          (D.STATUS[l.status] || {}).name, l.summary, (l.links || []).map(function (x) { return x.url; }).join(' ')];
      })).map(function (r) { return r.map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + lines], { type: 'text/csv' }));
      a.download = 'ทะเบียนหนังสือรับ-' + U.today() + '.csv'; a.click();
    };
  };

  /* ======================= แนวทางเกษียณ ======================= */
  A.views.tpl = function (el) {
    const T = A.templates();
    const can = A.can();
    el.innerHTML = '<div class="card"><div class="section-title">แนวทางเกษียณหนังสือ <span class="sub">เลือกใช้ได้ในหน้าหนังสือ · ข้อความในวงเล็บ { } ระบบเติมให้เอง</span>' +
      (can ? '<span class="right"><button class="btn btn-sm btn-outline" id="tpReset">คืนค่าเริ่มต้น</button><button class="btn btn-sm btn-primary" id="tpAdd">+ เพิ่มแนวทาง</button></span>' : '') + '</div>' +
      '<p class="hint" style="margin-top:-6px">ตัวแทนที่ใช้ได้: {เรียน} {ผู้รับมอบ} {เรื่อง} {สรุป} {กำหนดส่ง} {จาก} {เลขที่} {ลงวันที่} {เลขที่ตอบ} — ชื่อ ตำแหน่ง และวันที่ของผู้ลงนาม ระบบใส่ท้ายข้อความให้อัตโนมัติ</p>' +
      Object.keys(D.GROUPS).map(function (g) {
        const list = T.filter(function (t) { return t.group === g; });
        return '<h3 style="font-size:15px;color:var(--brand-900);margin:18px 0 8px">' + esc(D.GROUPS[g]) + ' <span class="muted small">' + list.length + ' แบบ</span></h3>' +
          '<div class="grid grid-2">' + list.map(function (t) {
            return '<div class="en-item"><div class="flex"><b>' + esc(t.title) + '</b>' +
              (can ? '<span style="margin-left:auto" class="flex"><button class="btn btn-sm btn-outline" data-ed="' + t.id + '">แก้ไข</button><button class="btn btn-sm btn-danger" data-del="' + t.id + '">ลบ</button></span>' : '') +
              '</div><pre>' + esc(t.text) + '</pre></div>';
          }).join('') + '</div>';
      }).join('') + '</div>' +
      '<div class="card guide"><div class="section-title">หลักการเขียนเกษียณหนังสือ (ย่อ)</div><ul>' +
      '<li><b>เกษียณเสนอ</b> ขึ้นต้น "เรียน" ตามด้วยตำแหน่งผู้บังคับบัญชา (ใช้ชื่อย่อตำแหน่งได้ เช่น ผขท.ระยอง) แล้วสรุปเรื่องสั้น ๆ + สิ่งที่ขอให้พิจารณา</li>' +
      '<li><b>เกษียณสั่งการ</b> สั้น ชัด ระบุผู้รับมอบ และกำหนดเวลา เช่น "ทราบ มอบ นายช่าง ... ดำเนินการ และรายงานภายในวันที่ ..."</li>' +
      '<li><b>เกษียณรายงานผล</b> บอกว่าดำเนินการอย่างไร เมื่อไร อ้างเลขหนังสือตอบถ้ามี</li>' +
      '<li>ทุกเกษียณต้องมี ลายมือชื่อ · (ชื่อเต็ม) · ตำแหน่ง · วัน เดือน ปี — ระบบเว้นที่ให้เซ็นชื่อด้วยปากกาหลังพิมพ์</li>' +
      '<li>เขียน/พิมพ์ในที่ว่างของหนังสือ ไม่ทับข้อความเดิม ถ้าที่ไม่พอให้ใช้ <b>แผ่นเกษียณต่อ</b> แนบท้าย (ระบบพิมพ์ให้ได้)</li></ul></div>';
    if (!can) return;
    el.querySelector('#tpAdd').onclick = function () { editTpl(null); };
    el.querySelector('#tpReset').onclick = async function () {
      if (!(await A.confirm('คืนแนวทางเกษียณเป็นค่าเริ่มต้น? (แนวทางที่เพิ่ม/แก้ไขเองจะหายไป)', 'คืนค่า', true))) return;
      const st = A.settings(); st.templates = JSON.parse(JSON.stringify(D.TEMPLATES));
      try { await A.saveSettings(st, 'คืนค่าแนวทางเกษียณ'); A.render(); } catch (e) { A.toast(e.message, true); }
    };
    el.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { editTpl(T.find(function (t) { return t.id === b.dataset.ed; })); }; });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await A.confirm('ลบแนวทางนี้?', 'ลบ', true))) return;
        const st = A.settings(); st.templates = st.templates.filter(function (t) { return t.id !== b.dataset.del; });
        try { await A.saveSettings(st, 'ลบแนวทางเกษียณ'); A.render(); } catch (e) { A.toast(e.message, true); }
      };
    });
  };
  function editTpl(t) {
    const m = A.modal({
      title: t ? 'แก้ไขแนวทางเกษียณ' : 'เพิ่มแนวทางเกษียณ',
      body: '<div class="grid grid-2"><div class="field"><label>ใช้เมื่อ</label><select id="tgG">' + A.opts(Object.keys(D.GROUPS).map(function (k) { return { key: k, name: D.GROUPS[k] }; }), t ? t.group : 'propose') + '</select></div>' +
        '<div class="field"><label>ชื่อแนวทาง</label><input id="tgT" value="' + esc(t ? t.title : '') + '"></div>' +
        '<div class="field span-all"><label>ข้อความ (เว้นวรรคหน้าบรรทัด 5 ช่อง = ย่อหน้า 1 ซม.)</label><textarea id="tgX" rows="6">' + esc(t ? t.text : 'เรียน {เรียน}\n     ') + '</textarea></div></div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="tgOk">บันทึก</button>'
    });
    m.q('#tgOk').onclick = async function () {
      const rec = { id: t ? t.id : 't' + Date.now().toString(36), group: m.q('#tgG').value, title: m.q('#tgT').value.trim(), text: m.q('#tgX').value.replace(/\s+$/, '') };
      if (!rec.title || !rec.text) return A.toast('กรอกชื่อและข้อความ', true);
      const st = A.settings();
      st.templates = (st.templates || []).filter(function (x) { return x.id !== rec.id; }).concat([rec]);
      try { await A.saveSettings(st, 'บันทึกแนวทางเกษียณ ' + rec.title); m.close(); A.render(); } catch (e) { A.toast(e.message, true); }
    };
  }

  /* ======================= บุคลากร/ตำแหน่ง ======================= */
  A.views.people = function (el) {
    const P = A.people(true);
    const can = A.can();
    const roleOpts = Object.keys(D.ROLES).map(function (k) { return { key: k, name: D.ROLES[k].name }; });
    el.innerHTML = '<div class="card"><div class="section-title">บุคลากร / ตำแหน่ง ตามบทบาทหน้าที่' +
      '<span class="sub">ใช้เติมชื่อ-ตำแหน่งท้ายเกษียณ และคำว่า "เรียน ..." ให้ถูกต้องตามสายบังคับบัญชา</span>' +
      (can ? '<span class="right"><button class="btn btn-sm btn-primary" id="ppAdd">+ เพิ่มบุคลากร</button></span>' : '') + '</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>บทบาท</th><th>คำนำหน้า</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง (เต็ม)</th><th>ชื่อย่อตำแหน่ง</th><th>เสนอถึง (ผู้บังคับบัญชา)</th><th>ผู้ใช้ระบบ</th><th class="c">ใช้งาน</th>' + (can ? '<th></th>' : '') + '</tr></thead><tbody>' +
      P.map(function (p) {
        const dis = can ? '' : ' disabled';
        return '<tr data-id="' + esc(p.id) + '">' +
          '<td><select class="inp" data-f="role"' + dis + '>' + A.opts(roleOpts, p.role) + '</select></td>' +
          '<td><input class="inp" style="width:80px" data-f="prefix" value="' + esc(p.prefix) + '" placeholder="นาย/นาง/นางสาว"' + dis + '></td>' +
          '<td><input class="inp" data-f="name" value="' + esc(p.name) + '" placeholder="ชื่อ นามสกุล"' + dis + '></td>' +
          '<td><input class="inp" data-f="position" value="' + esc(p.position) + '"' + dis + '></td>' +
          '<td><input class="inp" style="width:130px" data-f="abbr" value="' + esc(p.abbr) + '"' + dis + '></td>' +
          '<td><select class="inp" data-f="reportsTo"' + dis + '>' + A.opts(P.filter(function (x) { return x.id !== p.id; }).map(function (x) { return { key: x.id, name: x.abbr || x.position }; }), p.reportsTo, '—') + '</select></td>' +
          '<td><select class="inp" data-f="loginName"' + dis + '>' + A.opts(S.team.map(function (t) { return t.name; }), p.loginName, '—') + '</select></td>' +
          '<td class="c"><input type="checkbox" data-f="active"' + (p.active !== false ? ' checked' : '') + dis + '></td>' +
          (can ? '<td><button class="btn btn-sm btn-danger" data-del="' + esc(p.id) + '">ลบ</button></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (can ? '<div class="flex" style="margin-top:12px"><button class="btn btn-primary" id="ppSave">บันทึกรายชื่อ</button><span class="hint">แก้ได้เฉพาะเจ้าของระบบ/ผู้ดูแลระบบ</span></div>' : '<p class="hint">แก้ไขได้เฉพาะเจ้าของระบบหรือผู้ดูแลระบบ</p>') + '</div>' +
      '<div class="card guide"><div class="section-title">บทบาทหน้าที่ในการเกษียณหนังสือ</div><div class="table-wrap"><table class="data"><thead><tr><th>บทบาท</th><th>หน้าที่</th><th>แนวทางเกษียณที่ใช้</th></tr></thead><tbody>' +
      Object.keys(D.ROLES).map(function (k) { const r = D.ROLES[k]; return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.does) + '</td><td>' + esc(D.GROUPS[r.group]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="hint">"ผู้ใช้ระบบ" = ผูกบัญชีล็อกอินกับบุคลากร เมื่อบุคคลนั้นเปิดหน้าเกษียณ ระบบจะเลือกชื่อ-ตำแหน่งและแนวทางตามบทบาทให้ทันที</p></div>';
    if (!can) return;
    el.querySelector('#ppAdd').onclick = function () {
      const st = A.settings();
      st.people = (st.people || []).concat([{ id: 'p-' + Date.now().toString(36), role: 'staff', prefix: '', name: '', position: '', abbr: '', reportsTo: 'p-head', active: true }]);
      S.settings = st; A.render();
    };
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await A.confirm('ลบบุคลากรนี้ออกจากรายชื่อ?', 'ลบ', true))) return;
        const st = A.settings(); st.people = st.people.filter(function (p) { return p.id !== b.dataset.del; });
        try { await A.saveSettings(st, 'ลบบุคลากร'); A.render(); } catch (e) { A.toast(e.message, true); }
      };
    });
    el.querySelector('#ppSave').onclick = async function () {
      const st = A.settings();
      el.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
        const p = st.people.find(function (x) { return x.id === tr.dataset.id; }); if (!p) return;
        tr.querySelectorAll('[data-f]').forEach(function (i) { p[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
      });
      const done = A.busy(this);
      try { await A.saveSettings(st, 'บันทึกรายชื่อบุคลากร'); A.toast('บันทึกแล้ว'); updateWho(); } catch (e) { A.toast(e.message, true); }
      done();
    };
  };

  /* ======================= เครื่องพิมพ์ (ปรับเทียบ) ======================= */
  A.views.printer = function (el) {
    const p = EN.printerCfg();
    const fonts = D.FONTS.map(function (f) { return '<li>' + esc(f.key) + ' — ' + (EN.fontInstalled(f.key) ? '<span class="badge b-ok">มีในเครื่องนี้</span>' : '<span class="badge b-mute">ไม่มี</span>') + '</li>'; }).join('');
    el.innerHTML = '<div class="split"><div class="card"><div class="section-title">ปรับเทียบเครื่องพิมพ์ <span class="sub">ทำครั้งเดียวต่อเครื่องพิมพ์ ค่าเก็บในคอมพิวเตอร์เครื่องนี้</span></div>' +
      '<div class="steps">' +
      '<div class="st"><div><b>พิมพ์หน้าปรับเทียบ</b> บนกระดาษ A4 เปล่า <br><span class="hint">ในหน้าต่างพิมพ์ของ Chrome/Edge: ขนาดกระดาษ A4 · ระยะขอบ "ไม่มี" หรือ "ค่าเริ่มต้น" · มาตราส่วน 100% (ห้าม "พอดีกับหน้า") · ปิด "ส่วนหัวและส่วนท้าย"</span><br>' +
      '<button class="btn btn-sm btn-outline" id="prCal" style="margin-top:6px">🖨️ พิมพ์หน้าปรับเทียบ</button></div></div>' +
      '<div class="st"><div><b>วัดด้วยไม้บรรทัด</b> จากขอบซ้ายและขอบบนของกระดาษ ถึงจุดตัดกากบาท A และ B แล้วกรอกค่าที่วัดได้ (มม.)' +
      '<div class="grid grid-4" style="margin-top:8px"><div class="field"><label>A ห่างซ้าย</label><input type="number" step="0.5" id="prAx" value="20"></div><div class="field"><label>A ห่างบน</label><input type="number" step="0.5" id="prAy" value="20"></div>' +
      '<div class="field"><label>B ห่างซ้าย</label><input type="number" step="0.5" id="prBx" value="190"></div><div class="field"><label>B ห่างบน</label><input type="number" step="0.5" id="prBy" value="277"></div></div></div></div>' +
      '<div class="st"><div><b>บันทึกวิธีใส่กระดาษ</b> (ดูจากเครื่องหมาย ✗ ดินสอ) เช่น "ถาดมือ หน้าหงาย หัวกระดาษเข้าก่อน"' +
      '<div class="grid grid-2" style="margin-top:8px"><div class="field"><label>ชื่อเครื่องพิมพ์</label><input id="prName" value="' + esc(p.name) + '" placeholder="เช่น Brother ห้องหมวด"></div>' +
      '<div class="field"><label>วิธีใส่ต้นฉบับ</label><input id="prFeed" value="' + esc(p.feedNote) + '"></div></div></div></div></div>' +
      '<div class="flex" style="margin-top:14px"><button class="btn btn-primary" id="prSave">คำนวณและบันทึก</button><button class="btn btn-outline" id="prReset">ล้างค่า</button></div></div>' +
      '<div class="card"><div class="section-title">ค่าปัจจุบันของเครื่องนี้</div><dl class="kv">' +
      '<dt>เครื่องพิมพ์</dt><dd>' + esc(p.name || '—') + '</dd>' +
      '<dt>เลื่อนแนวนอน</dt><dd>' + (+p.dx || 0).toFixed(1) + ' มม.</dd><dt>เลื่อนแนวตั้ง</dt><dd>' + (+p.dy || 0).toFixed(1) + ' มม.</dd>' +
      '<dt>สเกล (กว้าง×สูง)</dt><dd>' + (+p.sx || 1).toFixed(4) + ' × ' + (+p.sy || 1).toFixed(4) + '</dd>' +
      '<dt>วิธีใส่ต้นฉบับ</dt><dd>' + esc(p.feedNote || '—') + '</dd>' +
      '<dt>ปรับเทียบเมื่อ</dt><dd>' + (p.calibratedAt ? esc(U.thDate(p.calibratedAt.slice(0, 10))) : '<span class="badge b-warn">ยังไม่ปรับเทียบ</span>') + '</dd></dl>' +
      '<h4 style="margin:16px 0 6px;color:var(--brand-900)">แบบอักษรราชการในเครื่องนี้</h4><ul class="small" style="margin:0;padding-left:18px">' + fonts + '</ul>' +
      '<p class="hint">ถ้าไม่มี TH SarabunIT๙ ให้ติดตั้งจากเว็บ สำนักงาน กพ./SIPA (ฟอนต์แห่งชาติ) แล้วเปิดหน้าเว็บนี้ใหม่ — ระหว่างนี้ระบบใช้ Sarabun แทน</p>' +
      '<p class="hint">หลังพิมพ์จริงแล้ว ใช้แท็บ "ตรวจหลังพิมพ์" ในหน้าหนังสือ ระบบวัดความคลาดเคลื่อนจากภาพสแกนและปรับค่านี้ให้อัตโนมัติ</p></div></div>';
    el.querySelector('#prCal').onclick = function () { EN.print('calib', {}); };
    el.querySelector('#prSave').onclick = function () {
      const ax = +$('prAx').value, ay = +$('prAy').value, bx = +$('prBx').value, by = +$('prBy').value;
      if (![ax, ay, bx, by].every(isFinite)) return A.toast('กรอกตัวเลขให้ครบ', true);
      const sx = (bx - ax) / 170, sy = (by - ay) / 257;
      if (sx < 0.9 || sx > 1.1 || sy < 0.9 || sy > 1.1) return A.toast('ค่าที่วัดต่างจากปกติมาก — ตรวจว่าพิมพ์ที่ 100% (ไม่ใช่ "พอดีกับหน้า") แล้ววัดใหม่', true);
      const cfg = { name: $('prName').value.trim(), feedNote: $('prFeed').value.trim(), sx: sx, sy: sy, dx: ax - 20 * sx, dy: ay - 20 * sy, calibratedAt: new Date().toISOString() };
      EN.setPrinterCfg(cfg); A.toast('บันทึกค่าปรับเทียบแล้ว'); A.render();
    };
    el.querySelector('#prReset').onclick = function () { EN.setPrinterCfg({ name: '', dx: 0, dy: 0, sx: 1, sy: 1, feedNote: '', calibratedAt: '' }); A.render(); };
  };

  /* ======================= AI ช่วยงาน ======================= */
  A.views.ai = function (el) {
    const c = AI.cfg();
    el.innerHTML = '<div class="card"><div class="section-title">AI Agent ช่วยงานสารบรรณ — ทำอะไรให้บ้าง</div>' +
      '<p style="margin-top:0">"AI Agent" คือ AI ที่ทำงานต่อกันหลายขั้นตอนเอง ตั้งแต่อ่านหนังสือจนร่างเกษียณเสร็จ โดย<b>คุณเป็นผู้ตรวจและตัดสินใจขั้นสุดท้าย</b>ก่อนพิมพ์ทุกครั้ง</p>' +
      '<div class="flow">' +
      '<div class="fx"><b>1. รับ</b>สแกน/อัปโหลดหนังสือ ลงทะเบียนรับ</div>' +
      '<div class="fx"><b>2. อ่าน</b>ดึงข้อความ + OCR + สแกน QR ทุกหน้า (ทำในเครื่อง)</div>' +
      '<div class="fx ai"><b>3. วิเคราะห์ 🤖</b>สรุปเรื่อง ประเด็น สิ่งที่ต้องทำ กำหนดส่ง ความเร่งด่วน ประเภท</div>' +
      '<div class="fx ai"><b>4. เสนอ 🤖</b>ผู้รับผิดชอบตามบทบาท + ร่างเกษียณ 3 แบบ (เสนอ/สั่งการ/รายงาน)</div>' +
      '<div class="fx"><b>5. จัดวาง</b>หาที่ว่างบนต้นฉบับ ตรวจไม่ทับข้อความ ชดเชยเครื่องพิมพ์</div>' +
      '<div class="fx me"><b>6. คุณตรวจ ✍️</b>แก้ข้อความ เลือกผู้ลงนาม พิมพ์ทดสอบ → พิมพ์จริง → เซ็นชื่อ</div>' +
      '<div class="fx"><b>7. ติดตาม</b>เตือนใกล้/เกินกำหนด ตรวจหลังพิมพ์ ปรับเครื่องพิมพ์อัตโนมัติ</div>' +
      '<div class="fx ai"><b>8. ร่างหนังสือตอบ 🤖</b>ร่างบันทึกข้อความ/หนังสือภายนอกตอบต้นเรื่อง</div></div>' +
      '<h4 style="color:var(--brand-900);margin:16px 0 6px">ประโยชน์ที่ได้เพิ่ม</h4><ul class="small">' +
      '<li><b>ลดเวลาอ่าน</b> — หนังสือยาวหลายหน้า ได้สรุป 3–4 บรรทัด + รายการสิ่งที่ต้องทำพร้อมกำหนดส่ง</li>' +
      '<li><b>ไม่พลาดกำหนดส่ง</b> — AI หา "ภายในวันที่ ..." ที่ซ่อนอยู่ในเนื้อหา/สิ่งที่ส่งมาด้วย ระบบนำไปแจ้งเตือนในหน้าภาพรวม</li>' +
      '<li><b>เกษียณสำนวนสม่ำเสมอ</b> — ร่างตามแนวทางของหน่วยงานเอง (แท็บแนวทางเกษียณ) และชื่อ-ตำแหน่งจริง (แท็บบุคลากร)</li>' +
      '<li><b>อ่านภาพสแกน/ลายมือได้ดีกว่า OCR ทั่วไป</b> — รวมถึงเกษียณลายมือของผู้บังคับบัญชาที่เขียนมาก่อน</li>' +
      '<li><b>ตรวจลิงก์/QR</b> — บอกว่าลิงก์ใช้ทำอะไร (กรอกแบบสำรวจ/ดาวน์โหลดเอกสาร) ร่วมกับการตรวจโดเมนของระบบ</li></ul>' +
      '<div class="alert warn"><span class="ic">⚠️</span><span>ข้อควรระวัง: เมื่อกดใช้ AI ไฟล์หนังสือจะถูกส่งไปประมวลผลที่ Anthropic (ผู้ให้บริการ Claude) — <b>ห้ามใช้กับหนังสือชั้นความลับ (ลับ/ลับมาก/ลับที่สุด) หรือเอกสารที่มีข้อมูลส่วนบุคคลอ่อนไหว</b> ระบบจะเตือนและไม่ส่งให้อัตโนมัติถ้าตรวจพบคำว่า "ลับ" และ AI อาจผิดพลาดได้ ต้องตรวจทุกครั้ง</span></div></div>' +
      '<div class="card"><div class="section-title">ตั้งค่า AI (Claude) <span class="sub">เก็บเฉพาะในเบราว์เซอร์เครื่องนี้ ไม่บันทึกลงฐานข้อมูล</span></div>' +
      '<div class="grid grid-3"><div class="field span-2"><label>Anthropic API key</label>' + A.pwField('aiKey', 'sk-ant-...', 'off') + '<span class="hint">สมัคร/สร้าง key ที่ console.anthropic.com (มีค่าใช้จ่ายตามการใช้งาน ประมาณไม่กี่บาทต่อหนังสือ 1 ฉบับ) · ไม่ต้องใส่ก็ใช้ระบบได้ แค่ไม่มีฟังก์ชัน AI</span></div>' +
      '<div class="field"><label>โมเดล</label><select id="aiModel">' + A.opts([{ key: 'claude-opus-5', name: 'Claude Opus 5 (แม่นยำที่สุด · แนะนำ)' }, { key: 'claude-sonnet-5', name: 'Claude Sonnet 5 (ประหยัดกว่า)' }, { key: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (ถูกและเร็วที่สุด)' }], c.model) + '</select></div>' +
      '<div class="field span-all"><label><input type="checkbox" id="aiAuto"' + (c.auto ? ' checked' : '') + '> ให้ AI วิเคราะห์อัตโนมัติทันทีที่รับหนังสือใหม่ (ยกเว้นหนังสือลับ)</label></div></div>' +
      '<div class="flex" style="margin-top:12px"><button class="btn btn-primary" id="aiSave">บันทึก</button><button class="btn btn-outline" id="aiTest">ทดสอบการเชื่อมต่อ</button><button class="btn btn-ghost" id="aiClear">ลบ key ออกจากเครื่องนี้</button></div></div>';
    $('aiKey').value = c.key || '';
    const read = function () { return { key: $('aiKey').value.trim(), model: $('aiModel').value, auto: $('aiAuto').checked }; };
    $('aiSave').onclick = function () { AI.setCfg(read()); A.toast('บันทึกแล้ว'); };
    $('aiClear').onclick = function () { AI.setCfg({ key: '', model: 'claude-opus-5', auto: false }); A.render(); };
    $('aiTest').onclick = async function () {
      AI.setCfg(read());
      const done = A.busy(this, 'กำลังทดสอบ...');
      try { const r = await AI.test(); A.toast('เชื่อมต่อสำเร็จ: ' + r.trim().slice(0, 30)); } catch (e) { A.toast(e.message, true); }
      done();
    };
  };

  /* ======================= คู่มือ ======================= */
  A.views.guide = function (el) {
    el.innerHTML = '<div class="card guide"><div class="section-title">วิธีตรวจว่าพิมพ์เกษียณลงต้นฉบับได้ตรงตำแหน่ง</div>' +
      '<p style="margin-top:0">ปัญหาหลักของการพิมพ์ลงต้นฉบับมี 4 อย่าง ระบบนี้แก้แต่ละอย่างดังนี้</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>ปัญหา</th><th>วิธีป้องกัน / ตรวจสอบ</th><th>อยู่ตรงไหนในระบบ</th></tr></thead><tbody>' +
      '<tr><td><b>1. ไม่รู้ว่าที่ว่างอยู่ตรงไหน</b></td><td>สแกนต้นฉบับตอนรับ → ระบบวิเคราะห์หมึกบนหน้าเป็นตาราง 1×1 มม. แล้ว<b>หาที่ว่างที่พอดีกับขนาดข้อความให้อัตโนมัติ</b> (เลือกมุมที่ต้องการได้) และลากกรอบวางเองบนภาพได้</td><td>หน้าหนังสือ → เกษียณ &amp; พิมพ์ → "หาที่ว่างอัตโนมัติ"</td></tr>' +
      '<tr><td><b>2. พิมพ์ทับข้อความเดิม/ตรายาง/เกษียณก่อนหน้า</b></td><td>ตรวจหมึกในกรอบทุกครั้งที่ขยับ (กรอบเป็น<b>สีแดง</b>เมื่อทับ) + จำตำแหน่งเกษียณที่พิมพ์ไปแล้วทุกครั้ง แม้ไม่ได้สแกนใหม่ก็กันไม่ให้ทับกัน</td><td>รายการตรวจสอบก่อนพิมพ์ (✅/⚠️)</td></tr>' +
      '<tr><td><b>3. เครื่องพิมพ์ดึงกระดาษเยื้อง/ย่อขยาย</b></td><td><b>ปรับเทียบเครื่องพิมพ์</b>ครั้งเดียว: พิมพ์หน้ากากบาท วัดด้วยไม้บรรทัด ระบบคำนวณชดเชยทั้งการเลื่อนและสเกล · ตั้งพิมพ์ 100% ขอบ 0 เสมอ</td><td>แท็บ "เครื่องพิมพ์"</td></tr>' +
      '<tr><td><b>4. ใส่กระดาษผิดด้าน/กลับหัว</b></td><td>ทำเครื่องหมาย ✗ ดินสอที่มุมกระดาษเปล่าตอนพิมพ์หน้าปรับเทียบ แล้วจดวิธีใส่ไว้ ระบบเตือนวิธีใส่ทุกครั้งก่อนพิมพ์จริง</td><td>แท็บ "เครื่องพิมพ์" → วิธีใส่ต้นฉบับ</td></tr>' +
      '</tbody></table></div>' +
      '<h4>ขั้นตอนพิมพ์ที่ปลอดภัยที่สุด (แนะนำ)</h4><div class="steps">' +
      '<div class="st"><div><b>พิมพ์ทดสอบบนกระดาษเปล่า</b> — ระบบพิมพ์ภาพต้นฉบับจาง ๆ + ข้อความเกษียณ + กากบาทมุม</div></div>' +
      '<div class="st"><div><b>วางซ้อนต้นฉบับ แล้วส่องกับแสงไฟ/กระจกหน้าต่าง</b> (light-box) ดูว่าข้อความไม่ทับของเดิม และขอบกระดาษตรงกับกากบาท</div></div>' +
      '<div class="st"><div><b>ใส่ต้นฉบับตามวิธีที่บันทึกไว้</b> (ถาดมือ/หน้าหงายหรือคว่ำ/หัวกระดาษเข้าก่อน) ครั้งละ 1 แผ่น เฉพาะหน้าที่จะพิมพ์</div></div>' +
      '<div class="st"><div><b>พิมพ์จริง</b> — พิมพ์เฉพาะข้อความ (ไม่มีภาพพื้นหลัง) แล้วเซ็นชื่อด้วยปากกาในช่องว่างเหนือ (ชื่อ)</div></div>' +
      '<div class="st"><div><b>ตรวจหลังพิมพ์</b> — สแกนแผ่นที่พิมพ์แล้วอัปโหลด ระบบเทียบกับภาพเดิม บอกว่าคลาดกี่มม. และปรับค่าเครื่องพิมพ์ให้ครั้งถัดไปแม่นขึ้น</div></div></div>' +
      '<h4>วิธีเสริมอื่น ๆ</h4><ul>' +
      '<li><b>กระดาษไข/แผ่นใส</b> พิมพ์แผ่นทดสอบบนกระดาษไข วางทับต้นฉบับจะเห็นชัดโดยไม่ต้องส่องไฟ</li>' +
      '<li><b>ขอบพิมพ์ไม่ถึง</b> เครื่องพิมพ์ส่วนใหญ่พิมพ์ไม่ได้ห่างขอบน้อยกว่า ~5 มม. ระบบเตือนเมื่อกรอบชิดขอบเกิน</li>' +
      '<li><b>ที่ว่างไม่พอ</b> ใช้ "พิมพ์แผ่นเกษียณต่อ" (A4 มีหัวอ้างเลขหนังสือ/เรื่อง) แนบท้ายต้นฉบับ — ถูกต้องตามแนวปฏิบัติงานสารบรรณ</li>' +
      '<li><b>กระดาษยับ/พับ</b> รีดให้เรียบก่อน เครื่องพิมพ์เลเซอร์ใช้ถาดป้อนมือ (manual feed) จะเยื้องน้อยกว่าถาดล่าง</li>' +
      '<li><b>หน้า 2 ขึ้นไป</b> เลือกหน้าที่จะพิมพ์ในระบบ แล้วใส่เฉพาะแผ่นนั้นเข้าเครื่อง</li></ul></div>' +
      '<div class="card guide"><div class="section-title">การใช้งานประจำวัน</div><div class="table-wrap"><table class="data"><thead><tr><th>เมื่อ</th><th>ทำอะไร</th></tr></thead><tbody>' +
      '<tr><td>ได้รับหนังสือ</td><td>สแกน → "+ รับหนังสือใหม่" → ระบบอ่านข้อความ/QR (และ AI ถ้าเปิดไว้) → ตรวจสรุปและกำหนดส่ง → บันทึก</td></tr>' +
      '<tr><td>ธุรการเสนอ</td><td>เกษียณ &amp; พิมพ์ → ผู้ลงนาม = ธุรการ → เลือกแนวทาง "เสนอ" → พิมพ์ → เสนอแฟ้ม</td></tr>' +
      '<tr><td>หัวหน้าสั่งการ</td><td>เลือกผู้ลงนาม = หัวหน้าหมวด → แนวทาง "สั่งการ" + เลือกผู้รับมอบ → พิมพ์ต่อใต้เกษียณเดิม (ระบบหาที่ว่างถัดไปให้)</td></tr>' +
      '<tr><td>มี QR/ลิงก์</td><td>แท็บ QR &amp; ลิงก์ → ตรวจโดเมน → เปิด/คัดลอกไปกรอกข้อมูล</td></tr>' +
      '<tr><td>ดำเนินการเสร็จ</td><td>ผู้ปฏิบัติพิมพ์เกษียณรายงานผล → สถานะ "ดำเนินการแล้ว" → เก็บเข้าแฟ้ม</td></tr></tbody></table></div></div>';
  };

  /* ======================= ตั้งค่า ======================= */
  /* สมุดชื่อล็อกอิน (แผน 6) — เจ้าของระบบกดย้ายครั้งเดียว (ใช้ร่วม 3 ระบบ: หนังสือราชการ / ควบคุมงานโครงการ / ผังจราจร)
     หน้าล็อกอินเปิดดูได้โดยไม่ต้องล็อกอิน จึงอ่านได้เฉพาะ "ชื่อ → อีเมลสังเคราะห์" จากสมุดชื่อ (login_directory)
     หลังย้าย ตารางรายชื่อทีม (มีสถานะเจ้าของ/ผู้ดูแล) จะอ่านได้เฉพาะสมาชิกที่ล็อกอินแล้ว — ระหว่างย้ายไม่มีใครล็อกอินไม่ได้ */
  async function renderDirNotice(el) {
    const box = el.querySelector('#dirNotice');
    if (!box || !FBL.user || !FBL.user.isOwner || FBL.mode === 'demo' || !FBL.loginDirStatus) return;
    let st;
    try { st = await FBL.loginDirStatus(); } catch (e) { box.innerHTML = ''; return; }
    if (!box.isConnected) return;
    const bad = st.missing.length + st.extra.length;
    if (st.ready && !bad) { box.innerHTML = ''; return; }
    const why = !st.ready
      ? 'ยังไม่ได้ย้ายรายชื่อไปสมุดชื่อล็อกอิน — ตอนนี้คนนอกที่เปิดหน้านี้ยังเห็นว่าใครเป็นเจ้าของ/ผู้ดูแลระบบ กดปุ่มด้านล่างครั้งเดียวเพื่อย้าย (ไม่กระทบการล็อกอินของใคร; รายชื่อนี้ใช้ร่วมกับอีก 2 ระบบในโปรเจกต์เดียวกัน)'
      : 'สมุดชื่อล็อกอินไม่ตรงกับรายชื่อทีม ' + bad + ' ชื่อ (' + st.missing.concat(st.extra).join(', ') + ') — กดซิงก์เพื่อให้ตรงกัน';
    box.innerHTML = '<div style="margin-top:12px;padding:12px;border:1px solid #f59e0b;background:#fff8e1;border-radius:10px;color:#7a4b00;font-size:13px">⚠ ' + esc(why) +
      '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="dirMigrate">' + (st.ready ? 'ซิงก์สมุดชื่อล็อกอิน' : 'ย้ายรายชื่อไปสมุดชื่อล็อกอิน') + '</button></div></div>';
    const b = box.querySelector('#dirMigrate');
    b.onclick = async function () {
      const done = A.busy(b, 'กำลังดำเนินการ...');
      try { const r = await FBL.migrateLoginDirectory(); A.toast('ย้ายสมุดชื่อล็อกอินเรียบร้อย (' + r.total + ' ชื่อ)'); }
      catch (e) { A.toast(e.message, true); }
      done();
      renderDirNotice(el);
    };
  }

  A.views.settings = async function (el) {
    const u = FBL.user, own = u.isOwner, can = A.can();
    const trash = S.letters.filter(function (l) { return l.deletedAt; });
    el.innerHTML = '<div class="split"><div>' +
      '<div class="card"><div class="section-title">ผู้ใช้งานระบบ' + (own ? '<span class="right"><button class="btn btn-sm btn-primary" id="stAdd">+ เพิ่มผู้ใช้</button></span>' : '') + '</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>ชื่อ</th><th>สิทธิ์</th>' + (own ? '<th></th>' : '') + '</tr></thead><tbody>' +
      S.team.map(function (m) {
        return '<tr><td>' + esc(m.name) + A.roleTag(m) + '</td><td>' + (m.isOwner ? 'เจ้าของระบบ' : (m.isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน')) + '</td>' +
          (own ? '<td class="nowrap">' + (m.isOwner ? '' : '<button class="btn btn-sm btn-outline" data-adm="' + esc(m.name) + '">' + (m.isAdmin ? 'ถอดผู้ดูแล' : 'ตั้งเป็นผู้ดูแล') + '</button> ' +
            '<button class="btn btn-sm btn-outline" data-rpw="' + esc(m.name) + '">ตั้งรหัสใหม่</button> <button class="btn btn-sm btn-danger" data-rm="' + esc(m.name) + '">ลบ</button>') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (own ? '<div id="dirNotice"></div>' : '') +
      '<div class="flex" style="margin-top:12px"><button class="btn btn-outline btn-sm" id="stMyPw">เปลี่ยนรหัสผ่านของฉัน</button></div></div>' +
      '<div class="card"><div class="section-title">ถังขยะ <span class="sub">' + trash.length + ' ฉบับ</span></div>' +
      (trash.length ? '<div class="table-wrap"><table class="data"><tbody>' + trash.map(function (l) {
        return '<tr><td>' + esc(l.regNo) + ' · ' + esc(l.subject || '') + '<br><span class="muted small">ลบโดย ' + esc(l.deletedBy || '') + '</span></td><td class="nowrap"><button class="btn btn-sm btn-outline" data-rs="' + esc(l.id) + '">กู้คืน</button>' +
          (can ? ' <button class="btn btn-sm btn-danger" data-hd="' + esc(l.id) + '">ลบถาวร</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">ว่าง</div>') + '</div></div>' +
      '<div><div class="card"><div class="section-title">สำรองข้อมูล</div><div class="flex"><button class="btn btn-outline" id="stExp">ส่งออกข้อมูลทั้งหมด (.json)</button></div>' +
      '<p class="hint">ไฟล์ .json มีทะเบียน ผลวิเคราะห์ เกษียณ และการตั้งค่า (ไม่รวมไฟล์สแกน)</p>' +
      '<p class="hint">ไฟล์สแกนเก็บที่: <b>' + ({ drive: 'Google Drive', firestore: 'Firestore (พื้นที่ฟรี 1 GB ใช้ร่วมกับระบบอื่นในโปรเจกต์)', browser: 'เบราว์เซอร์เครื่องนี้ (โหมดทดลอง)' }[FBL.fileStore] || '-') + '</b></p>' +
      (can && FBL.fileStore === 'drive' ? '<div style="margin-top:10px"><div class="small"><b>ย้ายไฟล์สแกนเดิมจาก Firestore ไป Google Drive</b></div>' +
        '<p class="hint" style="margin:4px 0 8px">ใช้เมื่อเคยเก็บไฟล์ใน Firestore ก่อนตั้งค่า Drive — ลบออกจาก Firestore เฉพาะไฟล์ที่ Drive ยืนยันว่าครบแล้ว หยุดกลางทางกดใหม่ได้</p>' +
        '<button class="btn btn-outline" id="stMvDrive">เริ่มย้ายไฟล์</button><div id="stMvInfo" class="hint" style="margin-top:6px"></div></div>' : '') +
      (FBL.mode === 'demo' ? '<button class="btn btn-danger" id="stReset" style="margin-top:8px">ล้างข้อมูลทดลองทั้งหมด</button>' : '') + '</div>' +
      (can ? '<div class="card"><div class="section-title">ประวัติการแก้ไขล่าสุด</div><div id="stLog" class="small muted">กำลังโหลด...</div></div>' : '') + '</div></div>';
    const q = function (s) { return el.querySelector(s); };
    if (own) {
      renderDirNotice(el);
      q('#stAdd').onclick = function () {
        const m = A.modal({
          title: 'เพิ่มผู้ใช้', size: 'narrow',
          body: '<div class="field" style="margin-bottom:10px"><label>ชื่อ-นามสกุล</label><input id="amN"></div><div class="field" style="margin-bottom:10px"><label>รหัสผ่านเริ่มต้น (≥ 8 ตัว)</label>' + A.pwField('amP') + '</div>' +
            '<div class="field"><label><input type="checkbox" id="amA"> ผู้ดูแลระบบ (แก้แนวทาง/บุคลากร ลบถาวรได้)</label></div>',
          foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="amOk">เพิ่ม</button>'
        });
        m.q('#amOk').onclick = async function () {
          const p = m.q('#amP').value;
          if (p.length < 8) return A.toast('รหัสผ่านอย่างน้อย 8 ตัวอักษร', true);
          const done = A.busy(this);
          try { await FBL.addMember(m.q('#amN').value, p, m.q('#amA').checked); S.team = FBL.team(); m.close(); A.render(); } catch (e) { done(); A.toast(e.message, true); }
        };
      };
      el.querySelectorAll('[data-adm]').forEach(function (b) {
        b.onclick = async function () {
          const t = S.team.find(function (x) { return x.name === b.dataset.adm; });
          try { await FBL.setMemberAdmin(t.name, !t.isAdmin); S.team = FBL.team(); A.render(); } catch (e) { A.toast(e.message, true); }
        };
      });
      el.querySelectorAll('[data-rm]').forEach(function (b) {
        b.onclick = async function () {
          if (!(await A.confirm('ลบผู้ใช้ ' + b.dataset.rm + '?\nรายชื่อผู้ใช้ใช้ร่วมกับระบบผู้ควบคุมงานโครงการและระบบผังจราจร — จะเข้าทั้ง 3 ระบบไม่ได้อีก', 'ลบ', true))) return;
          try { await FBL.removeMember(b.dataset.rm); S.team = FBL.team(); A.render(); } catch (e) { A.toast(e.message, true); }
        };
      });
      el.querySelectorAll('[data-rpw]').forEach(function (b) { b.onclick = function () { pwDialog(b.dataset.rpw); }; });
    }
    q('#stMyPw').onclick = function () { pwDialog(null); };
    el.querySelectorAll('[data-rs]').forEach(function (b) { b.onclick = async function () { try { await FBL.restore('letters', b.dataset.rs); A.toast('กู้คืนแล้ว'); } catch (e) { A.toast(e.message, true); } }; });
    el.querySelectorAll('[data-hd]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await A.confirm('ลบถาวร รวมไฟล์สแกน? กู้คืนไม่ได้', 'ลบถาวร', true))) return;
        const l = A.letter(b.dataset.hd);
        try {
          for (const f of (l.files || [])) await FBL.deleteFile(f.path);
          await FBL.hardDelete('letters', l.id, l.regNo + ' ' + (l.subject || ''));
          A.toast('ลบถาวรแล้ว');
        } catch (e) { A.toast(e.message, true); }
      };
    });
    q('#stExp').onclick = function () {
      const data = { exportedAt: new Date().toISOString(), letters: S.letters, settings: A.settings() };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      a.download = 'สำรอง-หนังสือราชการ-' + U.today() + '.json'; a.click();
    };
    if (q('#stMvDrive')) q('#stMvDrive').onclick = async function () {
      if (!(await A.confirm('ย้ายไฟล์สแกนเดิมทั้งหมดจาก Firestore ไป Google Drive? ห้ามปิดหน้านี้จนกว่าจะเสร็จ', 'เริ่มย้าย'))) return;
      const info = q('#stMvInfo');
      const done = A.busy(this, 'กำลังย้าย...');
      try {
        const r = await FBL.migrateFilesToDrive(function (ok, bad, path) { info.textContent = 'ย้ายแล้ว ' + ok + ' ไฟล์' + (bad ? ' · ไม่สำเร็จ ' + bad : '') + ' — ' + path; });
        info.innerHTML = 'เสร็จแล้ว: ย้าย <b>' + r.done + '</b> ไฟล์' + (r.failed.length
          ? ' · ไม่สำเร็จ <b>' + r.failed.length + '</b> ไฟล์ (ยังอยู่ใน Firestore เปิดดูได้ตามปกติ กดย้ายใหม่ได้)<br>' + r.failed.slice(0, 10).map(esc).join('<br>')
          : (r.done ? '' : ' (ไม่มีไฟล์เหลือใน Firestore แล้ว)'));
      } catch (e) { info.textContent = ''; A.toast(e.message, true); }
      done();
    };
    if (q('#stReset')) q('#stReset').onclick = async function () {
      if (!(await A.confirm('ล้างข้อมูลทดลองทั้งหมดในเบราว์เซอร์นี้?', 'ล้างข้อมูล', true))) return;
      FBL.resetDemo(); location.reload();
    };
    if (can) {
      try {
        const log = await FBL.loadLog(60);
        const box = q('#stLog');
        if (box) box.innerHTML = log.length ? '<div class="table-wrap"><table class="data"><tbody>' + log.map(function (x) {
          return '<tr><td class="nowrap">' + esc((x.ts || '').slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(x.actorName) + '</td><td>' + esc(x.action) + '</td><td>' + esc(x.summary) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : 'ยังไม่มี';
      } catch (e) { const box = q('#stLog'); if (box) box.textContent = e.message; }
    }
  };
  function pwDialog(name) {
    const m = A.modal({
      title: name ? 'ตั้งรหัสผ่านใหม่ให้ ' + name : 'เปลี่ยนรหัสผ่านของฉัน', size: 'narrow',
      body: '<div class="field"><label>รหัสผ่านใหม่ (≥ 8 ตัว)</label>' + A.pwField('pwN') + '</div>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="pwOk">บันทึก</button>'
    });
    m.q('#pwOk').onclick = async function () {
      const p = m.q('#pwN').value;
      if (p.length < 8) return A.toast('รหัสผ่านอย่างน้อย 8 ตัวอักษร', true);
      try { if (name) await FBL.resetMemberPassword(name, p); else await FBL.changeMyPassword(p); S.team = FBL.team(); m.close(); A.toast('เปลี่ยนรหัสผ่านแล้ว'); } catch (e) { A.toast(e.message, true); }
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
