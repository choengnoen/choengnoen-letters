/* ==========================================================================
   app-endorse.js — จัดหน้าข้อความเกษียณ + พิมพ์ลงต้นฉบับให้ตรงตำแหน่ง
     - จัดบรรทัดเอง (ตัดคำภาษาไทยด้วย Intl.Segmenter) → ตัวอย่างบนจอกับที่พิมพ์ออกมาตรงกันทุกบรรทัด
     - พิมพ์ด้วยหน่วยมิลลิเมตรจริง (@page ขอบ 0) + ชดเชยค่าคลาดเคลื่อนของเครื่องพิมพ์ (ปรับเทียบ)
     - 3 แบบพิมพ์: ลงต้นฉบับ (ข้อความอย่างเดียว) / ทดสอบบนกระดาษเปล่า (มีภาพต้นฉบับจาง) / ใบแนบเกษียณต่อ
   ========================================================================== */
(function () {
  'use strict';
  const EN = window.EN = {};
  const D = window.LTR_DATA;
  const PT_MM = 25.4 / 72;           // 1 pt = 0.3528 มม.
  const PX_MM = 96 / 25.4;           // CSS px ต่อ มม.

  /* ---------------- แบบอักษร ---------------- */
  const fontOk = {};
  // ตรวจว่าเครื่องนี้ติดตั้งแบบอักษรนั้นหรือไม่ (วัดความกว้างเทียบกับแบบอักษรสำรอง)
  EN.fontInstalled = function (key) {
    if (key in fontOk) return fontOk[key];
    const f = D.FONTS.find(function (x) { return x.key === key; });
    if (!f || f.key.indexOf('เว็บ') >= 0) return (fontOk[key] = true);
    const c = document.createElement('canvas').getContext('2d');
    const t = 'กขคงจฉ ทราบ ดำเนินการ 0123';
    c.font = '40px monospace'; const a = c.measureText(t).width;
    c.font = '40px ' + f.css + ', monospace'; const b = c.measureText(t).width;
    return (fontOk[key] = Math.abs(a - b) > 1);
  };
  EN.pickFont = function (key) {
    let f = D.FONTS.find(function (x) { return x.key === key; }) || D.FONTS[0];
    if (!EN.fontInstalled(f.key)) f = D.FONTS.find(function (x) { return EN.fontInstalled(x.key); }) || D.FONTS[D.FONTS.length - 1];
    return f;
  };

  /* ---------------- เติมข้อความตัวแทน ---------------- */
  EN.fill = function (text, v) {
    return String(text || '').replace(/\{([^}]+)\}/g, function (m, k) {
      return (v[k] !== undefined && v[k] !== '') ? v[k] : '........';
    });
  };

  /* ---------------- จัดบรรทัด ----------------
     e: { text, wMm, pt, lineF, fontKey, sig: { show, name, pos, date } }
     คืนค่า { lines: [{ t, x, y, w, center }], wMm, hMm, lineMm, font } (หน่วย มม. นับจากมุมซ้ายบนของกรอบ) */
  const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const mctx = document.createElement('canvas').getContext('2d');
  function measure(t) { return mctx.measureText(t).width / PX_MM; }
  EN.layout = function (e) {
    const font = EN.pickFont(e.fontKey);
    const pt = (e.pt || 16) * font.scale;
    const lineMm = pt * PT_MM * (e.lineF || 1.15);
    mctx.font = pt + 'pt ' + font.css + ', Sarabun, sans-serif';
    const W = e.wMm || 85;
    const lines = [];
    let y = 0;
    String(e.text || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      const lead = /^[ \t　]*/.exec(raw)[0].replace(/\t/g, '     ').length;
      const indent = Math.min(W * 0.5, lead * 2);   // เว้นวรรคหน้าบรรทัด 1 ช่อง = 2 มม. (5 ช่อง = 1 ซม.)
      const body = raw.trim();
      if (!body) { y += lineMm; return; }
      const words = seg ? Array.from(seg.segment(body), function (s) { return s.segment; }) : body.split(/(?=\s)/);
      let cur = '', x0 = indent;
      words.forEach(function (w) {
        const test = cur + w;
        if (cur && measure(test) > W - x0) {
          lines.push({ t: cur.replace(/\s+$/, ''), x: x0, y: y });
          y += lineMm; cur = w.replace(/^\s+/, ''); x0 = indent;
        } else cur = test;
      });
      if (cur) { lines.push({ t: cur.replace(/\s+$/, ''), x: x0, y: y }); y += lineMm; }
    });
    // ส่วนลงนาม: เว้นที่ลายมือชื่อ แล้ว (ชื่อ) / ตำแหน่ง / วันที่ — จัดกึ่งกลางค่อนขวาของกรอบ
    if (e.sig && e.sig.show) {
      const cx = W * 0.58;
      y += lineMm * 1.6;                       // ที่ว่างสำหรับเซ็นชื่อ
      [e.sig.name ? '(' + e.sig.name + ')' : '', e.sig.pos || '', e.sig.date || ''].forEach(function (t) {
        if (!t) return;
        const w = measure(t);
        lines.push({ t: t, x: Math.max(0, Math.min(W - w, cx - w / 2)), y: y, center: true });
        y += lineMm;
      });
    }
    lines.forEach(function (l) { l.w = measure(l.t); });
    const maxW = lines.reduce(function (a, l) { return Math.max(a, l.x + l.w); }, 0);
    return { lines: lines, wMm: Math.max(W, maxW), hMm: y, lineMm: lineMm, pt: pt, font: font, sigY: e.sig && e.sig.show ? lines.length : -1 };
  };

  /* ---------------- วาดตัวอย่างบนภาพหน้า (canvas) ----------------
     s = จำนวนพิกเซลต่อ มม. ของภาพที่แสดง */
  EN.draw = function (ctx, L, xMm, yMm, s, opt) {
    opt = opt || {};
    ctx.save();
    if (opt.box !== false) {
      ctx.fillStyle = opt.fill || 'rgba(31,95,191,.07)';
      ctx.fillRect(xMm * s - 2, yMm * s - 2, L.wMm * s + 4, L.hMm * s + 4);
      ctx.lineWidth = 1.5; ctx.setLineDash(opt.dash || []);
      ctx.strokeStyle = opt.stroke || '#1f5fbf';
      ctx.strokeRect(xMm * s - 2, yMm * s - 2, L.wMm * s + 4, L.hMm * s + 4);
    }
    ctx.fillStyle = opt.color || '#0b2a8a';
    ctx.textBaseline = 'middle';
    ctx.font = (L.pt * PT_MM * s) + 'px ' + L.font.css + ', Sarabun, sans-serif';
    L.lines.forEach(function (l) { ctx.fillText(l.t, (xMm + l.x) * s, (yMm + l.y + L.lineMm / 2) * s); });
    ctx.restore();
  };

  /* ---------------- เครื่องพิมพ์ (ค่าปรับเทียบเก็บต่อเครื่องคอมพิวเตอร์) ----------------
     สูตร: ตำแหน่งจริงบนกระดาษ = sx × ตำแหน่งที่สั่ง + dx  →  สั่งพิมพ์ที่ (เป้าหมาย − dx) / sx */
  EN.printerCfg = function () { return U.lsGet('ltr_printer', { name: '', dx: 0, dy: 0, sx: 1, sy: 1, feedNote: '', calibratedAt: '' }); };
  EN.setPrinterCfg = function (c) { U.lsSet('ltr_printer', c); };
  function toPrint(xMm, yMm) {
    const p = EN.printerCfg();
    return { x: (xMm - (p.dx || 0)) / (p.sx || 1), y: (yMm - (p.dy || 0)) / (p.sy || 1) };
  }
  EN.toPrint = toPrint;
  // ขอบที่เครื่องพิมพ์ทั่วไปพิมพ์ไม่ถึง (มม.)
  EN.SAFE_MARGIN = 5;

  /* ---------------- พิมพ์ ----------------
     mode: 'real' ลงต้นฉบับ / 'test' ทดสอบบนกระดาษเปล่า / 'sheet' ใบแนบเกษียณต่อ / 'calib' หน้าปรับเทียบ */
  function lineHtml(L, xMm, yMm, calibrate) {
    return L.lines.map(function (l) {
      const p = calibrate ? toPrint(xMm + l.x, yMm + l.y) : { x: xMm + l.x, y: yMm + l.y };
      return '<div class="pl" style="left:' + p.x.toFixed(2) + 'mm;top:' + p.y.toFixed(2) + 'mm;height:' + L.lineMm.toFixed(2) + 'mm;line-height:' + L.lineMm.toFixed(2) + 'mm;font-family:' +
        U.esc(L.font.css) + ',Sarabun,sans-serif;font-size:' + L.pt.toFixed(2) + 'pt">' + U.esc(l.t) + '</div>';
    }).join('');
  }
  function printHtml(pageW, pageH, inner, extraCss) {
    return '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>พิมพ์เกษียณ</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">' +
      '<style>@page{size:' + pageW + 'mm ' + pageH + 'mm;margin:0}html,body{margin:0;padding:0}' +
      '.sheet{position:relative;width:' + pageW + 'mm;height:' + pageH + 'mm;overflow:hidden;page-break-after:always}' +
      '.pl{position:absolute;white-space:pre;color:#000}' +
      '.bg{position:absolute;left:0;top:0;width:100%;height:100%;opacity:.33}' +
      '.box{position:absolute;border:.3mm dashed #1f5fbf}' +
      '.mk{position:absolute;width:8mm;height:8mm}.mk:before,.mk:after{content:"";position:absolute;background:#000}' +
      '.mk:before{left:0;right:0;top:50%;height:.2mm}.mk:after{top:0;bottom:0;left:50%;width:.2mm}' +
      '.note{position:absolute;font-family:Sarabun,sans-serif;font-size:9pt;color:#333}' +
      (extraCss || '') + '</style></head><body>' + inner +
      '<script>document.fonts.ready.then(function(){setTimeout(function(){window.focus();window.print();},250)});<\/script></body></html>';
  }
  // พิมพ์ผ่าน iframe ซ่อน (ไม่ต้องเปิดหน้าต่างใหม่ ไม่โดนตัวบล็อกป๊อปอัป)
  function sendToPrinter(html) {
    let f = document.getElementById('printFrame');
    if (f) f.remove();
    f = document.createElement('iframe');
    f.id = 'printFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    f.srcdoc = html;
  }

  EN.print = function (mode, o) {
    // o: { page, L, xMm, yMm, letter }
    const pw = o.page ? o.page.wMm : 210, ph = o.page ? o.page.hMm : 297;
    const W = +pw.toFixed(2), H = +ph.toFixed(2);
    if (mode === 'real') {
      sendToPrinter(printHtml(W, H, '<div class="sheet">' + lineHtml(o.L, o.xMm, o.yMm, true) + '</div>'));
    } else if (mode === 'test') {
      const bg = o.page.canvas.toDataURL('image/jpeg', 0.7);
      const b = toPrint(o.xMm, o.yMm);
      const marks = [[10, 10], [W - 18, 10], [10, H - 18], [W - 18, H - 18]].map(function (m) {
        const p = toPrint(m[0] + 4, m[1] + 4);
        return '<div class="mk" style="left:' + (p.x - 4) + 'mm;top:' + (p.y - 4) + 'mm"></div>';
      }).join('');
      const bgPos = toPrint(0, 0);
      sendToPrinter(printHtml(W, H, '<div class="sheet"><img class="bg" src="' + bg + '" style="left:' + bgPos.x + 'mm;top:' + bgPos.y + 'mm">' + marks +
        '<div class="box" style="left:' + (b.x - 1) + 'mm;top:' + (b.y - 1) + 'mm;width:' + (o.L.wMm / (EN.printerCfg().sx || 1) + 2) + 'mm;height:' + (o.L.hMm / (EN.printerCfg().sy || 1) + 2) + 'mm"></div>' +
        lineHtml(o.L, o.xMm, o.yMm, true) +
        '<div class="note" style="left:20mm;top:3mm">แผ่นทดสอบ — วางซ้อนต้นฉบับแล้วส่องกับแสงไฟ/หน้าต่าง ดูว่าข้อความ (สีดำ) ไม่ทับตัวหนังสือเดิม และกากบาทมุมทั้ง 4 ตรงกับขอบกระดาษ</div></div>'));
    } else if (mode === 'sheet') {
      const l = o.letter || {};
      const head = '<div class="note" style="left:20mm;top:15mm;font-size:14pt;font-weight:600">แผ่นเกษียณต่อ</div>' +
        '<div class="note" style="left:20mm;top:24mm;font-size:12pt;width:170mm;line-height:1.5">หนังสือที่ ' + U.esc(l.docNo || '........') +
        ' ลงวันที่ ' + U.esc(U.thDate(l.docDate) || '........') + '<br>เรื่อง ' + U.esc(l.subject || '........') +
        '<br>ทะเบียนรับเลขที่ ' + U.esc(l.regNo || '........') + ' รับวันที่ ' + U.esc(U.thDate(l.receivedDate) || '........') + '</div>' +
        '<div style="position:absolute;left:20mm;top:45mm;width:170mm;border-top:.3mm solid #000"></div>';
      sendToPrinter(printHtml(210, 297, '<div class="sheet">' + head + lineHtml(o.L, 25, 52, true) + '</div>'));
    } else if (mode === 'calib') {
      // หน้าปรับเทียบ: กากบาทที่ (20,20) และ (190,277) + ไม้บรรทัด
      let rul = '';
      for (let x = 0; x <= 200; x += 10) rul += '<div style="position:absolute;left:' + x + 'mm;top:0;width:.2mm;height:' + (x % 50 ? 4 : 8) + 'mm;background:#000"></div>' +
        (x % 50 ? '' : '<div class="note" style="left:' + (x + 1) + 'mm;top:8mm">' + x + '</div>');
      for (let y = 0; y <= 290; y += 10) rul += '<div style="position:absolute;top:' + y + 'mm;left:0;height:.2mm;width:' + (y % 50 ? 4 : 8) + 'mm;background:#000"></div>' +
        (y % 50 ? '' : '<div class="note" style="top:' + (y + 1) + 'mm;left:9mm">' + y + '</div>');
      const cross = function (x, y, lab) {
        return '<div style="position:absolute;left:' + (x - 10) + 'mm;top:' + y + 'mm;width:20mm;height:.2mm;background:#000"></div>' +
          '<div style="position:absolute;left:' + x + 'mm;top:' + (y - 10) + 'mm;width:.2mm;height:20mm;background:#000"></div>' +
          '<div class="note" style="left:' + (x + 2) + 'mm;top:' + (y + 1.5) + 'mm;font-size:11pt;font-weight:600">' + lab + '</div>';
      };
      const info = '<div class="note" style="left:35mm;top:40mm;width:140mm;font-size:12pt;line-height:1.6">' +
        '<b style="font-size:15pt">หน้าปรับเทียบเครื่องพิมพ์</b><br>' +
        '1) ใช้ไม้บรรทัดวัดจาก<b>ขอบซ้าย</b>และ<b>ขอบบน</b>ของกระดาษ ไปยังจุดตัดของกากบาท A และ B (หน่วย มม.)<br>' +
        '2) ค่าที่ถูกต้องคือ A = (20, 20) และ B = (190, 277) ถ้าวัดได้ต่างจากนี้ ให้กรอกค่าที่วัดได้ในหน้าเว็บ<br>' +
        '3) ก่อนพิมพ์ ให้ทำเครื่องหมาย ✗ ด้วยดินสอที่มุมบนซ้ายของกระดาษ แล้วใส่ถาดแบบเดียวกับที่จะใส่ต้นฉบับ ' +
        'ดูว่าแผ่นที่ออกมามี ✗ อยู่มุมเดียวกับลูกศร ▲ หรือไม่ → จำวิธีใส่กระดาษไว้ใช้กับต้นฉบับ</div>' +
        '<div class="note" style="left:95mm;top:100mm;font-size:30pt">▲</div><div class="note" style="left:78mm;top:115mm;font-size:12pt">ด้านนี้คือหัวกระดาษ (ด้านบน)</div>';
      sendToPrinter(printHtml(210, 297, '<div class="sheet">' + rul + cross(20, 20, 'A (20,20)') + cross(190, 277, 'B (190,277)') + info + '</div>'));
    }
  };
})();
