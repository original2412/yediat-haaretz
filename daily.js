'use strict';
// אתגר יומי: 20 מקומות זהים לכל השחקנים בכל יום (נבחרים לפי התאריך), ניסיון אחד ביום.
// ניקוד: עד 100 לשאלה לפי המרחק → מקסימום 2,000.
const Daily = (function () {
  const N = 20;
  const QUOTA = { streams: 8, spots: 7, mountains: 5 };

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const pretty = d => d.split('-').reverse().slice(0, 2).join('.');
  // מחולל אקראי קבוע לפי מחרוזת (כל המכשירים מקבלים אותם מקומות באותו יום)
  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const sshuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function itemsFor(date) {
    const r = rng('yh-daily-' + date);
    const byName = (a, b) => a.name.localeCompare(b.name, 'he');
    let picked = [];
    for (const [cat, n] of Object.entries(QUOTA))
      picked = picked.concat(sshuffle(ITEMS.filter(it => it.trip && it.cat === cat).sort(byName), r).slice(0, n));
    return sshuffle(picked, r).slice(0, N);
  }

  let st;
  const load = () => {
    try { st = JSON.parse(localStorage.getItem('yh-daily') || 'null'); } catch (e) { st = null; }
    if (!st || st.date !== today()) st = { date: today(), res: [] };
  };
  const save = () => { try { localStorage.setItem('yh-daily', JSON.stringify(st)); } catch (e) {} };
  const total = () => st.res.reduce((a, r) => a + r.pts, 0);
  const square = p => p >= 70 ? '🟩' : p >= 30 ? '🟨' : '🟥';

  function show() {
    load();
    const items = itemsFor(st.date);
    $('#listmode').hidden = true;
    if (st.res.length >= items.length) return summary(items);
    const it = items[st.res.length];
    $('#q').innerHTML = `<span class="dtag">🏆 אתגר יומי ${pretty(st.date)} · ${st.res.length + 1}/${items.length} · ⭐ ${total()}</span>` + askHtml(it);
    map.setView([31.4, 35.0], 7);
    onMapClick = ll => {
      onMapClick = null;
      const { km, ok } = judge(it, ll);
      const pts = pointsFor(km);
      st.res.push({ id: it.id, km: Math.round(km * 10) / 10, pts }); save();
      record('d:' + it.id, ok, pts);
      $('#fb').innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'נכון!' : 'לא מדויק'}</span> ${km || !it.feat ? `מרחק: ${km.toFixed(1)} ק"מ` : 'בתוך האזור'} · <b>+${pts} נק'</b><br>${anchorText(it) ? anchorText(it) + '<br>' : ''}${infoHtml(it)}`;
      const b = document.createElement('button');
      b.className = 'dnext';
      b.textContent = st.res.length >= items.length ? 'לתוצאה ←' : 'הבא ←';
      b.onclick = () => { reset(); show(); };
      $('#choices').appendChild(b);
      if (st.res.length >= items.length && window.Leaderboard) window.Leaderboard.submit(st.date, total(), st.res.map(r => r.pts));
    };
  }

  function shareText() {
    const grid = st.res.map(r => square(r.pts)).join('').replace(/(.{10})/gu, '$1\n');
    return `ידיעת הארץ 🏆 אתגר יומי ${pretty(st.date)}\n⭐ ${total()}/${N * 100}\n${grid.trim()}\n${location.origin + location.pathname}`;
  }

  function summary(items) {
    overlay.clearLayers();
    const byId = Object.fromEntries(items.map(it => [it.id, it]));
    st.res.forEach(r => { const it = byId[r.id]; if (it) drawItem(it, r.pts >= 70 ? '#2ecc71' : r.pts >= 30 ? '#ffb400' : '#ff5c5c', false); });
    map.setView([31.4, 35.0], 7);
    const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
    const h = Math.floor((tomorrow - Date.now()) / 36e5), m = Math.floor((tomorrow - Date.now()) / 6e4) % 60;
    $('#q').innerHTML = `🏆 אתגר יומי ${pretty(st.date)} — ⭐ ${total()} מתוך ${N * 100}<small>אתגר חדש בעוד ${h}:${String(m).padStart(2, '0')} שעות</small>`;
    $('#fb').innerHTML = `<div class="dgrid">${st.res.map(r => square(r.pts)).join('')}</div>
      <ol class="dlist">${st.res.map(r => `<li>${square(r.pts)} ${byId[r.id] ? byId[r.id].name : r.id} <span>${r.km + ' ק"מ'} · ${r.pts}</span></li>`).join('')}</ol>
      <div id="lb"></div>`;
    const b = document.createElement('button');
    b.className = 'dnext'; b.textContent = '📤 שתף תוצאה';
    b.onclick = async () => {
      const text = shareText();
      try { if (navigator.share) return await navigator.share({ text }); } catch (e) { return; }
      location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
    };
    $('#choices').appendChild(b);
    if (window.Leaderboard) window.Leaderboard.render($('#lb'), st.date);
  }

  return { show, itemsFor, today };
})();
