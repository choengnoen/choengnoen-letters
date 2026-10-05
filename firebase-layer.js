/* ==========================================================================
   firebase-layer.js — ชั้นเชื่อมต่อข้อมูล (Authentication + Firestore · ไฟล์ PDF/รูปสแกนเก็บใน Google Drive ผ่าน drive-bridge.gs
                       ไม่ต้องใช้แพ็กเกจ Blaze — ถ้ายังไม่ตั้ง DRIVE_BRIDGE_URL จะเก็บใน Firestore แบบเดิม)
   ระบบหนังสือราชการ & เกษียณหนังสือ หมวดทางหลวงเชิงเนิน แขวงทางหลวงระยอง

   ใช้ Firebase โปรเจกต์ choengnoen-project ร่วมกับระบบผู้ควบคุมงานโครงการ และระบบผังจราจรและทางเบี่ยง (ระบบที่ 1 จาก 3)
     - รายชื่อผู้ใช้ (team) ชุดเดียวกัน: ล็อกอินด้วยชื่อ + รหัสผ่านเดียวกันทั้ง 3 เว็บ
       (อีเมลสังเคราะห์ ...@project.invalid ไม่มีการส่งอีเมลจริง) เจ้าของระบบ/ผู้ดูแลระบบ มีสิทธิ์เท่ากันทุกระบบ
     - เจ้าของระบบคนแรกตั้งได้ครั้งเดียว (config/bootstrap) — ตั้งไว้แล้วจากระบบผู้ควบคุมงาน
     - สิทธิ์บังคับที่ firestore.rules ไม่ใช่แค่ซ่อนปุ่ม
     - ทุกการเขียนบันทึก activity_log (ใช้ร่วมกัน) ในคำสั่งเดียวกัน (atomic batch)

   มี 2 โหมด
     1) firebase — เมื่อใส่ firebaseConfig จริงแล้ว
     2) demo     — ยังไม่ได้ใส่ config หรือเปิดด้วย ?demo=1 : เก็บข้อมูลในเบราว์เซอร์เครื่องนี้เท่านั้น

   ข้อมูล (collection) — ขึ้นต้นด้วย letters เพื่อไม่ชนกับระบบอื่นในโปรเจกต์เดียวกัน
     letters          — ทะเบียนหนังสือรับ (1 เอกสาร = หนังสือ 1 ฉบับ พร้อมผลวิเคราะห์ ลิงก์ QR และข้อความเกษียณ)
     letters_settings — letters_settings/app : บุคลากร/ตำแหน่ง, แนวทางเกษียณ, ข้อมูลหน่วยงาน (ในโค้ดหน้าเว็บเรียกว่า 'settings')
     letters_files    — ไฟล์ต้นฉบับ (PDF/รูปสแกน) แบ่งเป็นชิ้น — เฉพาะเมื่อยังไม่ใช้ Google Drive หรือไฟล์เดิมที่ยังไม่ได้ย้าย
   ========================================================================== */
(function () {
  'use strict';

  // ▼▼▼ วางค่าจาก Firebase Console → Project settings → Your apps → SDK setup and configuration ▼▼▼
  const firebaseConfig = {
    apiKey: "AIzaSyCbItTxZa9nbBbmCp0vwzUAvKeMdV--Aok",
    authDomain: "choengnoen-project.firebaseapp.com",
    projectId: "choengnoen-project",
    storageBucket: "choengnoen-project.firebasestorage.app",
    messagingSenderId: "694075265572",
    appId: "1:694075265572:web:14109f2bc45f53285ebeb1"
  };
  // ▲▲▲ ------------------------------------------------------------------------------------ ▲▲▲

  // ▼▼▼ วาง URL ของ drive-bridge (Apps Script → Deploy → Web app ลงท้ายด้วย /exec) — เว้นว่าง = เก็บไฟล์สแกนใน Firestore แบบเดิม ▼▼▼
  const DRIVE_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbx5BHleoNVSzw4bYFFc7kg00_D98JfwEKeCO_BFsNLNj_2DqRzuvq8rLgkU_IKCqlKRNA/exec';   // Apps Script: choengnoen-letters

  const EMAIL_DOMAIN = 'project.invalid';   // เหมือนระบบผู้ควบคุมงาน เพราะใช้รายชื่อผู้ใช้ชุดเดียวกัน
  const COLS = ['letters', 'settings'];
  // ชื่อที่หน้าเว็บใช้ → ชื่อ collection จริงใน Firestore (ชื่อ settings/files ธรรมดาอาจชนกับระบบอื่นในโปรเจกต์)
  const PHYS = { letters: 'letters', settings: 'letters_settings', files: 'letters_files' };
  function colName(col) { return PHYS[col] || col; }
  const LOG_PREFIX = /^letters(_settings)?\//;

  const params = new URLSearchParams(location.search);
  const configured = /^AIza/.test(firebaseConfig.apiKey || '');
  const DEMO = params.has('demo') || !configured || typeof firebase === 'undefined';

  const FBL = { mode: DEMO ? 'demo' : 'firebase', user: null, onError: null, COLS: COLS };
  window.FBL = FBL;

  /* ---------- ตัวช่วยทั่วไป ---------- */
  function thErr(e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/invalid-credential': 'รหัสผ่านไม่ถูกต้อง',
      'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
      'auth/invalid-login-credentials': 'รหัสผ่านไม่ถูกต้อง',
      'auth/user-not-found': 'ไม่พบบัญชีนี้ในระบบ',
      'auth/too-many-requests': 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
      'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสอบสัญญาณแล้วลองใหม่',
      'auth/weak-password': 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร',
      'auth/password-does-not-meet-requirements': 'รหัสผ่านไม่ตรงตามเงื่อนไขความปลอดภัยของระบบ (ยาวอย่างน้อย 8 ตัวอักษร)',
      'auth/email-already-in-use': 'เกิดบัญชีซ้ำโดยบังเอิญ กรุณาลองอีกครั้ง',
      'auth/requires-recent-login': 'กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ก่อนเปลี่ยนรหัสผ่าน',
      'auth/operation-not-allowed': 'ยังไม่ได้เปิดการเข้าสู่ระบบแบบ Email/Password ใน Firebase Console',
      'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase (Authentication → Settings → Authorized domains)',
      'permission-denied': 'ไม่มีสิทธิ์ทำรายการนี้ (ตรวจสอบว่าได้วางกฎ firestore.rules ชุดล่าสุดแล้ว และล็อกอินด้วยบัญชีที่มีสิทธิ์)',
      'resource-exhausted': 'เกินโควตาฟรีของ Firestore (พื้นที่ 1 GB หรือจำนวนครั้งต่อวัน) — ลบไฟล์หนังสือเก่าที่เก็บเข้าแฟ้มแล้ว หรือรอวันถัดไป',
      'unavailable': 'เชื่อมต่อฐานข้อมูลไม่ได้ในขณะนี้ กรุณาลองใหม่',
      'failed-precondition': 'ฐานข้อมูลไม่พร้อมทำรายการนี้'
    };
    return map[code] || ((e && e.message) ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
  }
  FBL.errorText = thErr;

  function nowIso() { return new Date().toISOString(); }
  function randomId(n) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, n);
  }
  FBL.newId = function () { return Date.now().toString(36) + randomId(6); };
  function newEmail() { return 'm-' + randomId(12) + '@' + EMAIL_DOMAIN; }
  // Firestore ไม่รับ undefined / NaN / Infinity — ล้างแบบลึก
  function clean(v) {
    if (v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v && v._methodName)) {
      const out = {};
      Object.keys(v).forEach(function (k) { if (v[k] !== undefined && k.charAt(0) !== '_') out[k] = clean(v[k]); });
      return out;
    }
    return v;
  }
  FBL.clean = clean;
  function requireOwner() { if (!FBL.user || !FBL.user.isOwner) throw new Error('เฉพาะเจ้าของระบบเท่านั้น'); }
  // รหัสผ่านที่ตั้ง/เปลี่ยนใหม่ ต้องยาวอย่างน้อย 8 ตัว (คนที่ใช้รหัสเดิมอยู่ไม่ถูกบังคับ — ตรวจเฉพาะตอนตั้งใหม่)
  const MIN_PASSWORD = 8;
  function requireNewPassword(p) {
    if (String(p || '').length < MIN_PASSWORD) throw new Error('รหัสผ่านต้องยาวอย่างน้อย ' + MIN_PASSWORD + ' ตัวอักษร');
  }
  FBL.minPassword = MIN_PASSWORD;
  function requirePrivileged() { if (!FBL.user || !(FBL.user.isOwner || FBL.user.isAdmin)) throw new Error('เฉพาะเจ้าของระบบหรือผู้ดูแลระบบเท่านั้น'); }
  function sortTeam(t) {
    t.sort(function (a, b) { return (b.isOwner ? 1 : 0) - (a.isOwner ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'th'); });
    return t;
  }
  function stamp(rec, isNew) {
    const r = Object.assign({}, rec);
    r.updatedAt = nowIso(); r.updatedBy = FBL.user ? FBL.user.name : '';
    if (isNew) { r.createdAt = r.createdAt || r.updatedAt; r.createdBy = r.createdBy || r.updatedBy; }
    return r;
  }

  let team = [];
  FBL.team = function () { return team.slice(); };

  if (DEMO) setupDemo(); else setupFirebase();

  /* ======================================================================
     โหมด Firebase
     ====================================================================== */
  function setupFirebase() {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    try {
      db.enablePersistence({ synchronizeTabs: true }).catch(function (e) { console.warn('offline cache unavailable', e && e.code); });
    } catch (e) { /* เบราว์เซอร์ไม่รองรับ */ }
    let suppressAuthEvents = false;

    /* ---------- สมุดชื่อล็อกอิน (login_directory) — แผน 6 ----------
       หน้าล็อกอินต้องอ่านรายชื่อได้ก่อนล็อกอิน จึงแยกเก็บเฉพาะ ชื่อ → อีเมลสังเคราะห์ (ไม่มีสถานะเจ้าของ/ผู้ดูแล) ไว้ที่ login_directory/{uid}
       ส่วนตาราง team (มีสถานะเจ้าของ/ผู้ดูแล) อ่านได้เฉพาะสมาชิก — หลังเจ้าของกดย้ายแล้ว (มีเอกสาร login_directory/_ready)
       ก่อนย้าย: ทุกอย่างทำงานแบบเดิม (อ่านรายชื่อจาก team) จึงไม่มีใครล็อกอินไม่ได้ระหว่างเปลี่ยน
       (ใช้ร่วม 3 ระบบ: หนังสือราชการ / ควบคุมงานโครงการ / ผังจราจร — โค้ดส่วนนี้เหมือนกันทุกระบบ) */
    const DIR_READY_ID = '_ready';
    function dirRef(uid) { return db.collection('login_directory').doc(uid); }
    async function readLoginDirectory() {
      const snap = await db.collection('login_directory').get();
      let ready = false;
      const list = [];
      snap.docs.forEach(function (d) {
        if (d.id === DIR_READY_ID) { ready = true; return; }
        const v = d.data();
        if (v && v.name && v.email) list.push({ uid: d.id, name: v.name, email: v.email });
      });
      return { ready: ready, list: list };
    }
    // ก่อนล็อกอิน: อ่านสมุดชื่อ (ไม่มีสถานะเจ้าของ/ผู้ดูแล) · หลังล็อกอิน: อ่านตาราง team เต็ม
    FBL.loadTeam = async function () {
      let list = null;
      if (!FBL.user) {
        try {
          const dir = await readLoginDirectory();
          if (dir.ready) list = dir.list;
        } catch (e) { /* ยังไม่ได้ประกาศกฎชุดใหม่ — อ่านจาก team แบบเดิม */ }
      }
      if (!list) {
        const snap = await db.collection('team').get();
        list = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
      }
      team = sortTeam(list);
      return team.slice();
    };

    // เจ้าของระบบ: สถานะสมุดชื่อล็อกอิน — ready = ย้ายแล้ว (ปิดไม่ให้คนนอกอ่านตาราง team), missing/extra = ชื่อที่สมุดไม่ตรงกับ team
    FBL.loginDirStatus = async function () {
      const dir = await readLoginDirectory();
      const tsnap = await db.collection('team').get();
      const inDir = {}; dir.list.forEach(function (e) { inDir[e.uid] = e.email; });
      const inTeam = {};
      const missing = [];
      tsnap.docs.forEach(function (d) {
        const v = d.data(); inTeam[d.id] = true;
        if (inDir[d.id] !== v.email) missing.push(v.name);
      });
      const extra = dir.list.filter(function (e) { return !inTeam[e.uid]; }).map(function (e) { return e.name; });
      return { ready: dir.ready, total: tsnap.size, missing: missing, extra: extra };
    };
    // เจ้าของระบบกดครั้งเดียว: คัดลอก ชื่อ→อีเมล จาก team เข้าสมุดชื่อ แล้วเปิดธง _ready (ทั้งหมดในคำสั่งเดียว สำเร็จทั้งชุดหรือไม่ทำเลย)
    // กดซ้ำได้ปลอดภัย (ใช้ซิงก์สมุดชื่อให้ตรงกับ team อีกครั้ง)
    FBL.migrateLoginDirectory = async function () {
      requireOwner();
      try {
        const tsnap = await db.collection('team').get();
        const dir = await readLoginDirectory();
        const batch = db.batch();
        const ids = {};
        tsnap.docs.forEach(function (d) {
          const v = d.data(); ids[d.id] = true;
          batch.set(dirRef(d.id), { name: v.name, email: v.email });
        });
        dir.list.forEach(function (e) { if (!ids[e.uid]) batch.delete(dirRef(e.uid)); });
        batch.set(dirRef(DIR_READY_ID), { at: nowIso(), by: FBL.user.uid });
        await batch.commit();
        return { total: tsnap.size };
      } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.onAuth = function (cb) {
      auth.onAuthStateChanged(async function (u) {
        if (suppressAuthEvents) return;
        if (!u) { FBL.user = null; cb(null); return; }
        try {
          const d = await db.collection('team').doc(u.uid).get();
          if (!d.exists) {
            FBL.user = null; await auth.signOut();
            cb(null, 'บัญชีนี้ไม่ได้อยู่ในรายชื่อผู้ใช้งาน กรุณาติดต่อเจ้าของระบบ'); return;
          }
          FBL.user = { uid: u.uid, name: d.data().name, isOwner: !!d.data().isOwner, isAdmin: !!d.data().isAdmin };
          try { await FBL.loadTeam(); } catch (e) { /* ข้าม — หน้าเว็บโหลดรายชื่อซ้ำเองอีกครั้ง */ }   // ล็อกอินแล้วอ่านตาราง team เต็มได้ (มีสถานะเจ้าของ/ผู้ดูแล)
          cb(FBL.user);
        } catch (e) { FBL.user = null; cb(null, thErr(e)); }
      });
    };

    FBL.login = async function (name, password) {
      const m = team.find(function (x) { return x.name === String(name || '').trim(); });
      if (!m) throw new Error('ไม่พบชื่อนี้ในระบบ');
      try { await auth.signInWithEmailAndPassword(m.email, password); } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.logout = async function () { FBL.stopAll(); await auth.signOut(); };

    /* ==== IDLE-GUARD v1 — ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งาน + ล้างข้อมูลแคชในเครื่อง (โค้ดชุดเดียวกันทุกระบบ ห้ามแก้เฉพาะระบบ) ====
       - นับเวลาจากเมาส์/แป้นพิมพ์/แตะจอ รวมทุกแท็บของระบบเดียวกัน (แชร์ผ่าน localStorage)
       - เตือนก่อนออก (ไม่ขัดจังหวะ ไม่ดึงโฟกัสจากช่องที่กำลังพิมพ์) แล้วออกจากระบบ: signOut → terminate → clearPersistence → โหลดหน้าใหม่
       - ทดสอบ: ตั้ง localStorage 'fbl_idle_test' = "วินาทีออก,วินาทีเตือน" (ใช้ได้เฉพาะ "ลดเวลา" ลง ไม่ทำให้ยาวขึ้น) */
    (function (FBL, auth, db, pid) {
      var IDLE_MIN = 60, WARN_MIN = 5;
      var idleMs = IDLE_MIN * 60000, warnMs = WARN_MIN * 60000;
      try {
        var tst = String(localStorage.getItem('fbl_idle_test') || '').split(',');
        if (+tst[0] > 0) { idleMs = Math.min(idleMs, +tst[0] * 1000); warnMs = Math.min(warnMs, (+tst[1] > 0 ? +tst[1] : +tst[0] / 3) * 1000, idleMs - 1000); }
      } catch (e) { /* ข้าม */ }
      var K_ACT = 'fbl_idle_act_' + pid, K_OUT = 'fbl_idle_out_' + pid, K_DONE = 'fbl_idle_done_' + pid;
      var lastLocal = 0, lastWrite = 0, warnEl = null, shield = null, leaving = false, inFlight = null, leader = false;

      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function lsGet(k) { try { return +localStorage.getItem(k) || 0; } catch (e) { return 0; } }
      function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* ข้าม */ } }
      function lastActive() { return Math.max(lastLocal, lsGet(K_ACT)); }
      function touch() {
        var n = Date.now(); lastLocal = n;
        if (n - lastWrite > 3000) { lastWrite = n; lsSet(K_ACT, n); }
        if (warnEl) hideWarn();
      }
      var staleOnLoad = lsGet(K_ACT) > 0 && Date.now() - lsGet(K_ACT) >= idleMs; // เปิดหน้าขึ้นมาตอนที่ค้างไม่ได้ใช้งานเกินกำหนดแล้ว
      if (!lsGet(K_ACT)) lsSet(K_ACT, Date.now()); // ครั้งแรกที่ใช้ระบบนี้ในเครื่อง — ยังไม่มีบันทึก ถือว่าเริ่มนับจากตอนนี้

      /* ---------- กล่องเตือน ---------- */
      function dirtyCount() {
        var n = 0;
        try {
          var els = document.querySelectorAll('input:not([type=password]):not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea');
          for (var i = 0; i < els.length; i++) { var el = els[i]; if (el.offsetParent !== null && !el.readOnly && !el.disabled && el.value !== el.defaultValue) n++; }
        } catch (e) { /* ข้าม */ }
        return n;
      }
      function fmt(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60)).slice(-2); }
      function showWarn(left) {
        if (!warnEl) {
          warnEl = document.createElement('div');
          warnEl.setAttribute('role', 'alert');
          warnEl.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:340px;background:#fff8e1;color:#4a3300;border:2px solid #f59e0b;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.35);padding:14px 16px;font:14px/1.5 system-ui,"Sarabun","Noto Sans Thai",sans-serif';
          warnEl.innerHTML = '<div style="font-weight:700;margin-bottom:4px">⏱ ไม่มีการใช้งานสักครู่</div>' +
            '<div>ระบบจะออกจากระบบอัตโนมัติใน <b data-idle-left></b> เพื่อความปลอดภัยของข้อมูล</div>' +
            '<div data-idle-dirty style="display:none;margin-top:6px;color:#b45309;font-weight:600"></div>' +
            '<button type="button" data-idle-stay style="margin-top:10px;width:100%;padding:8px;border:0;border-radius:8px;background:#f59e0b;color:#fff;font:inherit;font-weight:700;cursor:pointer">ยังใช้งานอยู่ — อยู่ต่อ</button>';
          warnEl.querySelector('[data-idle-stay]').onclick = function () { touch(); };
          // ไม่ดึงโฟกัสออกจากช่องที่กำลังพิมพ์: กดปุ่มนี้ด้วยเมาส์ไม่ย้ายโฟกัส
          warnEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
          (document.body || document.documentElement).appendChild(warnEl);
        }
        warnEl.querySelector('[data-idle-left]').textContent = fmt(left);
        var d = dirtyCount(), dEl = warnEl.querySelector('[data-idle-dirty]');
        if (d > 0) { dEl.style.display = 'block'; dEl.textContent = 'อาจมีข้อมูลที่กรอกค้างอยู่ ' + d + ' ช่อง — กดบันทึกก่อนครบเวลา ไม่เช่นนั้นข้อมูลจะหาย'; }
        else dEl.style.display = 'none';
      }
      function hideWarn() { if (warnEl) { warnEl.remove(); warnEl = null; } }
      function showShield() {
        if (shield) return;
        shield = document.createElement('div');
        shield.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#0b2540;color:#fff;display:flex;align-items:center;justify-content:center;font:600 18px system-ui,"Sarabun","Noto Sans Thai",sans-serif';
        shield.textContent = 'กำลังออกจากระบบและล้างข้อมูลในเครื่อง...';
        (document.body || document.documentElement).appendChild(shield);
      }

      /* ---------- ออกจากระบบ + ล้างแคช ---------- */
      async function wipe() {
        try { await db.terminate(); } catch (e) { /* ข้าม */ }
        for (var i = 0; i < 8; i++) {
          try { await db.clearPersistence(); return true; } catch (e) { await sleep(500); }
        }
        console.warn('ล้างแคชในเครื่องไม่สำเร็จ (อาจมีแท็บอื่นเปิดระบบนี้ค้างอยู่)');
        return false;
      }
      var origLogout = FBL.logout;
      FBL.logout = function () {
        if (inFlight) return inFlight;
        var args = arguments;
        leaving = true; leader = true; FBL._leaving = true;
        hideWarn(); showShield();
        inFlight = (async function () {
          setTimeout(function () { location.reload(); }, 25000); // กันค้าง
          lsSet(K_OUT, Date.now());                    // บอกแท็บอื่นของระบบนี้ให้ปิดฐานข้อมูล (ไม่งั้นล้างแคชไม่ได้)
          // ส่งข้อมูลที่ค้างรอส่งขึ้นเซิร์ฟเวอร์ให้เสร็จก่อน ไม่งั้นการล้างแคชจะทำให้ข้อมูลที่เพิ่งบันทึกตอนออฟไลน์หาย
          try { await Promise.race([db.waitForPendingWrites(), sleep(5000)]); } catch (e) { /* ข้าม */ }
          try { await origLogout.apply(FBL, args); } catch (e) { /* ข้าม */ }
          try { await auth.signOut(); } catch (e) { /* ข้าม */ }
          await wipe();
          lsSet(K_DONE, Date.now());
          location.reload();
          await new Promise(function () { });          // ไม่ให้โค้ดหลังปุ่มออกจากระบบทำงานต่อระหว่างโหลดหน้าใหม่
        })();
        return inFlight;
      };

      // แท็บอื่นของระบบเดียวกัน: ปิดฐานข้อมูลแล้วรอแท็บที่กดออกล้างเสร็จ จึงโหลดใหม่
      window.addEventListener('storage', function (e) {
        if (e.key === K_OUT && e.newValue && !leader && !leaving) {
          leaving = true; FBL._leaving = true; showShield();
          try { db.terminate().catch(function () { }); } catch (x) { /* ข้าม */ }
          setTimeout(function () { location.reload(); }, 15000);
        } else if (e.key === K_DONE && e.newValue && !leader && leaving) {
          location.reload();
        }
      });

      /* ---------- นับเวลาไม่ใช้งาน ---------- */
      ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'click'].forEach(function (t) {
        window.addEventListener(t, touch, { passive: true, capture: true });
      });
      // เหตุการณ์ล็อกอินครั้งแรกหลังเปิดหน้า: ถ้าเป็นเซสชันเก่าที่ค้างมานานเกินกำหนด ให้ออกจากระบบทันที (ไม่ให้แค่ขยับเมาส์แล้วเข้าได้เลย)
      auth.onAuthStateChanged(function (u) { if (u && staleOnLoad && !leaving) FBL.logout(); staleOnLoad = false; });
      function tick() {
        if (leaving || !auth.currentUser) { if (!auth.currentUser) hideWarn(); return; }
        var idle = Date.now() - lastActive();
        if (idle >= idleMs) FBL.logout();
        else if (idle >= idleMs - warnMs) showWarn(idleMs - idle);
        else if (warnEl) hideWarn();
      }
      setInterval(tick, 1000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    })(FBL, auth, db, firebaseConfig.projectId);

    FBL.bootstrapOwner = async function (name, password) {
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      requireNewPassword(password);
      suppressAuthEvents = true;
      try {
        const email = newEmail();
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        try {
          const batch = db.batch();
          batch.set(db.collection('team').doc(uid), { name: name, email: email, isOwner: true, isAdmin: false, createdAt: nowIso() });
          batch.set(db.collection('config').doc('bootstrap'), { uid: uid, at: nowIso() });
          batch.set(dirRef(uid), { name: name, email: email });
          batch.set(dirRef(DIR_READY_ID), { at: nowIso(), by: uid });   // ระบบใหม่ใช้สมุดชื่อตั้งแต่แรก
          await batch.commit();
        } catch (e) { try { await cred.user.delete(); } catch (_) { /* ล้างบัญชีค้าง */ } throw e; }
        FBL.user = { uid: uid, name: name, isOwner: true, isAdmin: false };
        team = [{ uid: uid, name: name, email: email, isOwner: true, isAdmin: false }];
        return FBL.user;
      } catch (e) { throw new Error(thErr(e)); } finally { suppressAuthEvents = false; }
    };

    async function createAuthUserSecondary(email, password) {
      const sec = firebase.apps.find(function (a) { return a.name === 'secondary'; }) || firebase.initializeApp(firebaseConfig, 'secondary');
      const cred = await sec.auth().createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      await sec.auth().signOut();
      return uid;
    }

    FBL.addMember = async function (name, password, isAdmin) {
      requireOwner();
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      if (team.some(function (t) { return t.name === name; })) throw new Error('มีชื่อนี้อยู่แล้ว');
      requireNewPassword(password);
      try {
        const email = newEmail();
        const uid = await createAuthUserSecondary(email, password);
        const batch = db.batch();
        batch.set(db.collection('team').doc(uid), { name: name, email: email, isOwner: false, isAdmin: !!isAdmin, createdAt: nowIso() });
        batch.set(dirRef(uid), { name: name, email: email });
        await batch.commit();
        team.push({ uid: uid, name: name, email: email, isOwner: false, isAdmin: !!isAdmin });
        sortTeam(team);
      } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.removeMember = async function (name) {
      requireOwner();
      const m = team.find(function (t) { return t.name === name; });
      if (!m) return;
      if (m.isOwner) throw new Error('ลบเจ้าของระบบไม่ได้');
      try {
        const batch = db.batch();
        batch.delete(db.collection('team').doc(m.uid));
        batch.delete(dirRef(m.uid));
        await batch.commit();
        team = team.filter(function (t) { return t.uid !== m.uid; });
      }
      catch (e) { throw new Error(thErr(e)); }
    };

    FBL.setMemberAdmin = async function (name, makeAdmin) {
      requireOwner();
      const m = team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้');
      if (m.isOwner) throw new Error('เจ้าของระบบมีสิทธิ์ครบอยู่แล้ว');
      try { await db.collection('team').doc(m.uid).update({ isAdmin: !!makeAdmin }); m.isAdmin = !!makeAdmin; }
      catch (e) { throw new Error(thErr(e)); }
    };

    // Firebase ฝั่งเบราว์เซอร์แก้รหัสผ่านคนอื่นตรงๆ ไม่ได้ → สร้างบัญชีล็อกอินใหม่ให้แล้วสลับรายชื่อ
    FBL.resetMemberPassword = async function (name, newPassword) {
      requireOwner();
      const m = team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้');
      requireNewPassword(newPassword);
      try {
        if (FBL.user && m.uid === FBL.user.uid) { await auth.currentUser.updatePassword(newPassword); return; }
        const email = newEmail();
        const uid = await createAuthUserSecondary(email, newPassword);
        const batch = db.batch();
        batch.delete(db.collection('team').doc(m.uid));
        batch.set(db.collection('team').doc(uid), { name: m.name, email: email, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin, createdAt: nowIso() });
        batch.delete(dirRef(m.uid));
        batch.set(dirRef(uid), { name: m.name, email: email });
        await batch.commit();
        team = team.filter(function (t) { return t.uid !== m.uid; });
        team.push({ uid: uid, name: m.name, email: email, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin });
        sortTeam(team);
      } catch (e) { throw new Error(thErr(e)); }
    };

    FBL.changeMyPassword = async function (newPassword) {
      requireNewPassword(newPassword);
      try { await auth.currentUser.updatePassword(newPassword); } catch (e) { throw new Error(thErr(e)); }
    };

    /* ---------- อ่านแบบ realtime ---------- */
    const subs = {};
    FBL.watch = function (col, onChange) {
      if (subs[col]) { subs[col].onChange = onChange || subs[col].onChange; return subs[col].first; }
      const s = subs[col] = { docs: [], firstDone: false, onChange: onChange };
      s.first = new Promise(function (resolve) {
        s.unsub = db.collection(colName(col)).onSnapshot(function (snap) {
          s.docs = snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); });
          if (!s.firstDone) { s.firstDone = true; resolve(s.docs); }
          else if (s.onChange) { try { s.onChange(s.docs); } catch (e) { console.error(e); } }
        }, function (err) {
          console.error('watch ' + col + ' failed', err);
          if (FBL.onError) FBL.onError(thErr(err));
          if (!s.firstDone) { s.firstDone = true; resolve([]); }
        });
      });
      return s.first;
    };
    FBL.stopAll = function () { Object.keys(subs).forEach(function (k) { if (subs[k].unsub) subs[k].unsub(); delete subs[k]; }); };

    /* ---------- เขียน (+ activity_log ใน batch เดียวกัน) ---------- */
    function logEntry(action, target, summary) {
      return {
        ts: firebase.firestore.FieldValue.serverTimestamp(),
        actorName: FBL.user ? FBL.user.name : '',
        actorUid: FBL.user ? FBL.user.uid : '',
        action: action, target: target, summary: String(summary || '').slice(0, 300)
      };
    }
    FBL.save = async function (col, rec, summary) {
      if (COLS.indexOf(col) < 0) throw new Error('ไม่รู้จักชุดข้อมูล ' + col);
      const isNew = !rec.id;
      const id = rec.id || FBL.newId();
      const data = clean(stamp(Object.assign({}, rec, { id: id }), isNew));
      const batch = db.batch();
      batch.set(db.collection(colName(col)).doc(id), data, { merge: false });
      batch.set(db.collection('activity_log').doc(), logEntry(isNew ? 'add' : 'update', colName(col) + '/' + id, summary));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
      return id;
    };
    FBL.softDelete = async function (col, id, summary) {
      const batch = db.batch();
      batch.update(db.collection(colName(col)).doc(id), { deletedAt: nowIso(), deletedBy: FBL.user ? FBL.user.name : '' });
      batch.set(db.collection('activity_log').doc(), logEntry('delete', colName(col) + '/' + id, summary));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
    };
    FBL.restore = async function (col, id) {
      const batch = db.batch();
      batch.update(db.collection(colName(col)).doc(id), { deletedAt: null, deletedBy: '' });
      batch.set(db.collection('activity_log').doc(), logEntry('restore', colName(col) + '/' + id, ''));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
    };
    FBL.hardDelete = async function (col, id, summary) {
      requirePrivileged();
      const batch = db.batch();
      batch.delete(db.collection(colName(col)).doc(id));
      batch.set(db.collection('activity_log').doc(), logEntry('permanentDelete', colName(col) + '/' + id, summary));
      try { await batch.commit(); } catch (e) { throw new Error(thErr(e)); }
    };

    // activity_log ใช้ร่วมกับระบบอื่นในโปรเจกต์ — ดึงมาเผื่อแล้วกรองเฉพาะรายการของระบบหนังสือราชการ
    FBL.loadLog = async function (limit) {
      requirePrivileged();
      limit = limit || 200;
      const snap = await db.collection('activity_log').orderBy('ts', 'desc').limit(limit * 5).get();
      return snap.docs.map(function (d) {
        const x = d.data();
        return Object.assign({}, x, { ts: x.ts && x.ts.toDate ? x.ts.toDate().toISOString() : '' });
      }).filter(function (x) { return LOG_PREFIX.test(String(x.target || '')); }).slice(0, limit);
    };

    /* ---------- ไฟล์สแกน ----------
       หลัก: Google Drive ผ่าน drive-bridge.gs (Apps Script) — ไม่กินพื้นที่ Firestore 1 GB
             อ่านแล้วเก็บสำเนาไว้ในเครื่อง (Cache Storage) ไฟล์ไม่เปลี่ยนหลังอัปโหลด จึงไม่ต้องโหลดซ้ำ
       สำรอง: เก็บเป็นชิ้นใน Firestore — letters_files/{fid} (ข้อมูลไฟล์ + ชิ้นแรก d0) + letters_files/{fid}/chunks/{1..n-1} ชิ้นละไม่เกิน 900 KB
             ใช้เมื่อยังไม่ตั้ง DRIVE_BRIDGE_URL · ไฟล์เดิมยังอ่าน/ลบได้ จนกว่าจะกด "ย้ายไฟล์เดิมไป Google Drive" ในหน้าตั้งค่า */
    const DRIVE = /^https:\/\/script\.google\.com\/.+\/exec$/.test(DRIVE_BRIDGE_URL);
    const CHUNK = 900 * 1024;
    const blobCache = {}, pending = {};
    FBL.fileStore = DRIVE ? 'drive' : 'firestore';
    FBL.maxFileBytes = (DRIVE ? 20 : 10) * 1024 * 1024;
    function tooBig() { return new Error('ไฟล์ใหญ่เกิน ' + (FBL.maxFileBytes / 1048576) + ' MB — ลดความละเอียดการสแกน (200 dpi ขาวดำก็พอ) แล้วลองใหม่'); }

    /* --- Firestore (แบบเดิม) --- */
    function fid(path) { return String(path).replace(/\//g, '~'); }
    function fileRef(path) { return db.collection(PHYS.files).doc(fid(path)); }
    function toBlobField(u8) { return firebase.firestore.Blob.fromUint8Array(u8); }
    async function getCacheFirst(ref) {
      try { const s = await ref.get({ source: 'cache' }); if (s.exists) return s; } catch (e) { /* ไม่มีในแคช */ }
      return ref.get();
    }
    async function legacyUpload(path, u8, type, onProgress) {
      const n = Math.max(1, Math.ceil(u8.length / CHUNK));
      const ref = fileRef(path);
      try {
        // ชิ้นที่ 2 เป็นต้นไปก่อน แล้วค่อยเขียนเอกสารหลัก (มีเอกสารหลัก = ไฟล์ครบ)
        for (let i = 1; i < n; i++) {
          await ref.collection('chunks').doc(String(i)).set({ d: toBlobField(u8.subarray(i * CHUNK, (i + 1) * CHUNK)) });
          if (onProgress) onProgress(i / n);
        }
        await ref.set({
          path: path, type: type, size: u8.length, n: n,
          d0: toBlobField(u8.subarray(0, CHUNK)),
          uploadedAt: nowIso(), uploadedBy: FBL.user ? FBL.user.name : ''
        });
      } catch (e) { throw new Error(thErr(e)); }
    }
    async function legacyBlobFrom(snap) {
      const m = snap.data();
      const parts = [m.d0.toUint8Array()];
      for (let i = 1; i < (m.n || 1); i++) {
        const c = await getCacheFirst(snap.ref.collection('chunks').doc(String(i)));
        if (!c.exists) throw new Error('ไฟล์ไม่ครบ');
        parts.push(c.data().d.toUint8Array());
      }
      return new Blob(parts, { type: m.type || 'application/octet-stream' });
    }
    async function legacyBlob(path) {
      const snap = await getCacheFirst(fileRef(path));
      return snap.exists ? legacyBlobFrom(snap) : null;
    }
    async function legacyDeleteSnap(snap) {
      const n = snap.data().n || 1;
      for (let i = 1; i < n; i++) await snap.ref.collection('chunks').doc(String(i)).delete();
      await snap.ref.delete();
    }

    /* --- Google Drive --- */
    async function bridge(body) {
      if (!auth.currentUser) throw new Error('ยังไม่ได้ล็อกอิน');
      body.idToken = await auth.currentUser.getIdToken();
      let r, j;
      // text/plain = ไม่ต้องมีคำขอ preflight (Apps Script ไม่รองรับ OPTIONS)
      try { r = await fetch(DRIVE_BRIDGE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
      catch (e) { throw new Error('เชื่อมต่อ Google Drive ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); }
      try { j = await r.json(); } catch (e) { throw new Error('ตัวกลาง Google Drive ตอบกลับผิดรูปแบบ (ตรวจสอบการ Deploy ของ drive-bridge ว่าเลือก Who has access = Anyone)'); }
      if (!j.ok) throw new Error(j.error || 'Google Drive ทำรายการไม่สำเร็จ');
      return j;
    }
    function toB64(u8) {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    }
    function fromB64(s) {
      const bin = atob(s), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    async function drivePut(path, u8, type) {
      const j = await bridge({ action: 'put', path: path, type: type, data: toB64(u8) });
      if (j.size !== u8.length) throw new Error('อัปโหลดไม่ครบ กรุณาลองใหม่');
    }
    async function driveGet(path) {
      const j = await bridge({ action: 'get', paths: [path] });
      const f = (j.files || [])[0];
      return f && !f.missing ? new Blob([fromB64(f.data)], { type: f.type || 'application/octet-stream' }) : null;
    }

    /* --- สำเนาในเครื่อง (Cache Storage) — ใช้ไม่ได้ก็ข้ามไป --- */
    const LOCAL = 'ltr-files-v1';
    function localKey(path) { return new URL('__ltr_files__/' + encodeURIComponent(path), location.href).href; }
    async function localGet(path) {
      try { const r = await (await caches.open(LOCAL)).match(localKey(path)); return r ? await r.blob() : null; } catch (e) { return null; }
    }
    async function localPut(path, blob) {
      try { await (await caches.open(LOCAL)).put(localKey(path), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } })); } catch (e) { /* ข้าม */ }
    }
    async function localDel(path) { try { await (await caches.open(LOCAL)).delete(localKey(path)); } catch (e) { /* ข้าม */ } }

    /* --- ใช้งาน --- */
    FBL.uploadFile = async function (path, blob, onProgress) {
      if (blob.size > FBL.maxFileBytes) throw tooBig();
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const type = blob.type || 'application/octet-stream';
      if (DRIVE) {
        if (onProgress) onProgress(0.05);
        await drivePut(path, u8, type);
        await localPut(path, blob);
      } else await legacyUpload(path, u8, type, onProgress);
      if (onProgress) onProgress(1);
      blobCache[path] = blob;
      return path;
    };
    FBL.fileBlob = function (path) {
      if (!path) return Promise.resolve(null);
      if (blobCache[path]) return Promise.resolve(blobCache[path]);
      if (pending[path]) return pending[path];
      pending[path] = (async function () {
        try {
          let blob = DRIVE ? await localGet(path) : null;
          if (!blob && DRIVE) { blob = await driveGet(path); if (blob) localPut(path, blob); }
          if (!blob) blob = await legacyBlob(path);   // ไฟล์เก่าที่ยังไม่ได้ย้ายออกจาก Firestore
          if (blob) blobCache[path] = blob;
          return blob;
        } catch (e) { console.warn('fileBlob', path, e && (e.code || e.message)); return null; }
        finally { delete pending[path]; }
      })();
      return pending[path];
    };
    FBL.deleteFile = async function (path) {
      requirePrivileged();
      try {
        if (DRIVE) await bridge({ action: 'del', path: path });   // เข้าถังขยะของ Drive (กู้คืนได้ 30 วัน)
        const snap = await fileRef(path).get();
        if (snap.exists) await legacyDeleteSnap(snap);
      } catch (e) { throw new Error(thErr(e)); }
      await localDel(path);
      delete blobCache[path];
    };

    // ย้ายไฟล์เดิมทั้งหมดจาก Firestore ไป Drive — ลบออกจาก Firestore เฉพาะไฟล์ที่ Drive ยืนยันขนาดตรงกันแล้ว
    // onProgress(ย้ายแล้ว, ไม่สำเร็จ, path ล่าสุด) · กดซ้ำได้ ไฟล์ที่ย้ายแล้วจะไม่อยู่ใน Firestore อีก
    FBL.migrateFilesToDrive = async function (onProgress) {
      requirePrivileged();
      if (!DRIVE) throw new Error('ยังไม่ได้ตั้งค่า DRIVE_BRIDGE_URL ใน firebase-layer.js');
      await bridge({ action: 'ping' });
      let done = 0, last = null;
      const failed = [];
      for (;;) {
        let q = db.collection(PHYS.files).orderBy(firebase.firestore.FieldPath.documentId()).limit(10);
        if (last) q = q.startAfter(last);
        let snap;
        try { snap = await q.get(); } catch (e) { throw new Error(thErr(e)); }
        if (snap.empty) break;
        for (const d of snap.docs) {
          last = d;
          const path = d.data().path || d.id.replace(/~/g, '/');
          try {
            const blob = await legacyBlobFrom(d);
            await drivePut(path, new Uint8Array(await blob.arrayBuffer()), blob.type);
            await localPut(path, blob);
            await legacyDeleteSnap(d);
            done++;
          } catch (e) { failed.push(path + ' — ' + (e.message || thErr(e))); }
          if (onProgress) onProgress(done, failed.length, path);
        }
      }
      return { done: done, failed: failed };
    };
  }

  /* ======================================================================
     โหมดทดลอง (demo) — เก็บทุกอย่างในเบราว์เซอร์เครื่องนี้ (localStorage + IndexedDB)
     ====================================================================== */
  function setupDemo() {
    const KEY = 'ltr_demo_v1';
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    let S = load();
    S.team = S.team || []; S.cols = S.cols || {}; S.log = S.log || [];
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(S)); }
      catch (e) { if (FBL.onError) FBL.onError('พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (โหมดทดลอง)'); }
    }
    async function hash(s) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ltr|' + s));
        return Array.from(new Uint8Array(buf)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      } catch (e) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'x' + h; }
    }
    const listeners = {};
    function list(col) {
      const src = S.cols[col] || {};
      return Object.keys(src).map(function (id) { return JSON.parse(JSON.stringify(src[id])); });
    }
    function emit(col) {
      (listeners[col] || []).forEach(function (cb) { setTimeout(function () { try { cb(list(col)); } catch (e) { console.error(e); } }, 0); });
    }
    function log(action, target, summary) {
      S.log.unshift({ ts: nowIso(), actorName: FBL.user ? FBL.user.name : '', actorUid: FBL.user ? FBL.user.uid : '', action: action, target: target, summary: summary || '' });
      S.log = S.log.slice(0, 500);
    }

    FBL.loadTeam = async function () { team = sortTeam(S.team.map(function (t) { return Object.assign({}, t); })); return team.slice(); };
    let authCb = null;
    FBL.onAuth = function (cb) {
      authCb = cb;
      const uid = sessionStorage.getItem('ltr_demo_uid');
      const m = uid && S.team.find(function (t) { return t.uid === uid; });
      if (m) { FBL.user = { uid: m.uid, name: m.name, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin }; cb(FBL.user); }
      else cb(null);
    };
    FBL.login = async function (name, password) {
      const m = S.team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้ในระบบ');
      if (m.pw !== await hash(password)) throw new Error('รหัสผ่านไม่ถูกต้อง');
      sessionStorage.setItem('ltr_demo_uid', m.uid);
      FBL.user = { uid: m.uid, name: m.name, isOwner: !!m.isOwner, isAdmin: !!m.isAdmin };
      if (authCb) authCb(FBL.user);
    };
    FBL.logout = async function () { sessionStorage.removeItem('ltr_demo_uid'); FBL.user = null; FBL.stopAll(); };
    FBL.bootstrapOwner = async function (name, password) {
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      if (S.team.length) throw new Error('ตั้งเจ้าของระบบไปแล้ว');
      const m = { uid: 'u-' + randomId(8), name: name, isOwner: true, isAdmin: false, pw: await hash(password), createdAt: nowIso() };
      S.team.push(m); persist();
      sessionStorage.setItem('ltr_demo_uid', m.uid);
      FBL.user = { uid: m.uid, name: name, isOwner: true, isAdmin: false };
      team = [Object.assign({}, m)];
      return FBL.user;
    };
    FBL.addMember = async function (name, password, isAdmin) {
      requireOwner();
      name = String(name || '').trim();
      if (!name) throw new Error('กรอกชื่อ-นามสกุลก่อน');
      if (S.team.some(function (t) { return t.name === name; })) throw new Error('มีชื่อนี้อยู่แล้ว');
      S.team.push({ uid: 'u-' + randomId(8), name: name, isOwner: false, isAdmin: !!isAdmin, pw: await hash(password), createdAt: nowIso() });
      persist(); await FBL.loadTeam();
    };
    FBL.removeMember = async function (name) {
      requireOwner();
      const m = S.team.find(function (t) { return t.name === name; });
      if (m && m.isOwner) throw new Error('ลบเจ้าของระบบไม่ได้');
      S.team = S.team.filter(function (t) { return t.name !== name; }); persist(); await FBL.loadTeam();
    };
    FBL.setMemberAdmin = async function (name, makeAdmin) {
      requireOwner();
      const m = S.team.find(function (t) { return t.name === name; });
      if (m) { m.isAdmin = !!makeAdmin; persist(); await FBL.loadTeam(); }
    };
    FBL.resetMemberPassword = async function (name, pw) {
      requireOwner();
      const m = S.team.find(function (t) { return t.name === name; });
      if (!m) throw new Error('ไม่พบชื่อนี้');
      m.pw = await hash(pw); persist();
    };
    FBL.changeMyPassword = async function (pw) {
      const m = S.team.find(function (t) { return FBL.user && t.uid === FBL.user.uid; });
      if (m) { m.pw = await hash(pw); persist(); }
    };

    FBL.watch = function (col, onChange) {
      listeners[col] = listeners[col] || [];
      if (onChange && listeners[col].indexOf(onChange) < 0) listeners[col].push(onChange);
      return Promise.resolve(list(col));
    };
    FBL.stopAll = function () { Object.keys(listeners).forEach(function (k) { delete listeners[k]; }); };

    FBL.save = async function (col, rec, summary) {
      if (COLS.indexOf(col) < 0) throw new Error('ไม่รู้จักชุดข้อมูล ' + col);
      const isNew = !rec.id; const id = rec.id || FBL.newId();
      S.cols[col] = S.cols[col] || {};
      S.cols[col][id] = clean(stamp(Object.assign({}, rec, { id: id }), isNew));
      log(isNew ? 'add' : 'update', colName(col) + '/' + id, summary); persist(); emit(col);
      return id;
    };
    FBL.softDelete = async function (col, id, summary) {
      const r = S.cols[col] && S.cols[col][id];
      if (r) { r.deletedAt = nowIso(); r.deletedBy = FBL.user ? FBL.user.name : ''; log('delete', colName(col) + '/' + id, summary); persist(); emit(col); }
    };
    FBL.restore = async function (col, id) {
      const r = S.cols[col] && S.cols[col][id];
      if (r) { r.deletedAt = null; r.deletedBy = ''; log('restore', colName(col) + '/' + id, ''); persist(); emit(col); }
    };
    FBL.hardDelete = async function (col, id, summary) {
      requirePrivileged();
      if (S.cols[col]) { delete S.cols[col][id]; log('permanentDelete', colName(col) + '/' + id, summary); persist(); emit(col); }
    };
    FBL.loadLog = async function (limit) { requirePrivileged(); return S.log.slice(0, limit || 200); };

    /* ---------- ไฟล์ใน IndexedDB ---------- */
    let dbp = null;
    function idb() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        const rq = indexedDB.open('ltr_demo_files', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('files'); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { reject(rq.error); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return idb().then(function (d) {
        return new Promise(function (resolve, reject) {
          const t = d.transaction('files', mode); const st = t.objectStore('files');
          const rq = fn(st);
          t.oncomplete = function () { resolve(rq && rq.result); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
    FBL.fileStore = 'browser';
    FBL.maxFileBytes = 10 * 1024 * 1024;
    FBL.uploadFile = async function (path, blob, onProgress) {
      if (blob.size > FBL.maxFileBytes) throw new Error('ไฟล์ใหญ่เกิน 10 MB — ลดความละเอียดการสแกน (200 dpi ขาวดำก็พอ) แล้วลองใหม่');
      await tx('readwrite', function (st) { return st.put(blob, path); });
      if (onProgress) onProgress(1);
      return path;
    };
    FBL.fileBlob = async function (path) {
      if (!path) return null;
      return (await tx('readonly', function (st) { return st.get(path); })) || null;
    };
    FBL.deleteFile = async function (path) { await tx('readwrite', function (st) { return st.delete(path); }); };
    FBL.resetDemo = function () {
      localStorage.removeItem(KEY); sessionStorage.removeItem('ltr_demo_uid');
      try { indexedDB.deleteDatabase('ltr_demo_files'); } catch (e) { /* ข้าม */ }
    };
  }
})();
