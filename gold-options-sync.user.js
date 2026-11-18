// ==UserScript==
// @name         Gold Options Sync (TradingView → gold-analysis)
// @namespace    https://suphawatsr67work-bit.github.io/gold-analysis/
// @version      1.0
// @description  อ่านตาราง Options Chain (Volume/OI รายสไตรก์) จากหน้า TradingView ที่เปิดอยู่ แล้วส่งให้เว็บ gold-analysis อัปเดตอัตโนมัติ
// @match        https://*.tradingview.com/options/*
// @match        https://suphawatsr67work-bit.github.io/gold-analysis/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';
  const KEY = 'goldOptRows';
  const EVERY_MS = 20000;            // อ่านหน้า TradingView ทุก 20 วินาที
  const onTV = /tradingview\.com$/.test(location.hostname);

  /* ---------- ฝั่ง TradingView: อ่านตาราง ---------- */
  // อ่านเหมือนสคริปต์ copy เดิมของเว็บ: แถวที่มี >= 11 ช่อง, คอลัมน์ 8 = strike, 6 = Call Vol, 10 = Put Vol, 7 = Call OI, 9 = Put OI
  function readRows() {
    const n = (r, i) => {
      const t = r.children[i].innerText.split('\n')[0].replace(/[,\s]/g, '');
      return /^\d+$/.test(t) ? +t : 0;
    };
    return [...document.querySelectorAll('tr')]
      .filter(r => r.children.length >= 11 && /^[\d,]{4,6}$/.test(r.children[8].innerText.trim()))
      .map(r => [n(r, 8), n(r, 6), n(r, 10), n(r, 7), n(r, 9)]);
  }

  function badge(text, ok) {
    let b = document.getElementById('gos-badge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'gos-badge';
      b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483647;padding:5px 10px;border-radius:8px;font:12px/1.4 system-ui,sans-serif;color:#fff;opacity:.9;pointer-events:none';
      document.documentElement.appendChild(b);
    }
    b.style.background = ok ? '#1a7f4b' : '#8a5a00';
    b.textContent = text;
  }

  if (onTV) {
    let last = '';
    const tick = () => {
      let rows = [];
      try { rows = readRows(); } catch (e) {}
      if (rows.length < 3) {
        badge('Gold Sync: ยังอ่านตารางไม่ได้ — เปิดหน้า Options Chain ของ GC1! ให้ตารางโหลดครบ', false);
        return;
      }
      const j = JSON.stringify(rows);
      const hhmm = new Date().toTimeString().slice(0, 5);
      if (j !== last) {
        last = j;
        GM_setValue(KEY, { t: Date.now(), rows });
      }
      badge('Gold Sync: ส่งข้อมูล ' + rows.length + ' สไตรก์ · ตรวจล่าสุด ' + hhmm, true);
    };
    tick();
    setInterval(tick, EVERY_MS);
    return;
  }

  /* ---------- ฝั่งเว็บ gold-analysis: รับข้อมูล ---------- */
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  let applied = '';
  const apply = (v) => {
    if (!v || !v.rows || !w.__applyOpt) return;
    const sig = v.t + ':' + v.rows.length;
    if (sig === applied) return;
    applied = sig;
    try { w.__applyOpt(JSON.parse(JSON.stringify(v.rows)), v.t); } catch (e) {}
  };
  const boot = () => apply(GM_getValue(KEY, null));
  // รอให้เว็บโหลดฟังก์ชันรับข้อมูลก่อน
  let tries = 0;
  const wait = setInterval(() => {
    if (w.__applyOpt || ++tries > 40) { clearInterval(wait); boot(); }
  }, 500);
  GM_addValueChangeListener(KEY, (name, oldV, newV) => apply(newV));
})();
