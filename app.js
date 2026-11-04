/* ==========================================================================
   app.js — แกนหลัก: ล็อกอิน, ภาพรวม, ทะเบียนหนังสือ, แนวทางเกษียณ, บุคลากร/ตำแหน่ง,
            เครื่องพิมพ์ (ปรับเทียบ), AI ช่วยงาน, คู่มือ, ตั้งค่า
   (หน้าทำงานกับหนังสือแต่ละฉบับ — สรุป/QR/เกษียณ/พิมพ์/ตรวจหลังพิมพ์ อยู่ใน app-letter.js)
   ========================================================================== */
(function () {
  'use strict';
  const D = window.LTR_DATA, esc = U.esc;
  const S = { team: [], letters: [], out: [], settings: null, view: 'dash', ui: { q: '', st: 'open' }, openId: null };
  const A = window.App = { S: S, views: {}, D: D };
  function $(id) { return document.getElementById(id); }
  A.$ = $;

  /* ไอคอนเส้นชุดเดียว ใช้แทนอิโมจิในส่วนหน้าตาหลัก */
  const ICONS = {
    inbox: '<path d="M4 13l2.5-7.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>',
    stack: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M10.3 4.2L2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    chev: '<path d="M9.5 6l6 6-6 6"/>'
  };
  A.ic = function (n) { return '<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; };
  // หัวหน้าแบบเดียวกันทุกแท็บ: ชื่อ · คำอธิบายสั้น · ปุ่มคำสั่งชิดขวา
  A.pageHead = function (title, sub, actions) {
    return '<div class="pagehead"><div class="ph-t"><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="ph-a">' + actions + '</div>' : '') + '</div>';
  };

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
  A.outs = function () { return S.out.filter(function (l) { return !l.deletedAt; }); };
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
    const head = '<img src="logo.png" alt="ตรากรมทางหลวง" class="auth-logo"><h2>ผู้ช่วยสารบรรณ</h2>' +
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
    $('tabs').querySelectorAll('.tab-btn').forEach(function (b) { b.onclick = function () { A.go(b.dataset.view === 'settings' ? lastSetView : b.dataset.view); }; });
    const [letters, settings, out] = await Promise.all([
      FBL.watch('letters', function (docs) { S.letters = docs; A.scheduleRender(); }),
      FBL.watch('settings', function (docs) { S.settings = docs.find(function (d) { return d.id === 'app'; }) || null; updateWho(); A.scheduleRender(); }),
      FBL.watch('out', function (docs) { S.out = docs; A.scheduleRender(); })
    ]);
    S.letters = letters; S.out = out; S.settings = settings.find(function (d) { return d.id === 'app'; }) || null;
    await migratePeople();
    updateWho();
    hideLoading();
    A.go((location.hash || '').replace('#', '') || 'dash', true);
  }
  // ปรับตัวย่อตำแหน่งเดิมในฐานข้อมูลให้ตรงกับหนังสือจริง และเติมชื่อหัวหน้าหมวดถ้ายังว่าง — ไม่ทับค่าที่ผู้ใช้กรอกเอง
  async function migratePeople() {
    if (!S.settings || !A.can()) return;
    const st = JSON.parse(JSON.stringify(S.settings));
    const dflt = {};
    D.PEOPLE.forEach(function (p) { dflt[p.id] = p; });
    const OLD_ABBR = { 'p-dir': 'ผขท.ระยอง', 'p-head': 'หน.หมวดฯ เชิงเนิน' };
    let changed = false;
    (st.people || []).forEach(function (p) {
      if (OLD_ABBR[p.id] && p.abbr === OLD_ABBR[p.id]) { p.abbr = dflt[p.id].abbr; changed = true; }
      if (p.id === 'p-head' && !p.name) { p.prefix = dflt[p.id].prefix; p.name = dflt[p.id].name; changed = true; }
    });
    if (!changed) return;
    try { await A.saveSettings(st, 'ปรับตัวย่อตำแหน่งและชื่อหัวหน้าหมวด'); } catch (e) { console.error(e); }
  }
  function updateWho() {
    const me = A.me();
    $('whoDisplay').textContent = FBL.user.name + (me ? ' · ' + (me.abbr || me.position) : '');
  }

  const VIEWS = ['dash', 'list', 'letter', 'out', 'tpl', 'people', 'printer', 'ai', 'guide', 'settings'];
  // แท็บ "ตั้งค่า" รวมหน้าเหล่านี้ไว้ด้วยกัน (สลับด้วยแถบย่อยด้านบน)
  const SET_NAV = [['people', 'บุคลากร'], ['printer', 'เครื่องพิมพ์'], ['ai', 'AI ช่วยงาน'], ['settings', 'ผู้ใช้และข้อมูล']];
  const isSetView = function (v) { return SET_NAV.some(function (x) { return x[0] === v; }); };
  let lastSetView = 'people';
  A.go = function (v, noHist) {
    if (VIEWS.indexOf(v) < 0) v = 'dash';
    if (v === 'letter' && !S.openId) v = 'list';
    S.view = v;
    if (isSetView(v)) lastSetView = v;
    const tabOf = isSetView(v) ? 'settings' : v;
    $('tabs').querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === tabOf); });
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
    if (f) {
      const el = $('view-' + S.view);
      f(el);
      // หน้าในแท็บตั้งค่า: หัวเรื่องเดียวกัน + แถบย่อย · หน้าอื่นสร้างหัวของตัวเอง
      if (isSetView(S.view)) {
        el.insertAdjacentHTML('afterbegin', A.pageHead('ตั้งค่า') + '<div class="setnav">' + SET_NAV.map(function (x) {
          return '<button class="' + (x[0] === S.view ? 'on' : '') + '" data-set="' + x[0] + '">' + x[1] + '</button>';
        }).join('') + '</div>');
        el.querySelectorAll('[data-set]').forEach(function (b) { b.onclick = function () { A.go(b.dataset.set); }; });
      } else if (S.view === 'guide' && !el.querySelector('.pagehead')) {
        el.insertAdjacentHTML('afterbegin', A.pageHead('คู่มือ', 'วิธีใช้งานและการพิมพ์ให้ตรงตำแหน่ง'));
      }
    }
    const n = A.letters().filter(function (l) { const d = A.dueInfo(l); return d && d.d <= 0; }).length;
    const t = $('tabs').querySelector('[data-view="list"]');
    t.innerHTML = 'ทะเบียนหนังสือรับ' + (n ? '<span class="cnt">' + n + '</span>' : '');
  };

  /* ======================= รับหนังสือใหม่ ======================= */
  A.newLetterDialog = function () {
    let files = [];
    const m = A.modal({
      title: 'รับหนังสือใหม่', size: '',
      body: '<div class="drop" id="nlDrop"><b>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</b><br><span class="small">PDF 1 ไฟล์ หรือภาพหลายหน้า (JPG/PNG) · ไม่เกิน 10 MB ต่อไฟล์</span>' +
        '<input type="file" id="nlFile" accept="application/pdf,image/*" multiple style="display:none"></div>' +
        '<div id="nlList" class="small" style="margin:8px 0 14px"></div>' +
        '<div class="grid grid-3"><div class="field"><label>เลขทะเบียนรับ</label><input id="nlReg" value="' + esc(A.nextRegNo()) + '"></div>' +
        '<div class="field"><label>วันที่รับ</label><input type="date" id="nlDate" value="' + U.today() + '"></div>' +
        '<div class="field"><label>ความเร่งด่วน</label><select id="nlUrg">' + A.opts(D.URGENCY, 'ปกติ') + '</select></div>' +
        '<div class="field span-all"><label>เรื่อง (เว้นว่างได้ ระบบอ่านให้)</label><input id="nlSubj"></div></div>' +
        '<p class="hint" style="margin-top:10px">สแกนทันทีที่รับ ก่อนเขียนเกษียณ · A4 100% · 200–300 dpi</p>',
      foot: '<button class="btn btn-outline" data-close>ยกเลิก</button><button class="btn btn-primary" id="nlOk">บันทึกและเปิดหนังสือ</button>'
    });
    const drop = m.q('#nlDrop'), inp = m.q('#nlFile');
    function show() {
      m.q('#nlList').innerHTML = files.map(function (f) { return esc(f.name) + ' (' + U.fmtBytes(f.size) + ')'; }).join('<br>');
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
    const byDue = function (a, b) { return A.dueInfo(a).d - A.dueInfo(b).d; };
    const over = open.filter(function (l) { const d = A.dueInfo(l); return d && d.d < 0; }).sort(byDue);
    const soon = open.filter(function (l) { const d = A.dueInfo(l); return d && d.d >= 0 && d.d <= 3; }).sort(byDue);
    const mon = U.today().slice(0, 7);
    const thisMonth = L.filter(function (l) { return (l.receivedDate || '').slice(0, 7) === mon; });
    const urgent = over.concat(soon);
    const setup = [];
    if (A.people().some(function (p) { return !p.name; })) setup.push(['กรอกชื่อบุคลากร', 'ใช้ท้ายเกษียณ', 'people']);
    if (!A.me()) setup.push(['ผูกบัญชีกับบุคลากร', 'ให้ระบบเลือกผู้ลงนามเอง', 'people']);
    if (!EN.printerCfg().calibratedAt) setup.push(['ปรับเทียบเครื่องพิมพ์', 'ทำครั้งเดียวต่อเครื่อง', 'printer']);
    if (!AI.ready()) setup.push(['เปิดใช้ AI', 'ไม่บังคับ', 'ai']);
    const recent = L.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }).slice(0, 8);
    const urgentHtml = urgent.length ? urgent.slice(0, 6).map(function (l) {
      const d = A.dueInfo(l);
      return '<button class="todo" data-open="' + esc(l.id) + '"><span class="todo-tx"><b>' + esc(l.subject || '(ยังไม่ได้อ่านเรื่อง)') + '</b><small>' + esc(l.regNo || '') + (l.from ? ' · ' + esc(l.from) : '') + '</small></span>' +
        '<span class="badge ' + d.cls + '">' + esc(d.text) + '</span>' + A.ic('chev') + '</button>';
    }).join('') + (urgent.length > 6 ? '<button class="link-more" data-kpi="open">ดูอีก ' + (urgent.length - 6) + ' ฉบับ</button>' : '')
      : '<div class="all-clear">' + A.ic('check') + '<span>ไม่มีงานเร่งด่วน</span></div>';
    el.innerHTML = A.pageHead('ภาพรวม', esc(U.thDate(U.today(), 'long'))) +
      '<div class="kpis">' +
      kpi('รับเดือนนี้', thisMonth.length, '', 'info', 'inbox') +
      kpi('ค้างดำเนินการ', open.length, '', 'brand', 'stack', 'open') +
      kpi('ใกล้ครบกำหนด', soon.length, 'ภายใน 3 วัน', 'warn', 'clock', 'soon') +
      kpi('เกินกำหนด', over.length, '', 'bad', 'alert', 'late') + '</div>' +
      '<div class="split"><div class="card card-flush"><div class="cf-head section-title">หนังสือล่าสุด<span class="right"><button class="btn btn-sm btn-outline" data-go="list">ดูทั้งหมด</button></span></div>' +
      (recent.length ? letterTable(recent, true) : '<div class="empty">ยังไม่มีหนังสือ</div>') + '</div>' +
      '<div class="card"><div class="section-title">สิ่งที่ต้องทำ' + (urgent.length ? '<span class="count-pill">' + urgent.length + '</span>' : '') + '</div><div class="todo-list">' + urgentHtml + '</div>' +
      (setup.length ? '<div class="setup-h">ตั้งค่าให้ครบ</div><div class="setup-list">' + setup.map(function (s) {
        return '<button class="setup" data-open="' + s[2] + '"><span><b>' + esc(s[0]) + '</b> <small>' + esc(s[1]) + '</small></span>' + A.ic('chev') + '</button>';
      }).join('') + '</div>' : '') + '</div></div>';
    bindCommon(el);
  };
  function kpi(lb, n, sub, tone, icon, st) {
    const tag = st ? 'button' : 'div';
    return '<' + tag + ' class="kpi kpi-' + tone + (n ? ' has' : '') + '"' + (st ? ' data-kpi="' + st + '" title="ดูรายการ"' : '') + '>' +
      '<span class="kpi-ic">' + A.ic(icon) + '</span><span class="kpi-tx"><span class="lb">' + lb + (sub ? ' <small>' + sub + '</small>' : '') + '</span>' +
      '<span class="big num">' + n + '<small>ฉบับ</small></span></span></' + tag + '>';
  }
  function letterTable(rows, compact) {
    return '<div class="table-wrap"><table class="data' + (compact ? '' : ' wide') + '"><thead><tr><th>เลขรับ</th>' + (compact ? '' : '<th>วันที่รับ</th><th>ที่ / ลงวันที่</th><th>จาก</th>') +
      '<th>เรื่อง</th><th>กำหนด</th>' + (compact ? '' : '<th>ผู้รับผิดชอบ</th>') + '<th>สถานะ</th>' + (compact ? '' : '<th></th>') + '</tr></thead><tbody>' +
      rows.map(function (l) {
        const due = A.dueInfo(l);
        const asg = A.person(l.assigneeId);
        return '<tr class="clickable" data-open="' + esc(l.id) + '"><td class="nowrap num strong">' + esc(l.regNo || '') + '</td>' +
          (compact ? '' : '<td class="nowrap">' + esc(U.thDate(l.receivedDate, 'short')) + '</td><td class="small nowrap">' + esc(l.docNo || '') + '<br><span class="muted">' + esc(U.thDate(l.docDate, 'short')) + '</span></td><td class="small">' + esc(l.from || '') + '</td>') +
          '<td class="subj">' + A.urgBadge(l.urgency) + ' ' + (l.subject ? esc(l.subject) : '<span class="muted">(ยังไม่ได้อ่านเรื่อง)</span>') + ((l.links || []).length ? ' <span class="badge b-info b-ic" title="มี QR/ลิงก์">' + A.ic('link') + l.links.length + '</span>' : '') + '</td>' +
          '<td class="nowrap">' + (due ? '<span class="badge ' + due.cls + '">' + (l.dueKind ? esc(l.dueKind) + ' · ' : '') + esc(due.text) + '</span>' : (l.dueDate ? '<span class="muted small">' + esc(U.thDate(l.dueDate, 'short')) + '</span>' : (!compact && A.isOpen(l) ? '<span class="muted small" title="ไม่มีวันกำหนด ระบบจะไม่เตือนทาง LINE">ไม่มีกำหนด</span>' : ''))) + '</td>' +
          (compact ? '' : '<td class="small">' + esc(asg ? A.fullName(asg) || asg.position : '') + '</td>') +
          '<td class="nowrap">' + A.statusBadge(l.status) + '</td>' +
          (compact ? '' : '<td class="nowrap r">' + (A.isOpen(l) ? '<button class="btn btn-sm btn-outline" data-done="' + esc(l.id) + '">เสร็จแล้ว</button>' : '') + '</td>') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  // ปิดเรื่อง: เปลี่ยนสถานะเป็น "ดำเนินการแล้ว" (การเตือนทาง LINE จะหยุดตั้งแต่รอบถัดไป)
  async function markDone(id, btn) {
    const l = A.letter(id);
    if (!l) return;
    if (!(await A.confirm('ปิดเรื่อง "' + (l.subject || l.regNo || '') + '" เป็นดำเนินการแล้ว?\nการเตือนทาง LINE จะหยุดตั้งแต่รอบถัดไป', 'เสร็จแล้ว'))) return;
    const rec = JSON.parse(JSON.stringify(l));
    rec.status = 'done';
    (rec.history = rec.history || []).push({ at: new Date().toISOString(), by: FBL.user.name, what: 'เปลี่ยนสถานะเป็น "' + D.STATUS.done.name + '"' });
    const done = A.busy(btn);
    try { await A.saveLetter(rec, 'ปิดเรื่อง ' + (rec.regNo || '')); A.toast('ปิดเรื่องแล้ว'); } catch (e) { done(); A.toast(e.message, true); }
  }
  function bindCommon(el) {
    el.querySelectorAll('[data-done]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); markDone(b.dataset.done, b); };
      b.ondblclick = function (e) { e.stopPropagation(); };
    });
    el.querySelectorAll('[data-open]').forEach(function (b) {
      const openIt = function (e) {
        e.stopPropagation();
        const v = b.dataset.open;
        if (VIEWS.indexOf(v) >= 0) A.go(v); else A.openLetter(v);
      };
      if (b.tagName === 'TR') b.ondblclick = openIt; else b.onclick = openIt; // แถวในตาราง: ดับเบิลคลิกถึงจะเปิด
    });
    el.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { A.go(b.dataset.go); }; });
    el.querySelectorAll('[data-kpi]').forEach(function (b) { b.onclick = function () { S.ui.st = b.dataset.kpi; S.ui.q = ''; A.go('list'); }; });
  }

  /* ======================= ทะเบียนหนังสือรับ ======================= */
  A.views.list = function (el) {
    const ui = S.ui;
    const isLate = function (l) { const d = A.dueInfo(l); return d && d.d < 0; };
    const isSoon = function (l) { const d = A.dueInfo(l); return d && d.d >= 0 && d.d <= 3; };
    let rows = A.letters();
    if (ui.st === 'open') rows = rows.filter(A.isOpen);
    else if (ui.st === 'late') rows = rows.filter(isLate);
    else if (ui.st === 'soon') rows = rows.filter(isSoon);
    else if (ui.st && ui.st !== 'all') rows = rows.filter(function (l) { return l.status === ui.st; });
    if (ui.q) {
      const q = ui.q.toLowerCase();
      rows = rows.filter(function (l) { return [l.regNo, l.docNo, l.subject, l.from, l.summary].join(' ').toLowerCase().indexOf(q) >= 0; });
    }
    rows.sort(function (a, b) { return String(b.receivedDate || '').localeCompare(String(a.receivedDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    const all = A.letters();
    const segs = [['open', 'ค้างดำเนินการ', all.filter(A.isOpen).length], ['soon', 'ใกล้ครบกำหนด', all.filter(isSoon).length], ['late', 'เกินกำหนด', all.filter(isLate).length, 'hot'], ['all', 'ทั้งหมด', all.length]];
    const stKeys = Object.keys(D.STATUS);
    el.innerHTML = A.pageHead('ทะเบียนหนังสือรับ', rows.length + ' ฉบับ', '<button class="btn btn-sm btn-outline" id="lsCsv">ส่งออก CSV</button>') +
      '<div class="card card-flush"><div class="filterbar"><div class="seg">' + segs.map(function (c) {
        return '<button class="' + (ui.st === c[0] ? 'on' : '') + '" data-chip="' + c[0] + '">' + c[1] + ' <b class="num' + (c[3] && c[2] ? ' hot' : '') + '">' + c[2] + '</b></button>';
      }).join('') + '</div>' +
      '<select class="inp" id="lsSt"><option value="">ตามสถานะ…</option>' + stKeys.map(function (k) { return '<option value="' + k + '"' + (ui.st === k ? ' selected' : '') + '>' + D.STATUS[k].name + '</option>'; }).join('') + '</select>' +
      '<input class="inp search" id="lsQ" placeholder="ค้นหาเลขรับ ที่ เรื่อง ผู้ส่ง" value="' + esc(ui.q) + '"></div>' +
      (rows.length ? letterTable(rows, false) + '<div class="cf-foot">ดับเบิลคลิกแถวเพื่อเปิดหนังสือ</div>' : '<div class="empty">ไม่พบหนังสือ</div>') + '</div>';
    bindCommon(el);
    const q = el.querySelector('#lsQ');
    q.oninput = function () { ui.q = q.value; clearTimeout(q._t); q._t = setTimeout(function () { A.render(); const n = $('lsQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    el.querySelector('#lsSt').onchange = function () { ui.st = this.value || 'open'; A.render(); };
    el.querySelectorAll('[data-chip]').forEach(function (c) { c.onclick = function () { ui.st = c.dataset.chip; A.render(); }; });
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

  /* ======================= แนวทางเกษียณ (รายการซ้าย · ตัวอย่าง/แก้ไขขวา) ======================= */
  let tpSel = null, tpQ = '', tpMode = 'view', tpNewGroup = 'propose';
  const TP_PH = ['เรียน', 'ผู้รับมอบ', 'เรื่อง', 'สรุป', 'กำหนดส่ง', 'จาก', 'เลขที่', 'ลงวันที่', 'เลขที่ตอบ'];
  const TP_SAMPLE = { 'เรียน': 'ผอ.ขท.ระยอง', 'ผู้รับมอบ': 'นายช่างโยธา', 'เรื่อง': 'ขอความอนุเคราะห์ข้อมูลโครงการ', 'สรุป': 'ส่งข้อมูลปริมาณจราจรประจำปี', 'กำหนดส่ง': '15 พ.ย. 2569', 'จาก': 'สำนักงานทางหลวงที่ 18', 'เลขที่': 'ที่ คค 0615/1234', 'ลงวันที่': '3 พ.ย. 2569', 'เลขที่ตอบ': 'ที่ คค 0615/1301' };
  // แสดงข้อความหลายบรรทัด: บรรทัดที่ขึ้นต้นด้วยช่องว่างจะย่อหน้า; filled=true แทนตัวแทนด้วยค่าตัวอย่าง
  function tpFmt(text, filled) {
    return String(text).split('\n').map(function (l) {
      const ind = /^\s+/.test(l);
      const h = esc(l.trim()).replace(/\{([^}]+)\}/g, function (m, k) {
        return filled ? '<b class="tp-fv">' + (TP_SAMPLE[k] ? esc(TP_SAMPLE[k]) : m) + '</b>' : '<span class="tp-ph">' + m + '</span>';
      });
      return '<div class="tp-ln' + (ind ? ' ind' : '') + '">' + (h || '&nbsp;') + '</div>';
    }).join('');
  }
  A.views.tpl = function (el) {
    const T = A.templates();
    const can = A.can();
    if (!T.some(function (t) { return t.id === tpSel; })) { tpSel = T.length ? T[0].id : null; if (tpMode !== 'new') tpMode = 'view'; }
    el.innerHTML = A.pageHead('แนวทางเกษียณ', 'ข้อความใน { } ระบบเติมให้เอง · ชื่อ ตำแหน่ง และวันที่ของผู้ลงนามใส่ท้ายข้อความอัตโนมัติ',
        can ? '<button class="btn btn-sm btn-outline" id="tpReset">คืนค่าเริ่มต้น</button><button class="btn btn-sm btn-primary" id="tpAdd">+ เพิ่มแนวทาง</button>' : '') +
      '<div class="pp-split"><div class="pp-list"><div class="pp-search"><input id="tpQ" placeholder="ค้นหาแนวทาง" value="' + esc(tpQ) + '"></div><div id="tpList" class="pp-scroll"></div></div><div class="pp-ed" id="tpDet"></div></div>';

    function paintList() {
      const q = tpQ.trim();
      let h = '';
      Object.keys(D.GROUPS).forEach(function (g) {
        const list = T.filter(function (t) { return t.group === g && (!q || (t.title + ' ' + t.text).indexOf(q) >= 0); });
        if (!list.length) return;
        h += '<div class="pp-gh">' + esc(D.GROUPS[g]) + ' · ' + list.length + '</div>' + list.map(function (t) {
          return '<div class="pp-it tp-it' + (t.id === tpSel && tpMode !== 'new' ? ' sel' : '') + '" data-id="' + t.id + '"><div class="pp-tx"><b>' + esc(t.title) + '</b></div></div>';
        }).join('');
      });
      el.querySelector('#tpList').innerHTML = h || '<div class="muted small" style="padding:16px;text-align:center">ไม่พบแนวทางที่ค้นหา</div>';
      el.querySelectorAll('.tp-it').forEach(function (r) {
        r.onclick = function () { tpSel = r.dataset.id; tpMode = 'view'; paintList(); paintDet(); };
      });
    }

    async function save(rec) {
      const st = A.settings();
      st.templates = (st.templates || []).filter(function (x) { return x.id !== rec.id; }).concat([rec]);
      try { await A.saveSettings(st, 'บันทึกแนวทางเกษียณ ' + rec.title); tpSel = rec.id; tpMode = 'view'; A.render(); } catch (e) { A.toast(e.message, true); }
    }

    function paintEditor(t) {
      const d = el.querySelector('#tpDet');
      d.innerHTML = '<div class="pp-eh"><h3>' + (t ? 'แก้ไข: ' + esc(t.title) : 'เพิ่มแนวทางเกษียณ') + '</h3></div>' +
        '<div class="grid grid-2" style="margin-top:12px"><div class="field"><label>ใช้เมื่อ</label><select id="tgG">' + A.opts(Object.keys(D.GROUPS).map(function (k) { return { key: k, name: D.GROUPS[k] }; }), t ? t.group : tpNewGroup) + '</select></div>' +
        '<div class="field"><label>ชื่อแนวทาง</label><input id="tgT" value="' + esc(t ? t.title : '') + '"></div></div>' +
        '<div class="field" style="margin-top:10px"><label>ข้อความ <span class="hint">(เว้นวรรค 5 ช่อง = ย่อหน้า · กดปุ่มเหลืองเพื่อแทรก)</span></label>' +
        '<div class="tp-bar">' + TP_PH.map(function (k) { return '<button type="button" class="tp-phb" data-k="' + k + '">{' + k + '}</button>'; }).join('') + '</div>' +
        '<textarea id="tgX" rows="6">' + esc(t ? t.text : 'เรียน {เรียน}\n     ') + '</textarea></div>' +
        '<div class="pp-sec">ตัวอย่างที่ได้</div><div class="tp-memo" id="tgP"></div>' +
        '<div class="flex" style="justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn btn-outline" id="tgNo">ยกเลิก</button><button class="btn btn-primary" id="tgOk">บันทึก</button></div>';
      const x = d.querySelector('#tgX');
      function prev() { d.querySelector('#tgP').innerHTML = tpFmt(x.value, true); }
      x.oninput = prev; prev();
      x.setSelectionRange(x.value.length, x.value.length);
      d.querySelectorAll('.tp-phb').forEach(function (b) {
        b.onclick = function () { x.setRangeText('{' + b.dataset.k + '}', x.selectionStart, x.selectionEnd, 'end'); x.focus(); prev(); };
      });
      d.querySelector('#tgNo').onclick = function () { tpMode = 'view'; paintList(); paintDet(); };
      d.querySelector('#tgOk').onclick = function () {
        const rec = { id: t ? t.id : 't' + Date.now().toString(36), group: d.querySelector('#tgG').value, title: d.querySelector('#tgT').value.trim(), text: x.value.replace(/\s+$/, '') };
        if (!rec.title || !rec.text) return A.toast('กรอกชื่อและข้อความ', true);
        save(rec);
      };
    }

    function paintDet() {
      const d = el.querySelector('#tpDet');
      if (tpMode === 'new') return paintEditor(null);
      const t = T.find(function (x) { return x.id === tpSel; });
      if (!t) { d.innerHTML = '<div class="muted" style="padding:30px;text-align:center">ยังไม่มีแนวทาง — กด “+ เพิ่มแนวทาง”</div>'; return; }
      if (tpMode === 'edit' && can) return paintEditor(t);
      d.innerHTML = '<div class="pp-eh"><h3>' + esc(t.title) + '</h3>' +
        (can ? '<span class="flex"><button class="btn btn-sm btn-outline" id="tpEd">แก้ไข</button><button class="btn btn-sm btn-danger" id="tpDel">ลบ</button></span>' : '') + '</div>' +
        '<div class="muted small" style="margin-top:2px">' + esc(D.GROUPS[t.group] || '') + '</div>' +
        '<div class="pp-sec">ข้อความแนวทาง</div><div class="tp-raw">' + tpFmt(t.text, false) + '</div>' +
        '<div class="pp-sec">ตัวอย่างเมื่อใช้งานจริง</div><div class="tp-memo">' + tpFmt(t.text, true) + '</div>';
      if (!can) return;
      d.querySelector('#tpEd').onclick = function () { tpMode = 'edit'; paintDet(); };
      d.querySelector('#tpDel').onclick = async function () {
        if (!(await A.confirm('ลบแนวทางนี้?', 'ลบ', true))) return;
        const st = A.settings(); st.templates = st.templates.filter(function (x) { return x.id !== t.id; });
        try { await A.saveSettings(st, 'ลบแนวทางเกษียณ'); tpSel = null; A.render(); } catch (e) { A.toast(e.message, true); }
      };
    }

    el.querySelector('#tpQ').oninput = function () { tpQ = this.value; paintList(); };
    paintList(); paintDet();
    if (!can) return;
    el.querySelector('#tpAdd').onclick = function () { tpMode = 'new'; paintList(); paintDet(); };
    el.querySelector('#tpReset').onclick = async function () {
      if (!(await A.confirm('คืนแนวทางเกษียณเป็นค่าเริ่มต้น? (แนวทางที่เพิ่ม/แก้ไขเองจะหายไป)', 'คืนค่า', true))) return;
      const st = A.settings(); st.templates = JSON.parse(JSON.stringify(D.TEMPLATES));
      try { await A.saveSettings(st, 'คืนค่าแนวทางเกษียณ'); tpMode = 'view'; tpSel = null; A.render(); } catch (e) { A.toast(e.message, true); }
    };
  };

  /* ======================= บุคลากร/ตำแหน่ง (รายชื่อซ้าย · ฟอร์มขวา) ======================= */
  let ppDraft = null, ppBase = '', ppSel = null, ppQ = '';
  A.views.people = function (el) {
    const can = A.can();
    const dis = can ? '' : ' disabled';
    const current = JSON.stringify(A.people(true));
    // เริ่มร่างใหม่ ถ้ายังไม่มี หรือข้อมูลจริงเปลี่ยนไป (เช่นมีคนอื่นแก้) และผู้ใช้ยังไม่ได้แก้อะไร
    if (!ppDraft || (ppBase !== current && JSON.stringify(ppDraft) === ppBase)) {
      ppDraft = JSON.parse(current); ppBase = current;
    }
    const P = ppDraft;
    if (!P.some(function (p) { return p.id === ppSel; })) ppSel = P.length ? P[0].id : null;
    const roleKeys = Object.keys(D.ROLES);
    const roleOpts = roleKeys.map(function (k) { return { key: k, name: D.ROLES[k].name }; });
    const lbl = function (p) { return p ? (p.abbr || p.position || '—') : '—'; };
    const nm = function (p) { return ((p.prefix || '') + (p.name || '')).trim() || '(ยังไม่ระบุชื่อ)'; };
    const dirty = function () { return JSON.stringify(P) !== ppBase; };

    el.innerHTML = '<div class="sec-head"><p class="hint">ใช้เติมชื่อ-ตำแหน่งท้ายเกษียณ และคำว่า "เรียน ..." ตามสายบังคับบัญชา</p><div class="flex">' +
      (can ? '<span class="dirty-note" id="ppDirty"></span><button class="btn btn-sm btn-outline" id="ppAdd">+ เพิ่มบุคลากร</button><button class="btn btn-sm btn-primary" id="ppSave">บันทึกรายชื่อ</button>' : '<span class="hint">แก้ไขได้เฉพาะเจ้าของระบบหรือผู้ดูแลระบบ</span>') + '</div></div>' +
      '<div class="pp-split"><div class="pp-list"><div class="pp-search"><input id="ppQ" placeholder="ค้นหาชื่อ / ตำแหน่ง" value="' + esc(ppQ) + '"></div><div id="ppLs" class="pp-scroll"></div></div>' +
      '<div class="pp-ed" id="ppEd"></div></div>' +
      '<details class="fold"><summary>บทบาทหน้าที่ในการเกษียณ</summary><div class="table-wrap"><table class="data"><thead><tr><th>บทบาท</th><th>หน้าที่</th><th>แนวทางที่ใช้</th></tr></thead><tbody>' +
      roleKeys.map(function (k) { const r = D.ROLES[k]; return '<tr><td class="nowrap"><b>' + esc(r.name) + '</b></td><td>' + esc(r.does) + '</td><td>' + esc(D.GROUPS[r.group]) + '</td></tr>'; }).join('') +
      '</tbody></table></div></details>';

    const ls = el.querySelector('#ppLs'), ed = el.querySelector('#ppEd');
    function paintDirty() { const d = el.querySelector('#ppDirty'); if (d) d.textContent = dirty() ? 'ยังไม่บันทึก' : ''; }
    function paintList() {
      const q = ppQ.trim();
      const m = P.filter(function (p) { return !q || (nm(p) + (p.position || '') + (p.abbr || '')).indexOf(q) >= 0; });
      ls.innerHTML = roleKeys.map(function (k) {
        const a = m.filter(function (p) { return p.role === k; });
        if (!a.length) return '';
        return '<div class="pp-gh">' + esc(D.ROLES[k].name) + '</div>' + a.map(function (p) {
          return '<div class="pp-it' + (p.id === ppSel ? ' sel' : '') + (p.active === false ? ' off' : '') + '" data-id="' + esc(p.id) + '"><div class="pp-dot pp-d-' + esc(k) + '">' + esc((p.name || p.position || '?').charAt(0)) + '</div>' +
            '<div class="pp-tx"><b>' + esc(nm(p)) + '</b><small>' + esc(p.position || '—') + '</small></div></div>';
        }).join('');
      }).join('') || '<div class="pp-gh">ไม่พบรายการ</div>';
    }
    function previewHtml(p) {
      const up = P.find(function (x) { return x.id === p.reportsTo; });
      return '<small>ข้อความขึ้นต้น</small>เรียน ' + esc(lbl(up)) + '<div class="pp-sig"><small>ท้ายเกษียณ</small>(' + esc(nm(p)) + ')<br>' + esc(p.position || '—') + '</div>';
    }
    function paintEd() {
      const p = P.find(function (x) { return x.id === ppSel; });
      if (!p) { ed.innerHTML = '<p class="hint">ยังไม่มีบุคลากร' + (can ? ' — กด "+ เพิ่มบุคลากร"' : '') + '</p>'; return; }
      ed.innerHTML = '<div class="pp-eh"><h3 id="ppTitle">' + esc(nm(p)) + '</h3><label class="pp-sa"><input type="checkbox" data-f="active"' + (p.active !== false ? ' checked' : '') + dis + '> ใช้งาน</label></div>' +
        '<div class="pp-sec">ข้อมูลบุคคล</div><div class="grid grid-2">' +
        '<div class="field"><label>คำนำหน้า</label><input data-f="prefix" value="' + esc(p.prefix) + '" placeholder="นาย / นาง / นางสาว"' + dis + '></div>' +
        '<div class="field"><label>ชื่อ-สกุล</label><input data-f="name" value="' + esc(p.name) + '" placeholder="ชื่อ นามสกุล"' + dis + '></div>' +
        '<div class="field"><label>ตำแหน่ง (เต็ม)</label><input data-f="position" value="' + esc(p.position) + '"' + dis + '></div>' +
        '<div class="field"><label>ชื่อย่อตำแหน่ง</label><input data-f="abbr" value="' + esc(p.abbr) + '" placeholder="เช่น ชม.ขท.เชิงเนิน"' + dis + '></div></div>' +
        '<div class="pp-sec">บทบาท และสายบังคับบัญชา</div><div class="grid grid-2">' +
        '<div class="field"><label>บทบาท</label><select data-f="role"' + dis + '>' + A.opts(roleOpts, p.role) + '</select></div>' +
        '<div class="field"><label>เสนอถึง (ผู้บังคับบัญชา)</label><select data-f="reportsTo"' + dis + '>' + A.opts(P.filter(function (x) { return x.id !== p.id; }).map(function (x) { return { key: x.id, name: lbl(x) }; }), p.reportsTo, '— ไม่มี —') + '</select></div>' +
        '<div class="field span-all"><label>ผู้ใช้ระบบ (ผูกบัญชีล็อกอิน ให้ระบบเลือกผู้ลงนามเอง)</label><select data-f="loginName"' + dis + '>' + A.opts(S.team.map(function (t) { return t.name; }), p.loginName, '— ไม่ผูก —') + '</select></div></div>' +
        '<div class="pp-sec">ตัวอย่างที่จะปรากฏในเกษียณ</div><div class="pp-prev" id="ppPrev">' + previewHtml(p) + '</div>' +
        (can ? '<div class="flex" style="margin-top:14px"><button class="btn btn-sm btn-danger" id="ppDel" style="margin-left:auto">ลบคนนี้</button></div>' : '');
    }
    paintList(); paintEd(); paintDirty();

    el.querySelector('#ppQ').oninput = function () { ppQ = this.value; paintList(); };
    ls.onclick = function (e) {
      const it = e.target.closest('.pp-it'); if (!it) return;
      ppSel = it.dataset.id; paintList(); paintEd();
    };
    // พิมพ์แล้วอัปเดตร่างทันที (ไม่วาดฟอร์มใหม่ จึงไม่เสียตำแหน่งเคอร์เซอร์)
    ed.addEventListener('input', function (e) {
      const f = e.target.dataset.f, p = P.find(function (x) { return x.id === ppSel; });
      if (!f || !p || !can || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
      p[f] = e.target.value;
      el.querySelector('#ppTitle').textContent = nm(p);
      el.querySelector('#ppPrev').innerHTML = previewHtml(p);
      paintList(); paintDirty();
    });
    ed.addEventListener('change', function (e) {
      const f = e.target.dataset.f, p = P.find(function (x) { return x.id === ppSel; });
      if (!f || !p || !can) return;
      p[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      paintList(); paintEd(); paintDirty();
    });
    if (!can) return;
    el.querySelector('#ppAdd').onclick = function () {
      const id = 'p-' + Date.now().toString(36);
      P.push({ id: id, role: 'staff', prefix: '', name: '', position: '', abbr: '', reportsTo: 'p-head', active: true });
      ppSel = id; ppQ = ''; el.querySelector('#ppQ').value = '';
      paintList(); paintEd(); paintDirty();
      const n = ed.querySelector('[data-f=name]'); if (n) n.focus();
    };
    ed.addEventListener('click', async function (e) {
      if (e.target.id !== 'ppDel') return;
      if (!(await A.confirm('ลบบุคลากรนี้ออกจากรายชื่อ?', 'ลบ', true))) return;
      const id = ppSel;
      const i = P.findIndex(function (x) { return x.id === id; });
      P.splice(i, 1);
      P.forEach(function (x) { if (x.reportsTo === id) x.reportsTo = ''; });
      ppSel = P.length ? P[Math.min(i, P.length - 1)].id : null;
      paintList(); paintEd(); paintDirty();
    });
    el.querySelector('#ppSave').onclick = async function () {
      P.forEach(function (p) { ['prefix', 'name', 'position', 'abbr'].forEach(function (k) { p[k] = (p[k] || '').trim(); }); });
      const st = A.settings(); st.people = JSON.parse(JSON.stringify(P));
      const done = A.busy(this);
      try { await A.saveSettings(st, 'บันทึกรายชื่อบุคลากร'); A.toast('บันทึกแล้ว'); updateWho(); ppDraft = null; A.render(); } catch (e) { A.toast(e.message, true); }
      done();
    };
  };

  /* ======================= เครื่องพิมพ์ (ปรับเทียบ) ======================= */
  A.views.printer = function (el) {
    const p = EN.printerCfg();
    const fonts = D.FONTS.map(function (f) { return '<li><span>' + esc(f.key) + '</span>' + (EN.fontInstalled(f.key) ? '<span class="badge b-ok">มี</span>' : '<span class="badge b-mute">ไม่มี</span>') + '</li>'; }).join('');
    el.innerHTML = '<div class="split"><div class="card"><div class="section-title">ปรับเทียบเครื่องพิมพ์ <span class="sub">ทำครั้งเดียวต่อเครื่อง · เก็บในคอมพิวเตอร์นี้</span></div>' +
      '<div class="steps">' +
      '<div class="st"><div><b>พิมพ์หน้าปรับเทียบบน A4 เปล่า</b><p class="hint st-h">ระยะขอบ "ไม่มี" · มาตราส่วน 100% · ปิดส่วนหัว/ท้าย</p>' +
      '<button class="btn btn-sm btn-outline" id="prCal">พิมพ์หน้าปรับเทียบ</button></div></div>' +
      '<div class="st"><div><b>วัดจุดกากบาท A และ B (มม.)</b><p class="hint st-h">วัดจากขอบซ้ายและขอบบนของกระดาษ</p>' +
      '<div class="grid grid-4"><div class="field"><label>A ห่างซ้าย</label><input type="number" step="0.5" id="prAx" value="20"></div><div class="field"><label>A ห่างบน</label><input type="number" step="0.5" id="prAy" value="20"></div>' +
      '<div class="field"><label>B ห่างซ้าย</label><input type="number" step="0.5" id="prBx" value="190"></div><div class="field"><label>B ห่างบน</label><input type="number" step="0.5" id="prBy" value="277"></div></div></div></div>' +
      '<div class="st"><div><b>จดวิธีใส่กระดาษ</b><p class="hint st-h">ดูจากเครื่องหมาย ✗ ดินสอบนแผ่นที่พิมพ์</p>' +
      '<div class="grid grid-2"><div class="field"><label>ชื่อเครื่องพิมพ์</label><input id="prName" value="' + esc(p.name) + '" placeholder="เช่น Brother ห้องหมวด"></div>' +
      '<div class="field"><label>วิธีใส่ต้นฉบับ</label><input id="prFeed" value="' + esc(p.feedNote) + '" placeholder="เช่น ถาดมือ หน้าหงาย หัวเข้าก่อน"></div></div></div></div></div>' +
      '<div class="flex card-act"><button class="btn btn-primary" id="prSave">คำนวณและบันทึก</button><button class="btn btn-outline" id="prReset">ล้างค่า</button></div></div>' +
      '<div class="card"><div class="section-title">ค่าปัจจุบัน' + (p.calibratedAt ? '' : '<span class="right"><span class="badge b-warn">ยังไม่ปรับเทียบ</span></span>') + '</div><dl class="kv">' +
      '<dt>เครื่องพิมพ์</dt><dd>' + esc(p.name || '—') + '</dd>' +
      '<dt>เลื่อน (นอน × ตั้ง)</dt><dd class="num">' + (+p.dx || 0).toFixed(1) + ' × ' + (+p.dy || 0).toFixed(1) + ' มม.</dd>' +
      '<dt>สเกล (กว้าง × สูง)</dt><dd class="num">' + (+p.sx || 1).toFixed(4) + ' × ' + (+p.sy || 1).toFixed(4) + '</dd>' +
      '<dt>วิธีใส่ต้นฉบับ</dt><dd>' + esc(p.feedNote || '—') + '</dd>' +
      '<dt>ปรับเทียบเมื่อ</dt><dd>' + (p.calibratedAt ? esc(U.thDate(p.calibratedAt.slice(0, 10))) : '—') + '</dd></dl>' +
      '<div class="pp-sec">แบบอักษรราชการในเครื่องนี้</div><ul class="fontlist">' + fonts + '</ul>' +
      '<p class="hint">ไม่มี TH SarabunIT๙ ให้ติดตั้งแล้วเปิดหน้าเว็บใหม่ ระหว่างนี้ระบบใช้ Sarabun แทน</p></div></div>';
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
    el.innerHTML = '<div class="alert warn ai-warn"><span class="ic">' + A.ic('alert') + '</span><span><b>ห้ามใช้กับหนังสือชั้นความลับหรือข้อมูลส่วนบุคคลอ่อนไหว</b> ไฟล์จะถูกส่งไปประมวลผลที่ Anthropic และ AI อาจผิดพลาดได้ ต้องตรวจทุกครั้ง</span></div>' +
      '<div class="ai-grid"><div class="card"><div class="section-title">ตั้งค่า AI (Claude) <span class="sub">เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</span></div>' +
      '<div class="field"><label>Anthropic API key</label>' + A.pwField('aiKey', 'sk-ant-...', 'off') + '<span class="hint">สร้างที่ console.anthropic.com · ไม่ใส่ก็ใช้ระบบได้ แค่ไม่มีฟังก์ชัน AI</span></div>' +
      '<div class="field field-gap"><label>โมเดล</label><select id="aiModel">' + A.opts([{ key: 'claude-opus-5', name: 'Claude Opus 5 (แม่นยำที่สุด · แนะนำ)' }, { key: 'claude-sonnet-5', name: 'Claude Sonnet 5 (ประหยัดกว่า)' }, { key: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (ถูกและเร็วที่สุด)' }], c.model) + '</select></div>' +
      '<div class="field field-gap"><label><input type="checkbox" id="aiAuto"' + (c.auto ? ' checked' : '') + '> วิเคราะห์ทันทีที่รับหนังสือใหม่ (ยกเว้นหนังสือลับ)</label></div>' +
      '<div class="flex card-act"><button class="btn btn-primary" id="aiSave">บันทึก</button><button class="btn btn-outline" id="aiTest">ทดสอบ</button><button class="btn btn-ghost" id="aiClear">ลบ key</button></div></div>' +
      '<div class="card"><div class="section-title">ขั้นตอนการทำงาน</div>' +
      '<div class="ai-legend"><span><i style="background:#c3cad3"></i>ระบบ</span><span><i style="background:var(--acc)"></i>AI</span><span><i style="background:var(--gold)"></i>คุณตัดสินใจ</span></div>' +
      '<ol class="ai-tl">' +
      '<li><span class="n">1</span><b>รับและอ่าน</b><span>ลงทะเบียน ดึงข้อความ OCR และ QR ในเครื่อง</span></li>' +
      '<li class="ai"><span class="n">2</span><b>วิเคราะห์</b><span>สรุปเรื่อง สิ่งที่ต้องทำ กำหนดส่ง ความเร่งด่วน</span></li>' +
      '<li class="ai"><span class="n">3</span><b>เสนอ</b><span>ผู้รับผิดชอบ และร่างเกษียณ 3 แบบ</span></li>' +
      '<li><span class="n">4</span><b>จัดวาง</b><span>หาที่ว่างบนต้นฉบับ ตรวจไม่ทับข้อความ</span></li>' +
      '<li class="me"><span class="n">5</span><b>ตรวจและพิมพ์</b><span>แก้ข้อความ พิมพ์ แล้วเซ็นชื่อ</span></li>' +
      '<li><span class="n">6</span><b>ติดตาม</b><span>เตือนกำหนดส่ง ปรับเครื่องพิมพ์จากผลตรวจ</span></li>' +
      '<li class="ai"><span class="n">7</span><b>ร่างหนังสือตอบ</b><span>ร่างตอบต้นเรื่องเมื่อกดสั่ง</span></li></ol></div></div>';
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
  let guideTab = 'ga';
  A.views.guide = function (el) {
    const G = [['ga', 'งานประจำวัน'], ['gb', 'พิมพ์ลงต้นฉบับ'], ['gc', 'ปัญหาที่พบบ่อย'], ['gd', 'หลักการเกษียณ']];
    const pane = function (id, html) { return '<div class="gpane' + (guideTab === id ? ' on' : '') + '" id="' + id + '">' + html + '</div>'; };
    el.innerHTML = '<div class="card guide"><div class="gtabs">' + G.map(function (g) { return '<button class="gtab' + (guideTab === g[0] ? ' on' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div>' +
      pane('ga', '<div class="table-wrap"><table class="data"><thead><tr><th>เมื่อ</th><th>ทำอะไร</th></tr></thead><tbody>' +
        '<tr><td class="nowrap"><b>ได้รับหนังสือ</b></td><td>สแกน แล้วกด "+ รับหนังสือใหม่" ตรวจสรุปและกำหนดส่ง แล้วบันทึก</td></tr>' +
        '<tr><td class="nowrap"><b>ธุรการเสนอ</b></td><td>เกษียณ &amp; พิมพ์ · ผู้ลงนามธุรการ · แนวทาง "เสนอ" · พิมพ์ · เสนอแฟ้ม</td></tr>' +
        '<tr><td class="nowrap"><b>หัวหน้าสั่งการ</b></td><td>ผู้ลงนามหัวหน้าหมวด · แนวทาง "สั่งการ" · เลือกผู้รับมอบ · พิมพ์ต่อใต้เกษียณเดิม</td></tr>' +
        '<tr><td class="nowrap"><b>มี QR/ลิงก์</b></td><td>แท็บ QR &amp; ลิงก์ · ตรวจโดเมน · เปิดหรือคัดลอก</td></tr>' +
        '<tr><td class="nowrap"><b>ส่งหนังสือ</b></td><td>ทะเบียนหนังสือส่ง · ร่างบันทึกข้อความ · พิมพ์ให้ลงนาม · กรอกเลขที่หลังลงนาม</td></tr>' +
        '<tr><td class="nowrap"><b>ดำเนินการเสร็จ</b></td><td>พิมพ์เกษียณรายงานผล · กด "เสร็จแล้ว" · เก็บเข้าแฟ้ม</td></tr></tbody></table></div>') +
      pane('gb', '<div class="steps">' +
        '<div class="st"><div><b>พิมพ์ทดสอบบนกระดาษเปล่า</b><p class="hint st-h">ได้ภาพต้นฉบับจาง ๆ ข้อความเกษียณ และกากบาทมุม</p></div></div>' +
        '<div class="st"><div><b>วางซ้อนต้นฉบับแล้วส่องกับแสง</b><p class="hint st-h">ดูว่าไม่ทับของเดิม และขอบกระดาษตรงกากบาท</p></div></div>' +
        '<div class="st"><div><b>ใส่ต้นฉบับตามวิธีที่บันทึกไว้</b><p class="hint st-h">ครั้งละ 1 แผ่น เฉพาะหน้าที่จะพิมพ์</p></div></div>' +
        '<div class="st"><div><b>พิมพ์จริง แล้วเซ็นชื่อ</b><p class="hint st-h">พิมพ์เฉพาะข้อความ ไม่มีภาพพื้นหลัง</p></div></div>' +
        '<div class="st"><div><b>ตรวจหลังพิมพ์</b><p class="hint st-h">สแกนแผ่นที่พิมพ์แล้วอัปโหลด ระบบบอกว่าคลาดกี่มม. และปรับค่าให้ครั้งถัดไป</p></div></div></div>') +
      pane('gc', '<div class="table-wrap"><table class="data"><thead><tr><th>ปัญหา</th><th>วิธีแก้</th></tr></thead><tbody>' +
        '<tr><td><b>ไม่รู้ว่าที่ว่างอยู่ตรงไหน</b></td><td>กด "หาที่ว่างอัตโนมัติ" หรือลากกรอบบนภาพ</td></tr>' +
        '<tr><td><b>พิมพ์ทับของเดิม</b></td><td>กรอบเป็นสีแดงเมื่อทับ ให้ย้ายตำแหน่ง ระบบจำตำแหน่งเกษียณที่พิมพ์แล้ว</td></tr>' +
        '<tr><td><b>กระดาษเยื้อง ย่อ หรือขยาย</b></td><td>ปรับเทียบที่ ตั้งค่า › เครื่องพิมพ์ · พิมพ์ 100% ขอบ 0 เสมอ · ใช้ถาดป้อนมือ</td></tr>' +
        '<tr><td><b>ใส่กระดาษผิดด้าน</b></td><td>จดวิธีใส่ไว้ตอนปรับเทียบ ระบบเตือนก่อนพิมพ์จริง</td></tr>' +
        '<tr><td><b>ที่ว่างไม่พอ</b></td><td>ใช้ "พิมพ์แผ่นเกษียณต่อ" แนบท้ายต้นฉบับ</td></tr>' +
        '<tr><td><b>พิมพ์ไม่ถึงขอบ</b></td><td>เครื่องส่วนใหญ่พิมพ์ไม่ได้ในระยะ 5 มม. จากขอบ ระบบจะเตือน</td></tr>' +
        '<tr><td><b>กระดาษยับหรือพับ</b></td><td>รีดให้เรียบก่อนใส่เครื่อง</td></tr></tbody></table></div>') +
      pane('gd', '<div class="table-wrap"><table class="data"><thead><tr><th>ชนิด</th><th>หลักการเขียน</th></tr></thead><tbody>' +
        '<tr><td class="nowrap"><b>เกษียณเสนอ</b></td><td>ขึ้นต้น "เรียน" + ตำแหน่งผู้บังคับบัญชา สรุปเรื่องสั้น ๆ และสิ่งที่ขอให้พิจารณา</td></tr>' +
        '<tr><td class="nowrap"><b>เกษียณสั่งการ</b></td><td>สั้น ชัด ระบุผู้รับมอบและกำหนดเวลา</td></tr>' +
        '<tr><td class="nowrap"><b>เกษียณรายงานผล</b></td><td>บอกว่าทำอย่างไร เมื่อไร อ้างเลขหนังสือตอบถ้ามี</td></tr>' +
        '<tr><td class="nowrap"><b>ทุกเกษียณ</b></td><td>มีลายมือชื่อ (ชื่อเต็ม) ตำแหน่ง และวันที่ · ไม่ทับข้อความเดิม</td></tr></tbody></table></div>') + '</div>';
    el.querySelectorAll('.gtab').forEach(function (b) {
      b.onclick = function () {
        guideTab = b.dataset.g;
        el.querySelectorAll('.gtab,.gpane').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        el.querySelector('#' + b.dataset.g).classList.add('on');
      };
    });
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
    box.innerHTML = '<div class="alert warn dir-note"><span>' + esc(why) +
      '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="dirMigrate">' + (st.ready ? 'ซิงก์สมุดชื่อล็อกอิน' : 'ย้ายรายชื่อไปสมุดชื่อล็อกอิน') + '</button></div></span></div>';
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
    const trash = S.letters.filter(function (l) { return l.deletedAt; }).map(function (l) { return Object.assign({ _col: 'letters', _no: l.regNo }, l); })
      .concat(S.out.filter(function (l) { return l.deletedAt; }).map(function (l) { return Object.assign({ _col: 'out', _no: 'หนังสือส่ง ' + (l.docSuffix || 'ร่าง') }, l); }));
    el.innerHTML = '<div class="split"><div>' +
      '<div class="card card-flush"><div class="cf-head section-title">ผู้ใช้งานระบบ' + (own ? '<span class="right"><button class="btn btn-sm btn-primary" id="stAdd">+ เพิ่มผู้ใช้</button></span>' : '') + '</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>ชื่อ</th><th>สิทธิ์</th>' + (own ? '<th></th>' : '') + '</tr></thead><tbody>' +
      S.team.map(function (m) {
        return '<tr><td class="strong">' + esc(m.name) + '</td><td class="nowrap">' + (m.isOwner ? 'เจ้าของระบบ' : (m.isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน')) + '</td>' +
          (own ? '<td class="nowrap r">' + (m.isOwner ? '' : '<button class="btn btn-sm btn-outline" data-adm="' + esc(m.name) + '">' + (m.isAdmin ? 'ถอดผู้ดูแล' : 'ตั้งเป็นผู้ดูแล') + '</button> ' +
            '<button class="btn btn-sm btn-outline" data-rpw="' + esc(m.name) + '">ตั้งรหัสใหม่</button> <button class="btn btn-sm btn-danger" data-rm="' + esc(m.name) + '">ลบ</button>') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (own ? '<div id="dirNotice"></div>' : '') +
      '<div class="cf-foot"><button class="btn btn-outline btn-sm" id="stMyPw">เปลี่ยนรหัสผ่านของฉัน</button></div></div></div>' +
      '<div><div class="card"><div class="section-title">สำรองข้อมูล</div><button class="btn btn-outline" id="stExp">ส่งออกข้อมูลทั้งหมด (.json)</button>' +
      '<p class="hint">ไม่รวมไฟล์สแกน · ไฟล์สแกนเก็บที่ <b>' + ({ drive: 'Google Drive', firestore: 'Firestore (ฟรี 1 GB ใช้ร่วมกับระบบอื่น)', browser: 'เบราว์เซอร์เครื่องนี้ (โหมดทดลอง)' }[FBL.fileStore] || '-') + '</b></p>' +
      (can && FBL.fileStore === 'drive' ? '<div class="pp-sec">ย้ายไฟล์สแกนเดิมจาก Firestore ไป Google Drive</div>' +
        '<p class="hint">ลบออกจาก Firestore เฉพาะไฟล์ที่ Drive ยืนยันครบแล้ว หยุดกลางทางกดใหม่ได้</p>' +
        '<button class="btn btn-outline" id="stMvDrive">เริ่มย้ายไฟล์</button><div id="stMvInfo" class="hint" style="margin-top:6px"></div>' : '') +
      (FBL.mode === 'demo' ? '<div class="card-act"><button class="btn btn-danger" id="stReset">ล้างข้อมูลทดลองทั้งหมด</button></div>' : '') + '</div>' +
      '<div class="card' + (trash.length ? ' card-flush' : '') + '"><div class="' + (trash.length ? 'cf-head ' : '') + 'section-title">ถังขยะ <span class="sub">' + trash.length + ' ฉบับ</span></div>' +
      (trash.length ? '<div class="table-wrap"><table class="data"><tbody>' + trash.map(function (l) {
        return '<tr><td>' + esc(l._no) + ' · ' + esc(l.subject || '') + '<br><span class="muted small">ลบโดย ' + esc(l.deletedBy || '') + '</span></td><td class="nowrap r"><button class="btn btn-sm btn-outline" data-rs="' + esc(l.id) + '" data-col="' + l._col + '">กู้คืน</button>' +
          (can ? ' <button class="btn btn-sm btn-danger" data-hd="' + esc(l.id) + '" data-col="' + l._col + '">ลบถาวร</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty small">ไม่มีรายการในถังขยะ</div>') + '</div></div></div>';
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
    el.querySelectorAll('[data-rs]').forEach(function (b) { b.onclick = async function () { try { await FBL.restore(b.dataset.col, b.dataset.rs); A.toast('กู้คืนแล้ว'); } catch (e) { A.toast(e.message, true); } }; });
    el.querySelectorAll('[data-hd]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await A.confirm('ลบถาวร รวมไฟล์ที่แนบ? กู้คืนไม่ได้', 'ลบถาวร', true))) return;
        const isOut = b.dataset.col === 'out';
        const l = (isOut ? S.out : S.letters).find(function (x) { return x.id === b.dataset.hd; });
        if (!l) return;
        try {
          const paths = isOut ? (l.attachments || []).reduce(function (a, x) { return a.concat((x.images || []).map(function (im) { return im.path; })); }, []) : (l.files || []).map(function (f) { return f.path; });
          for (const p of paths) await FBL.deleteFile(p);
          await FBL.hardDelete(b.dataset.col, l.id, (isOut ? (l.docSuffix || 'ร่าง') : l.regNo) + ' ' + (l.subject || ''));
          A.toast('ลบถาวรแล้ว');
        } catch (e) { A.toast(e.message, true); }
      };
    });
    q('#stExp').onclick = function () {
      const data = { exportedAt: new Date().toISOString(), letters: S.letters, out: S.out, settings: A.settings() };
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
