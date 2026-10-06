'use strict';
const $ = s => document.querySelector(s);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const ll2pt = ([lat, lng]) => [lng, lat];

// ---------- נתונים ----------
const BUBBLES = window.IFL_DATA.bubbles.features;
const BUBBLE_BY_CODE = Object.fromEntries(BUBBLES.map(f => [f.properties.code, f.properties.name]));
const short = n => n.replace(/^בועת /, '');

function bubblesAtPoint(ll) {
  const pt = turf.point(ll2pt(ll));
  return BUBBLES.filter(f => turf.booleanPointInPolygon(pt, f)).map(f => f.properties.name);
}
function bubblesOnLine(lines) {
  const ls = turf.multiLineString(lines.map(l => l.map(ll2pt)));
  return BUBBLES.filter(f => turf.booleanIntersects(ls, f)).map(f => f.properties.name);
}
function zonesNear(ll, km) {
  const pt = turf.point(ll2pt(ll));
  return window.ZONES.filter(z => turf.distance(pt, turf.point(z.center)) <= km).map(z => z.name);
}

const P = window.PLACES;
const ITEMS = [];
window.STREAMS.forEach(s => ITEMS.push({
  id: 's:' + s.n, cat: 'streams', name: s.n, lines: s.lines, start: s.start, end: s.end, km: s.km,
  bubbles: bubblesOnLine(s.lines), startB: bubblesAtPoint(s.start), endB: bubblesAtPoint(s.end),
}));
P.mountains.forEach(m => ITEMS.push({ id: 'm:' + m.n, cat: 'mountains', name: m.n, p: m.p, bubbles: bubblesAtPoint(m.p) }));
const CORE = new Set(P.settlements.map(s => s[0]));
window.SETTLEMENTS.forEach(([n, lat, lng]) => ITEMS.push({
  id: 'y:' + n, cat: 'settlements', core: CORE.has(n), name: n, p: [lat, lng],
  bubbles: bubblesAtPoint([lat, lng]), zones: zonesNear([lat, lng], 4),
}));
window.ZONES.forEach(z => ITEMS.push({
  id: 'z:' + z.name, cat: 'zones', name: z.name, p: [z.center[1], z.center[0]],
  bubbles: z.bubbleCodes.map(c => BUBBLE_BY_CODE[c]).filter(Boolean), note: z.notes,
}));
const HATMARIM = window.HATMARIM.features.map(f => ({ ...f.properties, feat: f }));
const hatmarOf = ll => HATMARIM.find(h => turf.booleanPointInPolygon(turf.point(ll2pt(ll)), h.feat));
const ARAB_CITIES = new Set(HATMARIM.map(h => h.city));
ITEMS.forEach(it => { if (it.p && !['ירושלים', 'מעלה גלבוע'].includes(it.name)) it.hatmar = hatmarOf(it.p); });

const REGIONS = window.REGIONS.map(r => ({ ...r, feat: turf.polygon([[...r.poly, r.poly[0]].map(ll2pt)]) }));
const regionOf = ll => { const pt = turf.point(ll2pt(ll)); const r = REGIONS.find(r => turf.booleanPointInPolygon(pt, r.feat)); return r && r.n; };
REGIONS.forEach(r => ITEMS.push({ id: 'r:' + r.n, cat: 'regions', name: r.n, feat: r.feat, bubbles: [] }));
ITEMS.forEach(it => { if (it.p) it.region = regionOf(it.p); });

// מוצא ושפך במילים: ליד איזה יישוב/הר, באיזה אזור, ולאן הנחל נשפך.
const GAZ = ITEMS.filter(it => it.core || it.cat === 'mountains');
const MED_COAST = turf.lineString([[35.10,33.09],[35.07,32.92],[35.02,32.83],[34.96,32.82],[34.93,32.70],[34.89,32.50],[34.77,32.10],[34.63,31.80],[34.50,31.60],[34.22,31.32]]);
const EGYPT_BORDER = turf.lineString([[34.24, 31.32], [34.41, 30.87], [34.60, 30.30], [34.90, 29.49]]);
function inEgypt([lat, lng]) {
  const c = EGYPT_BORDER.geometry.coordinates;
  for (let i = 0; i < c.length - 1; i++) {
    const [x1, y1] = c[i], [x2, y2] = c[i + 1];
    if (lat <= y1 && lat >= y2) return lng < x1 + (x2 - x1) * (y1 - lat) / (y1 - y2) - 0.01;
  }
  return false;
}
function nearPlace(ll) {
  if (inEgypt(ll)) return 'סיני (מצרים)';
  const pt = turf.point(ll2pt(ll));
  let best = null, bd = 1e9;
  GAZ.forEach(g => { const d = turf.distance(pt, turf.point(ll2pt(g.p))); if (d < bd) { bd = d; best = g; } });
  const reg = regionOf(ll);
  const near = bd < 2 ? best.name : bd < 15 ? `ליד ${best.name}` : '';
  return [reg, near].filter(Boolean).join(', ') || 'לא ידוע';
}
function outlet(s) {
  const [lat, lng] = s.end, pt = turf.point(ll2pt(s.end));
  let best = null, bd = 0.5;
  window.STREAMS.forEach(o => {
    if (o.n === s.name) return;
    o.lines.forEach(l => { if (l.length < 2) return; const d = turf.pointToLineDistance(pt, turf.lineString(l.map(ll2pt))); if (d < bd) { bd = d; best = o.n; } });
  });
  if (best) return `נשפך ל${best}`;
  if (inEgypt(s.end)) return 'נשפך לסיני (מצרים)';
  const reg = regionOf(s.end);
  if (turf.pointToLineDistance(pt, MED_COAST) < 2.5) return 'נשפך לים התיכון';
  if (lat < 29.62) return 'נשפך למפרץ אילת';
  if (turf.distance(pt, turf.point([35.59, 32.82])) < 9) return 'נשפך לכנרת';
  if (reg === 'עמק החולה') return 'נשפך לנהר הירדן (בעמק החולה)';
  if (lat > 32.86 && lat < 33.05 && lng > 35.55 && lng < 35.66) return 'נשפך לנהר הירדן (צפונית לכנרת)';
  if (reg === 'ים המלח' || (lat > 31.0 && lat < 31.8 && lng > 35.30 && reg === 'מדבר יהודה')) return 'נשפך לים המלח';
  if (lat >= 31.8 && lat < 32.75 && lng > 35.5) return 'נשפך לנהר הירדן';
  if (lat < 31.0 && lng > 35.1) return 'נשפך לערבה (נחל ערבה)';
  return `מסתיים ${nearPlace(s.end)}`;
}
ITEMS.filter(it => it.cat === 'streams').forEach(it => {
  const note = window.STREAM_NOTES[it.name] || {};
  it.from = note.from || nearPlace(it.start);
  it.to = note.to || outlet(it);
  it.region = regionOf(it.start);
});

// ---------- סטטיסטיקה (חזרה מרווחת פשוטה) ----------
let stats = {};
try { stats = JSON.parse(localStorage.getItem('yh-stats') || '{}'); } catch (e) {}
function record(id, ok) {
  const s = stats[id] || (stats[id] = { c: 0, w: 0 });
  ok ? s.c++ : s.w++;
  try { localStorage.setItem('yh-stats', JSON.stringify(stats)); } catch (e) {}
  session.n++; if (ok) session.ok++;
  $('#score').textContent = `${session.ok}/${session.n}`;
}
const weight = id => { const s = stats[id]; return s ? Math.max(0.3, Math.min(4, 1 + 1.5 * s.w - s.c)) : 1.5; };
const recent = [];
function weighted(all) {
  let list = all.filter(it => !recent.includes(it.id));
  if (!list.length) list = all;
  if ($('#cat').value === 'all') {
    const cats = [...new Set(list.map(it => it.cat))];
    const c = pick(cats);
    list = list.filter(it => it.cat === c);
  }
  const it = weightedPick(list);
  recent.push(it.id); if (recent.length > Math.min(40, Math.floor(all.length / 2))) recent.shift();
  return it;
}
function weightedPick(list) {
  let r = Math.random() * list.reduce((a, it) => a + weight(it.id), 0);
  for (const it of list) { r -= weight(it.id); if (r <= 0) return it; }
  return list[list.length - 1];
}
const session = { n: 0, ok: 0 };

// ---------- מפה ----------
const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 7, maxZoom: 14 })
  .setView([31.6, 35.0], 8);
L.control.zoom({ position: 'topleft' }).addTo(map);
const BASES = {
  heli: L.tileLayer('https://flight-maps.com/tiles/il-hel/{z}/{x}/{y}.png', { maxNativeZoom: 12 }),
  silent: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png', { subdomains: 'abcd' }),
  sat: L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
};
let base = BASES.heli.addTo(map);
$('#base').onchange = e => { map.removeLayer(base); base = BASES[e.target.value].addTo(map); };

const bubbleLayer = L.geoJSON(window.IFL_DATA.bubbles, {
  style: { color: '#ff00c8', weight: 2, fill: false, dashArray: '6 4' },
  onEachFeature: (f, l) => l.bindTooltip(short(f.properties.name), { sticky: true }),
});
$('#showBubbles').onchange = e => e.target.checked ? bubbleLayer.addTo(map) : map.removeLayer(bubbleLayer);

const overlay = L.layerGroup().addTo(map);

function drawItem(it, color = '#00e0ff', fit = true) {
  if (it.feat) {
    const pg = L.geoJSON(it.feat, { style: { color, weight: 3, fillOpacity: .2 } }).addTo(overlay)
      .bindTooltip(it.name, { permanent: true, className: 'lbl' });
    if (fit) map.fitBounds(pg.getBounds(), { padding: [30, 30] });
  } else if (it.lines) {
    const pl = L.polyline(it.lines, { color, weight: 5, opacity: .9 }).addTo(overlay);
    L.circleMarker(it.start, { radius: 8, color: '#2ecc71', fillOpacity: 1 }).addTo(overlay)
      .bindTooltip('התחלה', { permanent: true, direction: 'top', className: 'lbl' });
    L.circleMarker(it.end, { radius: 8, color: '#ff5c5c', fillOpacity: 1 }).addTo(overlay)
      .bindTooltip('סוף', { permanent: true, direction: 'top', className: 'lbl' });
    pl.bindTooltip(it.name, { sticky: true, className: 'lbl' });
    if (fit) map.fitBounds(pl.getBounds(), { padding: [40, 40], maxZoom: 11 });
  } else {
    L.circleMarker(it.p, { radius: 9, color, weight: 3, fillOpacity: .6 }).addTo(overlay)
      .bindTooltip(it.name, { permanent: true, direction: 'top', className: 'lbl' });
    if (fit) map.setView(it.p, Math.max(map.getZoom(), 10));
  }
}
function drawHatmar(h, color = '#ffb400', fit = true) {
  const pg = L.geoJSON(h.feat, { style: { color, weight: 3, fillOpacity: .15 } }).addTo(overlay)
    .bindTooltip(h.n, { permanent: true, className: 'lbl' });
  if (fit) map.fitBounds(pg.getBounds(), { padding: [30, 30] });
}

function infoHtml(it) {
  const rows = [];
  if (it.lines) {
    rows.push(`<b>אורך:</b> כ-${it.km} ק"מ`);
    rows.push(`<b>מתחיל:</b> ${it.from}`);
    rows.push(`<b>מסתיים:</b> ${it.to}`);
    rows.push(`<b>עובר בבועות:</b> ${it.bubbles.map(short).join(', ') || '—'}`);
  } else if (it.feat) {
    return '';
  } else {
    if (it.region) rows.push(`<b>אזור:</b> ${it.region}`);
    rows.push(`<b>בועה:</b> ${it.bubbles.map(short).join(', ') || 'מחוץ לבועות'}`);
  }
  if (it.zones && it.zones.length) rows.push(`<b>שטחי אש סמוכים:</b> ${it.zones.join(', ')}`);
  if (it.hatmar) rows.push(`<b>${it.hatmar.n}</b> (עיר מרכזית: ${it.hatmar.city})`);
  if (it.note) rows.push(`<b>הערה:</b> ${it.note}`);
  return rows.join('<br>');
}

// ---------- מצבים ----------
let mode = 'locate', cur = null, onMapClick = null;
const pool = () => {
  const c = $('#cat').value;
  if (c === 'core') return ITEMS.filter(it => it.core);
  if (c === 'all') return ITEMS.filter(it => it.cat !== 'settlements' || it.core);
  return ITEMS.filter(it => it.cat === c);
};
map.on('click', e => onMapClick && onMapClick([e.latlng.lat, e.latlng.lng]));

function reset() {
  overlay.clearLayers(); onMapClick = null;
  $('#choices').innerHTML = ''; $('#fb').innerHTML = '';
}
function choices(opts, correct, done) {
  const box = $('#choices');
  shuffle(opts).forEach(o => {
    const b = document.createElement('button'); b.textContent = o;
    b.onclick = () => {
      if (box.dataset.done) return; box.dataset.done = 1;
      [...box.children].forEach(x => { if (x.textContent === correct) x.classList.add('ok'); });
      if (o !== correct) b.classList.add('bad');
      done(o === correct);
    };
    box.appendChild(b);
  });
  delete box.dataset.done;
}
const distractors = (all, correct, n = 3) => shuffle(all.filter(x => x !== correct)).slice(0, n).concat(correct);

const MODES = {
  locate() {
    const it = cur = weighted(pool());
    $('#q').innerHTML = `איפה ${it.name}?<small>לחץ על המפה${it.lines ? ' (בכל נקודה לאורך הנחל)' : it.feat ? ' (בתוך האזור)' : ''}</small>`;
    onMapClick = ll => {
      onMapClick = null;
      const pt = turf.point(ll2pt(ll));
      const km = it.feat ? (turf.booleanPointInPolygon(pt, it.feat) ? 0 : turf.pointToLineDistance(pt, turf.polygonToLine(it.feat)))
               : it.lines ? Math.min(...it.lines.filter(l => l.length > 1).map(l => turf.pointToLineDistance(pt, turf.lineString(l.map(ll2pt)))))
                         : turf.distance(pt, turf.point(ll2pt(it.p)));
      const ok = km <= (it.cat === 'zones' ? 5 : 3);
      record(it.id, ok);
      L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3, fillColor: '#ffb400', fillOpacity: 1 }).addTo(overlay).bindTooltip('הלחיצה שלך', { className: 'lbl' });
      drawItem(it, ok ? '#2ecc71' : '#ff5c5c', false);
      const pts = it.feat ? it.feat.geometry.coordinates[0].map(([x, y]) => [y, x]) : it.lines ? it.lines.flat() : [it.p];
      map.fitBounds(L.latLngBounds([ll, ...pts]), { padding: [50, 50], maxZoom: 11 });
      $('#fb').innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'נכון!' : 'לא מדויק'}</span> מרחק: ${km.toFixed(1)} ק"מ<br>${infoHtml(it)}`;
    };
  },
  bubble() {
    const list = pool().filter(it => !it.lines && it.bubbles.length);
    const it = cur = weighted(list);
    const correctList = it.lines ? it.startB : it.bubbles;
    const correct = short(correctList[0]);
    $('#q').innerHTML = it.lines ? `באיזו בועה מתחיל ${it.name}?` : `באיזו בועה נמצא ${it.name}?`;
    const all = BUBBLES.map(f => short(f.properties.name)).filter(n => !correctList.map(short).includes(n));
    choices(shuffle(all).slice(0, 3).concat(correct), correct, ok => {
      record(it.id + '#b', ok);
      drawItem(it);
      $('#fb').innerHTML = infoHtml(it);
    });
  },
  hatmar() {
    reset();
    const kind = pick(['area', 'city', 'settlement']);
    if (kind === 'settlement') {
      const list = ITEMS.filter(it => it.cat === 'settlements' && it.hatmar && !ARAB_CITIES.has(it.name));
      const it = cur = weighted(list);
      $('#q').innerHTML = `באיזה חטמ"ר נמצא ${it.name}?`;
      choices(distractors(HATMARIM.map(h => h.n), it.hatmar.n), it.hatmar.n, ok => {
        record(it.id + '#h', ok);
        drawHatmar(it.hatmar); drawItem(it, '#00e0ff', false);
        $('#fb').innerHTML = `${it.hatmar.n} — עיר מרכזית: ${it.hatmar.city}`;
      });
    } else if (kind === 'city') {
      const h = pick(HATMARIM); cur = h;
      $('#q').innerHTML = `מה העיר הערבית המרכזית ב${h.n}?`;
      choices(distractors(HATMARIM.map(x => x.city), h.city), h.city, ok => {
        record('h:' + h.n + '#c', ok);
        drawHatmar(h);
        const c = ITEMS.find(it => it.name === h.city); if (c) drawItem(c, '#ffb400', false);
      });
    } else {
      const h = pick(HATMARIM); cur = h;
      $('#q').innerHTML = `לחץ בתוך ${h.n}`;
      map.setView([31.95, 35.25], 9);
      onMapClick = ll => {
        onMapClick = null;
        const ok = turf.booleanPointInPolygon(turf.point(ll2pt(ll)), h.feat);
        record('h:' + h.n, ok);
        L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3, fillColor: '#ffb400', fillOpacity: 1 }).addTo(overlay).bindTooltip('הלחיצה שלך', { className: 'lbl' });
        HATMARIM.forEach(x => drawHatmar(x, x === h ? '#2ecc71' : '#888', false));
        $('#fb').innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'נכון!' : 'לא'}</span> עיר מרכזית: ${h.city}`;
      };
    }
  },
  region() {
    const list = pool().filter(it => it.region || it.lines);
    const it = cur = weighted(list);
    const kinds = it.lines ? ['from', 'to', 'region'] : ['region'];
    const kind = pick(kinds);
    const regions = REGIONS.map(r => r.n);
    let q, correct, opts;
    if (kind === 'region') {
      q = it.lines ? `באיזה אזור מתחיל ${it.name}?` : `באיזה אזור נמצא ${it.name}?`;
      correct = it.region; opts = distractors(regions, correct);
    } else {
      const streams = ITEMS.filter(x => x.lines);
      const key = kind;
      q = kind === 'from' ? `מאיפה מתחיל ${it.name}?` : `איפה מסתיים ${it.name}?`;
      correct = it[key];
      opts = shuffle([...new Set(streams.map(x => x[key]).filter(v => v !== correct))]).slice(0, 3).concat(correct);
    }
    if (!correct) return MODES.region();
    $('#q').innerHTML = q;
    choices(opts, correct, ok => {
      record(it.id + '#' + kind, ok);
      drawItem(it);
      if (it.region) { const r = REGIONS.find(r => r.n === it.region); if (r) L.geoJSON(r.feat, { style: { color: '#ffb400', weight: 2, fillOpacity: .08, dashArray: '4 4' } }).addTo(overlay); }
      $('#fb').innerHTML = infoHtml(it);
    });
  },
  explore() {
    $('#q').innerHTML = 'עיון חופשי<small>בחר מקום מהרשימה כדי לראות אותו על המפה</small>';
    renderList();
  },
};

function renderList() {
  const q = $('#search').value.trim();
  const items = pool().filter(it => !q || it.name.includes(q)).slice(0, 300);
  const hat = $('#cat').value === 'all' ? HATMARIM.filter(h => !q || h.n.includes(q)) : [];
  const ul = $('#list'); ul.innerHTML = '';
  const add = (label, sub, fn) => {
    const li = document.createElement('li'); li.innerHTML = `${label}<span>${sub}</span>`;
    li.onclick = fn; ul.appendChild(li);
  };
  hat.forEach(h => add(h.n, h.city, () => { overlay.clearLayers(); drawHatmar(h); $('#fb').innerHTML = `עיר מרכזית: ${h.city}`; }));
  items.forEach(it => add(it.name, it.region || (it.bubbles[0] ? short(it.bubbles[0]) : ''), () => {
    overlay.clearLayers(); drawItem(it); $('#fb').innerHTML = infoHtml(it);
  }));
}
$('#search').oninput = renderList;

function next() {
  reset();
  $('#explore').hidden = mode !== 'explore';
  $('#next').hidden = mode === 'explore';
  $('#cat').disabled = mode === 'hatmar';
  MODES[mode]();
}
$('#next').onclick = next;
$('#cat').onchange = next;
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  mode = b.dataset.mode; next();
});
next();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');

// ---------- הורדת מפת המסוקים לשימוש בלי רשת ----------
function tileList() {
  const out = [], [s, w, n, e] = [29.45, 34.2, 33.35, 35.95];
  const tx = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
  const ty = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
  for (let z = 7; z <= 12; z++)
    for (let x = tx(w, z); x <= tx(e, z); x++)
      for (let y = ty(n, z); y <= ty(s, z); y++) out.push(`https://flight-maps.com/tiles/il-hel/${z}/${x}/${y}.png`);
  return out;
}
async function downloadMap() {
  const btn = $('#offline'), urls = tileList();
  let done = 0, failed = 0, i = 0;
  btn.disabled = true;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try { await fetch(u, { mode: 'no-cors' }); } catch (e) { failed++; }
      btn.textContent = `מוריד… ${Math.round(++done / urls.length * 100)}%`;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  btn.textContent = failed ? `✓ הורד (${failed} נכשלו — נסה שוב)` : '✓ המפה שמורה';
  btn.disabled = false;
  try { localStorage.setItem('yh-offline', '1'); } catch (e) {}
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.ready.then(() => {
    const b = $('#offline'); b.hidden = false;
    try { if (localStorage.getItem('yh-offline')) b.textContent = '✓ המפה שמורה (עדכן)'; } catch (e) {}
    b.onclick = () => { if (navigator.serviceWorker.controller) downloadMap(); else location.reload(); };
  });
}
