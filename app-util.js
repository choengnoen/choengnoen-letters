/* ==========================================================================
   app-util.js — ตัวช่วยทั่วไป: วันที่ พ.ศ., เลขไทย, อ่านข้อความหนังสือราชการแบบไม่ใช้ AI
   ========================================================================== */
(function () {
  'use strict';
  const U = window.U = {};

  U.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------------- เลขไทย ---------------- */
  const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
  U.toThaiDigits = function (s) { return String(s).replace(/[0-9]/g, function (d) { return TH_DIGITS[+d]; }); };
  U.toArabic = function (s) { return String(s || '').replace(/[๐-๙]/g, function (d) { return String(TH_DIGITS.indexOf(d)); }); };

  /* ---------------- วันที่ ---------------- */
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  U.MONTHS = MONTHS; U.MONTHS_S = MONTHS_S;
  U.today = function () {
    const d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  };
  U.parseIso = function (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  // style: 'long' = 27 กันยายน 2569 · 'short' = 27 ก.ย. 69 · 'shortFull' = 27 ก.ย. 2569
  U.thDate = function (iso, style, thaiDigits) {
    const d = U.parseIso(iso); if (!d) return '';
    const y = d.getFullYear() + 543;
    let s;
    if (style === 'short') s = d.getDate() + ' ' + MONTHS_S[d.getMonth()] + ' ' + String(y).slice(-2);
    else if (style === 'shortFull') s = d.getDate() + ' ' + MONTHS_S[d.getMonth()] + ' ' + y;
    else s = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + y;
    return thaiDigits ? U.toThaiDigits(s) : s;
  };
  U.daysBetween = function (fromIso, toIso) {
    const a = U.parseIso(fromIso), b = U.parseIso(toIso);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  };
  U.addDays = function (iso, n) {
    const d = U.parseIso(iso); if (!d) return '';
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  };
  // "27 กันยายน 2569" / "27 ก.ย. 69" / "๒๗ ก.ย. ๒๕๖๙" → 2026-09-27
  U.parseThaiDate = function (txt) {
    const s = U.toArabic(txt || '').replace(/\s+/g, ' ');
    const full = MONTHS.join('|');
    const abbr = MONTHS_S.map(function (m) { return m.replace(/\./g, '\\.?\\s?'); }).join('|');
    const re = new RegExp('(\\d{1,2})\\s*(' + full + '|' + abbr + ')\\s*(?:พ\\.ศ\\.\\s*)?(\\d{2,4})');
    const m = re.exec(s);
    if (!m) return '';
    let mi = MONTHS.indexOf(m[2]);
    if (mi < 0) {
      const key = m[2].replace(/[\s.]/g, '');
      mi = MONTHS_S.findIndex(function (x) { return x.replace(/\./g, '') === key; });
    }
    if (mi < 0) return '';
    let y = +m[3];
    if (y < 100) y += 2500;
    if (y > 2400) y -= 543;
    const d = +m[1];
    if (d < 1 || d > 31) return '';
    return y + '-' + ('0' + (mi + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
  };

  /* ---------------- อ่านหนังสือราชการจากข้อความ (ไม่ใช้ AI) ----------------
     ใช้กับ PDF ที่มีข้อความ (ไม่ใช่ภาพสแกน) หรือข้อความที่ได้จาก OCR
     ได้ผลดีกับหนังสือภายนอก/บันทึกข้อความตามระเบียบงานสารบรรณ */
  function firstMatch(re, s) { const m = re.exec(s); return m ? m[1].trim() : ''; }
  function lineAfter(label, s) {
    const re = new RegExp('(?:^|\\n)\\s*' + label + '\\s*[:：]?\\s*([^\\n]+)');
    return firstMatch(re, s);
  }
  U.parseLetterText = function (raw) {
    const s = U.toArabic(String(raw || '')).replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    const out = {};
    out.docNo = firstMatch(/ที่\s*((?:[ก-ฮ]{1,4}\.?\s?){1,3}\s?[\d.]+\s*\/\s*(?:ว\s?)?[\d.]+)/, s);
    out.subject = lineAfter('เรื่อง', s);
    out.to = lineAfter('เรียน', s);
    out.refs = lineAfter('อ้างถึง', s);
    out.attachments = lineAfter('สิ่งที่ส่งมาด้วย', s);
    const head = s.slice(0, 900);
    out.docDate = U.parseThaiDate((/(?:วันที่|ลงวันที่)?\s*\d{1,2}\s*[ก-๙.]+\s*(?:พ\.ศ\.\s*)?\d{4}/.exec(head) || [''])[0]);
    out.urgency = /ด่วนที่สุด/.test(s) ? 'ด่วนที่สุด' : (/ด่วนมาก/.test(s) ? 'ด่วนมาก' : (/(^|\s)ด่วน(\s|$)/.test(head) ? 'ด่วน' : 'ปกติ'));
    out.secrecy = /ลับที่สุด/.test(head) ? 'ลับที่สุด' : (/ลับมาก/.test(head) ? 'ลับมาก' : (/(^|\s)ลับ(\s|$)/.test(head) ? 'ลับ' : ''));
    // ผู้ส่ง: ส่วนราชการ (บันทึกข้อความ) หรือบรรทัดชื่อหน่วยงานหลัง "ที่"
    out.from = lineAfter('ส่วนราชการ', s) || firstMatch(/\n\s*((?:กรม|แขวง|สำนัก|กอง|สำนักงาน|ศูนย์|จังหวัด|อำเภอ|เทศบาล|องค์การ)[^\n]{2,60})/, s);
    // กำหนดส่ง: "ภายในวันที่ 30 กันยายน 2569"
    const dl = /ภายใน(?:วันที่)?\s*(\d{1,2}\s*[ก-๙.]+\s*(?:พ\.ศ\.\s*)?\d{2,4})/.exec(s);
    out.deadline = dl ? U.parseThaiDate(dl[1]) : '';
    // ย่อหน้าก่อน "จึงเรียนมา" มักเป็นสิ่งที่ขอให้ทำ
    // ประโยค "ขอให้ ..." ช่วงท้ายเนื้อความ (ก่อน "จึงเรียนมา") = สิ่งที่ต้องทำ
    const body = s.split(/จึงเรียนมา/)[0].replace(/\s*\n\s*/g, ' ');
    const tail = body.slice(-1500);
    const reAsk = /(?:ขอความร่วมมือ(?:ให้)?|ขอความอนุเคราะห์(?:ให้)?|ขอให้)\s*/g;
    let mAsk, last = null;
    while ((mAsk = reAsk.exec(tail))) last = mAsk;
    if (last) {
      const rest = tail.slice(last.index + last[0].length);
      const cut = rest.search(/\s*(?:ภายใน|โดยด่วน|ทั้งนี้)/);
      out.request = (cut > 0 ? rest.slice(0, cut) : rest).slice(0, 220).trim();
    } else out.request = '';
    const lastPara = body.slice(Math.max(0, body.lastIndexOf('ด้วย') >= 0 ? body.lastIndexOf('ด้วย') : body.length - 400)).trim();
    out.summary = [out.subject, lastPara].filter(Boolean).join(' — ').slice(0, 600);
    out.type = U.classify(s);
    return out;
  };
  // จำแนกประเภทหนังสือด้วยคำสำคัญ (ใช้แนะนำแนวทางเกษียณ)
  U.classify = function (s) {
    const T = window.LTR_DATA.TYPES;
    let best = 'other', score = 0;
    Object.keys(T).forEach(function (k) {
      const n = (T[k].kw || []).reduce(function (a, w) { return a + (s.indexOf(w) >= 0 ? 1 : 0); }, 0);
      if (n > score) { score = n; best = k; }
    });
    return best;
  };

  /* ---------------- ลิงก์ ---------------- */
  U.findUrls = function (text) {
    const s = String(text || '').replace(/\s*\n\s*/g, '\n');
    const re = /\b((?:https?:\/\/|www\.)[^\s<>"'()฀-๿]+|(?:bit\.ly|tinyurl\.com|shorturl\.at|forms\.gle|goo\.gl|t\.ly|cutt\.ly|rb\.gy)\/[A-Za-z0-9_\-/]+)/g;
    const out = []; let m;
    while ((m = re.exec(s))) out.push(m[1].replace(/[.,;:]+$/, ''));
    return out;
  };
  const SHORTENERS = ['bit.ly', 'tinyurl.com', 'shorturl.at', 'goo.gl', 't.ly', 'cutt.ly', 'rb.gy', 'is.gd', 'ow.ly', 'shorturl.asia', 'tiny.cc'];
  // ประเมินความน่าเชื่อถือของลิงก์แบบเบื้องต้น (ไม่ได้เปิดลิงก์จริง)
  U.linkInfo = function (raw) {
    let url = String(raw || '').trim();
    const info = { raw: url, url: '', host: '', level: 'bad', note: '' };
    if (!/^[a-z]+:\/\//i.test(url)) {
      if (/^www\.|^[a-z0-9-]+\.[a-z]{2,}/i.test(url)) url = 'https://' + url;
      else { info.note = 'ไม่ใช่ลิงก์เว็บ (เป็นข้อความ)'; info.level = 'text'; return info; }
    }
    let u;
    try { u = new URL(url); } catch (e) { info.note = 'รูปแบบลิงก์ไม่ถูกต้อง'; return info; }
    if (!/^https?:$/.test(u.protocol)) { info.note = 'ไม่ใช่ลิงก์เว็บ (' + u.protocol + ')'; return info; }
    info.url = u.href; info.host = u.hostname.toLowerCase();
    const h = info.host;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { info.level = 'bad'; info.note = 'เป็นเลข IP ไม่ใช่ชื่อเว็บ — ระวัง'; }
    else if (/\.go\.th$|\.mi\.th$|\.ac\.th$|\.or\.th$/.test(h)) { info.level = 'ok'; info.note = 'โดเมนหน่วยงาน/สถาบันในประเทศไทย'; }
    else if (/(^|\.)(google\.com|docs\.google\.com|drive\.google\.com|forms\.gle|youtube\.com|youtu\.be|line\.me|facebook\.com|microsoft\.com|office\.com|sharepoint\.com|onedrive\.live\.com)$/.test(h)) { info.level = 'info'; info.note = 'บริการสาธารณะ (Google/LINE ฯลฯ) — ตรวจว่าใครเป็นเจ้าของไฟล์/แบบฟอร์ม'; }
    else if (SHORTENERS.indexOf(h) >= 0) { info.level = 'warn'; info.note = 'ลิงก์ย่อ มองไม่เห็นปลายทาง — เปิดด้วยความระวัง'; }
    else { info.level = 'warn'; info.note = 'โดเมนทั่วไป — ตรวจชื่อเว็บให้ตรงกับหน่วยงานผู้ส่ง'; }
    if (u.protocol === 'http:') info.note += ' · ไม่เข้ารหัส (http)';
    if (/xn--/.test(h)) { info.level = 'bad'; info.note = 'ชื่อโดเมนมีอักษรพิเศษปลอมแปลงได้ (xn--) — ระวัง'; }
    return info;
  };

  /* ---------------- อื่นๆ ---------------- */
  U.fmtBytes = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  U.blobToBase64 = function (blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  };
  U.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-src="' + src + '"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.dataset.src = src;
      s.onload = function () { resolve(); }; s.onerror = function () { reject(new Error('โหลดไม่สำเร็จ: ' + src)); };
      document.head.appendChild(s);
    });
  };
  U.lsGet = function (k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };
  U.lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ข้าม */ } };
})();
