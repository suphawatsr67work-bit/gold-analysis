// ==UserScript==
// @name         Gold Options Sync (TradingView → gold-analysis)
// @namespace    https://suphawatsr67work-bit.github.io/gold-analysis/
// @version      1.1
// @updateURL    https://suphawatsr67work-bit.github.io/gold-analysis/gold-options-sync.user.js
// @downloadURL  https://suphawatsr67work-bit.github.io/gold-analysis/gold-options-sync.user.js
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
  // อ่านตารางตามชื่อหัวคอลัมน์ (ใช้สิทธิ/Strike, ปริมาณ/Volume, Open int) ไม่ผูกกับตำแหน่งคอลัมน์ตายตัว
  // และแยกกลุ่มตามวันหมดอายุ (แถวหัวกลุ่มที่มีคำว่า DTE เช่น "18 พฤศจิกายน 0 DTE G3W")
  const first = (el) => (el.innerText || '').split('\n')[0].trim();
  const num = (cell) => {
    const t = first(cell).replace(/[,\s]/g, '');
    return /^\d+$/.test(t) ? +t : 0;
  };
  let lastMap = '';
  function detectMap(trs) {
    for (const tr of trs) {
      const H = [...tr.children].map(first);
      const si = H.findIndex(t => /ใช้สิทธิ|^strike/i.test(t));
      if (si < 0 || H.length < 5) continue;
      const idx = (re) => H.map((t, i) => (re.test(t) ? i : -1)).filter(i => i >= 0);
      const vols = idx(/^ปริมาณ|^vol/i), ois = idx(/^open\s*int|^oi$/i);
      const m = {
        s: si,
        cv: vols.filter(i => i < si).pop(), pv: vols.find(i => i > si),
        co: ois.filter(i => i < si).pop(), po: ois.find(i => i > si),
      };
      if (m.cv !== undefined && m.pv !== undefined) return m;
    }
    return null;
  }
  function readGroups() {
    const trs = [...document.querySelectorAll('tr')];
    let m = detectMap(trs), how = 'หัวคอลัมน์';
    if (!m) { m = { s: 8, cv: 6, pv: 10, co: 7, po: 9 }; how = 'ตำแหน่งเดิม'; }
    lastMap = how + ' [strike@' + m.s + ' vol@' + m.cv + '/' + m.pv + ' OI@' + m.co + '/' + m.po + ']';
    const need = Math.max(m.s, m.cv, m.pv, m.co || 0, m.po || 0);
    const groups = [];
    let cur = null, label = '';
    for (const tr of trs) {
      const ch = tr.children;
      const isData = ch.length > need && /^[\d,]{4,6}$/.test((ch[m.s].innerText || '').trim());
      if (isData) {
        if (!cur) { cur = { label, rows: [] }; groups.push(cur); }
        cur.rows.push([num(ch[m.s]), num(ch[m.cv]), num(ch[m.pv]), m.co === undefined ? 0 : num(ch[m.co]), m.po === undefined ? 0 : num(ch[m.po])]);
      } else {
        const tx = (tr.innerText || '').replace(/\s+/g, ' ').trim();
        if (/\bDTE\b/i.test(tx) && tx.length < 80) { label = tx; cur = null; }
      }
    }
    return groups.filter(g => g.rows.length >= 3);
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
      let groups = [];
      try { groups = readGroups(); } catch (e) {}
      if (!groups.length) {
        badge('Gold Sync: ยังอ่านตารางไม่ได้ — ใช้แท็บ Chain และรอให้ตารางโหลดครบ', false);
        return;
      }
      const j = JSON.stringify(groups);
      const hhmm = new Date().toTimeString().slice(0, 5);
      if (j !== last) {
        last = j;
        GM_setValue(KEY, { t: Date.now(), groups });
      }
      badge('Gold Sync: ส่ง ' + groups.length + ' วันหมดอายุ (' + groups.map(g => g.rows.length).join('/') + ' สไตรก์) · ' + hhmm + ' · อ่านจาก' + lastMap, true);
    };
    tick();
    setInterval(tick, EVERY_MS);
    return;
  }

  /* ---------- ฝั่งเว็บ gold-analysis: รับข้อมูล ---------- */
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  let applied = '';
  const apply = (v) => {
    if (!v || !w.__applyOpt) return;
    const sig = v.t + ':' + (v.groups ? v.groups.length : v.rows && v.rows.length);
    if (sig === applied) return;
    applied = sig;
    try {
      if (v.groups && w.__applyOptGroups) w.__applyOptGroups(JSON.parse(JSON.stringify(v.groups)), v.t);
      else if (v.rows) w.__applyOpt(JSON.parse(JSON.stringify(v.rows)), v.t);
    } catch (e) {}
  };
  const boot = () => apply(GM_getValue(KEY, null));
  // รอให้เว็บโหลดฟังก์ชันรับข้อมูลก่อน
  let tries = 0;
  const wait = setInterval(() => {
    if (w.__applyOpt || ++tries > 40) { clearInterval(wait); boot(); }
  }, 500);
  GM_addValueChangeListener(KEY, (name, oldV, newV) => apply(newV));
})();
