'use strict';
// ידיעת הארץ — אתגר יומי + תרגול חופשי על מפת המסוקים.
const $ = s => document.querySelector(s);
const ll2pt = ([lat, lng]) => [lng, lat];
const shuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const kmBetween = (a, b) => turf.distance(turf.point(ll2pt(a)), turf.point(ll2pt(b)));
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n.toLocaleString('he-IL');

// ===================== נתונים =====================
const P = window.PLACES, H = window.HIKING;
const CATS = {
  streams:     { label: 'נחל',       hint: 'לחצו בכל נקודה לאורך הנחל' },
  spots:       { label: 'אתר טיול',  hint: 'לחצו על המקום במפה' },
  mountains:   { label: 'הר ומכתש',  hint: 'לחצו על המקום במפה' },
  settlements: { label: 'יישוב',     hint: 'לחצו על היישוב במפה' },
};
// יישובים: רק המוכרים מהרשימה הידנית, כמעט בלי יישובים ערביים.
const SKIP_SETTLEMENTS = new Set(['סחנין', 'שפרעם', 'אום אל-פחם', 'כפר קאסם', 'טייבה', 'רהט', 'כסייפה', 'תל שבע', 'חורה',
  'מסעדה', 'חומש (לשעבר)', 'ג\'נין', 'טול כרם', 'קלקיליה', 'שכם', 'רמאללה', 'יריחו', 'בית לחם', 'חברון', 'טובאס', 'סלפית',
  'יטא', 'דורא', 'ענבתא', 'קבטיה', 'חווארה']);
const NOT_TRIP = new Set(['הר עיבל', 'הר גריזים', 'הר בעל חצור']);

function areaFeat(m) {
  // ell = [חצי ציר ארוך, חצי ציר קצר (ק"מ), זווית ממזרח נגד כיוון השעון]. turf מסובב עם כיוון השעון.
  if (m.ell) return turf.ellipse(ll2pt(m.p), m.ell[0], m.ell[1], { units: 'kilometers', angle: -m.ell[2], steps: 48 });
  if (m.line) return turf.buffer(turf.lineString(m.line.map(ll2pt)), m.w, { units: 'kilometers', steps: 6 });
}

const ITEMS = [];
window.STREAMS.filter(s => H.streams[s.n]).forEach(s => ITEMS.push({
  id: 's:' + s.n, cat: 'streams', name: s.n, lines: s.lines.filter(l => l.length > 1), start: s.start, end: s.end, km: s.km, tip: H.streams[s.n],
}));
H.spots.forEach(s => ITEMS.push({ id: 't:' + s.n, cat: 'spots', name: s.n, p: s.p, tip: s.note }));
P.mountains.filter(m => !NOT_TRIP.has(m.n)).forEach(m => ITEMS.push({ id: 'm:' + m.n, cat: 'mountains', name: m.n, p: m.p, feat: areaFeat(m) }));
P.settlements.filter(s => !SKIP_SETTLEMENTS.has(s[0])).forEach(([n, lat, lng]) => ITEMS.push({ id: 'y:' + n, cat: 'settlements', name: n, p: [lat, lng] }));
const BY_ID = Object.fromEntries(ITEMS.map(it => [it.id, it]));

// אזור גאוגרפי, ומאיפה הנחל מתחיל ולאן הוא נשפך — במילים
const REGIONS = window.REGIONS.map(r => ({ n: r.n, feat: turf.polygon([[...r.poly, r.poly[0]].map(ll2pt)]) }));
const regionOf = ll => { const pt = turf.point(ll2pt(ll)); const r = REGIONS.find(r => turf.booleanPointInPolygon(pt, r.feat)); return r && r.n; };
const GAZ = ITEMS.filter(it => it.p);
const MED_COAST = turf.lineString([[35.10,33.09],[35.07,32.92],[35.02,32.83],[34.96,32.82],[34.93,32.70],[34.89,32.50],[34.77,32.10],[34.63,31.80],[34.50,31.60],[34.22,31.32]]);
const EGYPT_BORDER = [[34.24, 31.32], [34.41, 30.87], [34.60, 30.30], [34.90, 29.49]];
function inEgypt([lat, lng]) {
  for (let i = 0; i < EGYPT_BORDER.length - 1; i++) {
    const [x1, y1] = EGYPT_BORDER[i], [x2, y2] = EGYPT_BORDER[i + 1];
    if (lat <= y1 && lat >= y2) return lng < x1 + (x2 - x1) * (y1 - lat) / (y1 - y2) - 0.01;
  }
  return false;
}
function nearPlace(ll) {
  if (inEgypt(ll)) return 'סיני (מצרים)';
  let best = null, bd = 1e9;
  GAZ.forEach(g => { const d = kmBetween(ll, g.p); if (d < bd) { bd = d; best = g; } });
  const near = bd < 2 ? best.name : bd < 15 ? `ליד ${best.name}` : '';
  return [regionOf(ll), near].filter(Boolean).join(', ') || 'לא ידוע';
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
  if (kmBetween(s.end, [32.82, 35.59]) < 9) return 'נשפך לכנרת';
  if (reg === 'עמק החולה') return 'נשפך לירדן (בעמק החולה)';
  if (lat > 32.86 && lat < 33.05 && lng > 35.55 && lng < 35.66) return 'נשפך לירדן (צפונית לכנרת)';
  if (reg === 'ים המלח' || (lat > 31.0 && lat < 31.8 && lng > 35.30 && reg === 'מדבר יהודה')) return 'נשפך לים המלח';
  if (lat >= 31.8 && lat < 32.75 && lng > 35.5) return 'נשפך לירדן';
  if (lat < 31.0 && lng > 35.1) return 'נשפך לערבה';
  return `מסתיים ${nearPlace(s.end)}`;
}
ITEMS.forEach(it => {
  if (it.cat === 'streams') {
    const note = (window.STREAM_NOTES || {})[it.name] || {};
    it.from = note.from || nearPlace(it.start);
    it.to = note.to || outlet(it);
  } else it.region = regionOf(it.p);
});

// ===================== ניקוד =====================
// 100 נק' לפגיעה (או לחיצה בתוך אזור), יורד עם המרחק: ~70 ב-3 ק"מ, ~25 ב-10 ק"מ.
const pointsFor = km => km <= 0.5 ? 100 : Math.max(0, Math.round(100 * Math.exp(-(km - 0.5) / 7)));
function distanceTo(it, ll) {
  const pt = turf.point(ll2pt(ll));
  if (it.feat) return turf.booleanPointInPolygon(pt, it.feat) ? 0 : turf.pointToLineDistance(pt, turf.polygonToLine(it.feat));
  if (it.lines) return Math.min(...it.lines.map(l => turf.pointToLineDistance(pt, turf.lineString(l.map(ll2pt)))));
  return kmBetween(ll, it.p);
}
function nearestOn(it, ll) {
  const pt = turf.point(ll2pt(ll));
  if (!it.feat && !it.lines) return it.p;
  if (it.feat && turf.booleanPointInPolygon(pt, it.feat)) return ll;
  const lines = it.feat ? [turf.polygonToLine(it.feat)] : it.lines.map(l => turf.lineString(l.map(ll2pt)));
  let best = ll, bd = 1e9;
  lines.forEach(l => {
    const parts = l.geometry.type === 'MultiLineString' ? l.geometry.coordinates.map(c => turf.lineString(c)) : [l];
    parts.forEach(p => { const n = turf.nearestPointOnLine(p, pt); if (n.properties.dist < bd) { bd = n.properties.dist; best = [n.geometry.coordinates[1], n.geometry.coordinates[0]]; } });
  });
  return best;
}
const verdict = km => km <= 0.5 ? ['בול!', 'good'] : km <= 3 ? ['מצוין', 'good'] : km <= 8 ? ['קרוב', 'mid'] : km <= 20 ? ['בכיוון', 'mid'] : ['רחוק', 'bad'];
const tone = pts => pts >= 70 ? 'good' : pts >= 30 ? 'mid' : 'bad';

// "עוגן": מקום מוכר קרוב, כדי לקשר את המיקום למשהו שכבר בראש
const DIRS = ['צפונית', 'צפון-מזרחית', 'מזרחית', 'דרום-מזרחית', 'דרומית', 'דרום-מערבית', 'מערבית', 'צפון-מערבית'];
function anchorText(it) {
  if (!it.p) return '';
  let best = null, bd = 1e9;
  GAZ.forEach(x => { if (x === it || x.name === it.name) return; const d = kmBetween(x.p, it.p); if (d < bd) { bd = d; best = x; } });
  if (!best || bd > 25) return '';
  if (bd < 1) return `צמוד ל${best.name}`;
  const brg = (turf.bearing(turf.point(ll2pt(best.p)), turf.point(ll2pt(it.p))) + 360 + 22.5) % 360;
  return `כ-${bd < 3 ? bd.toFixed(1) : Math.round(bd)} ק"מ ${DIRS[Math.floor(brg / 45)]} ל${best.name}`;
}
function factsHtml(it) {
  const rows = [];
  if (it.cat === 'streams') rows.push(['אורך', `כ-${it.km} ק"מ`], ['מתחיל', it.from], ['מסתיים', it.to]);
  else {
    if (it.region) rows.push(['אזור', it.region]);
    const a = anchorText(it); if (a) rows.push(['איך לזכור', a]);
  }
  return `${it.tip ? `<p class="tip">${esc(it.tip)}</p>` : ''}<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

// ===================== מפה =====================
const ISRAEL = L.latLngBounds([29.45, 34.25], [33.35, 35.92]);
const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 7, maxZoom: 13, zoomSnap: 0.25,
  maxBounds: ISRAEL.pad(0.15), maxBoundsViscosity: 1 });
L.control.zoom({ position: 'topleft', zoomInTitle: 'התקרבות', zoomOutTitle: 'התרחקות' }).addTo(map);
// מפת נתיבי המסוקים (flight-maps.com, ?map=heli) — המפה היחידה באפליקציה
L.tileLayer('https://flight-maps.com/tiles/il-hel/{z}/{x}/{y}.png', { maxNativeZoom: 12, bounds: ISRAEL.pad(0.15) }).addTo(map);
const overlay = L.layerGroup().addTo(map);

const wide = () => matchMedia('(min-width: 900px)').matches;
function pad() {
  const top = $('.topbar').offsetHeight + 20, sheet = $('#sheet');
  return wide() ? { paddingTopLeft: [24, top], paddingBottomRight: [sheet.offsetWidth + 48, 24] }
                : { paddingTopLeft: [12, top], paddingBottomRight: [12, sheet.offsetHeight + 12] };
}
// אי אפשר להתרחק יותר מ"כל הארץ על המסך"
function lockZoom() {
  const p = pad(), total = L.point(p.paddingTopLeft).add(p.paddingBottomRight);
  map.setMinZoom(Math.max(6, Math.floor(map.getBoundsZoom(ISRAEL, false, total) * 4) / 4));
}
const fitIsrael = () => { lockZoom(); map.fitBounds(ISRAEL, { ...pad(), animate: false }); };

const pinIcon = cls => L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
const label = (layer, text) => layer.bindTooltip(esc(text), { permanent: true, direction: 'top', offset: [0, -10], className: 'maplabel' });
const COLORS = { good: '#16a34a', mid: '#d97706', bad: '#dc2626', info: '#0e7490' };
function drawTarget(it, cls, withLabel = true) {
  const color = COLORS[cls];
  let layer;
  if (it.feat) {
    layer = L.geoJSON(it.feat, { style: { color, weight: 3, fillColor: color, fillOpacity: 0.18 } }).addTo(overlay);
    if (withLabel) label(L.marker(it.p, { icon: L.divIcon({ className: '', iconSize: [0, 0] }) }).addTo(overlay), it.name);
  } else if (it.lines) {
    L.polyline(it.lines, { color: '#fff', weight: 10, opacity: 0.9, lineCap: 'round' }).addTo(overlay);
    layer = L.polyline(it.lines, { color, weight: 5, lineCap: 'round' }).addTo(overlay);
    const s = L.circleMarker(it.start, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(overlay);
    if (withLabel) label(s, it.name);
  } else {
    layer = L.marker(it.p, { icon: pinIcon('target ' + cls) }).addTo(overlay);
    if (withLabel) label(layer, it.name);
  }
  return layer;
}
const boundsOf = layer => layer.getBounds ? layer.getBounds() : L.latLngBounds([layer.getLatLng(), layer.getLatLng()]);
// מציג את התשובה על המפה; מחזיר מרחק בק"מ (0 = בתוך אזור), או null אם אין לחיצה
function showAnswer(it, ll) {
  overlay.clearLayers();
  const km = ll ? distanceTo(it, ll) : null;
  const t = drawTarget(it, km == null ? 'info' : tone(pointsFor(km)));
  if (ll) {
    if (km > 0) L.polyline([ll, nearestOn(it, ll)], { color: '#0f172a', weight: 2, dashArray: '6 6', opacity: 0.85 }).addTo(overlay);
    L.marker(ll, { icon: pinIcon('user'), zIndexOffset: 1000 }).addTo(overlay);
  }
  requestAnimationFrame(() => {
    const b = boundsOf(t); if (ll) b.extend(ll);
    map.flyToBounds(b, { ...pad(), maxZoom: 11, duration: 0.6 });
  });
  return km;
}
let onMapClick = null;
map.on('click', e => onMapClick && onMapClick([e.latlng.lat, e.latlng.lng]));

// ===================== תצוגת שאלה / תשובה (משותף) =====================
const view = $('#view');
// כל מסך חדש מתחיל מראש הכרטיס
new MutationObserver(() => { $('#sheet').scrollTop = 0; }).observe(view, { childList: true });
function askHtml(it, top = '') {
  return `${top}<div class="q">
    <span class="chip c-${it.cat}">${CATS[it.cat].label}</span>
    <div class="prompt"><span>איפה</span><h1>${esc(it.name)}?</h1></div>
    <p class="hint">${it.feat ? 'לחצו בכל מקום בתוך האזור' : CATS[it.cat].hint}</p></div>`;
}
function resultHtml(it, km, pts, top = '') {
  const [word, cls] = km == null ? ['התשובה', 'info'] : verdict(km);
  const dist = km == null ? 'בלי ניקוד הפעם' : km === 0 ? (it.feat ? 'בתוך האזור' : 'פגיעה מדויקת') : `${km < 10 ? km.toFixed(1) : Math.round(km)} ק"מ מהיעד`;
  return `${top}<div class="result ${cls}">
      <div class="badge">${km == null ? '—' : '+' + pts}</div>
      <div class="rtext"><b>${word}</b><span>${dist}</span></div>
    </div>
    <h2 class="place"><span class="chip c-${it.cat}">${CATS[it.cat].label}</span>${esc(it.name)}</h2>
    ${factsHtml(it)}`;
}
const ask = onAnswer => { onMapClick = ll => { onMapClick = null; onAnswer(ll); }; };

// ===================== תרגול =====================
// כל פעם מקום אחר, בלי חזרות: לכל סוג יש "חפיסה" מעורבבת שנשמרת במכשיר,
// ומקום חוזר רק אחרי שעברנו על כל השאר מאותו סוג. התמהיל בין הסוגים קבוע.
const MIX = { streams: 0.35, spots: 0.25, settlements: 0.28, mountains: 0.12 };
const Practice = {
  decks: store.get('yh-pdecks', {}), last: store.get('yh-plast', []),
  session: { n: 0, pts: 0, streak: 0, best: store.get('yh-pbest', 0) },
  nextItem() {
    let r = Math.random(), cat = 'streams';
    for (const [c, w] of Object.entries(MIX)) { if ((r -= w) <= 0) { cat = c; break; } }
    let deck = (this.decks[cat] || []).filter(id => BY_ID[id]);
    if (!deck.length) deck = shuffle(ITEMS.filter(it => it.cat === cat && !this.last.includes(it.id)).map(it => it.id));
    const id = deck.shift();
    this.decks[cat] = deck; store.set('yh-pdecks', this.decks);
    this.last = [...this.last, id].slice(-12); store.set('yh-plast', this.last);
    return BY_ID[id];
  },
  stats() {
    const s = this.session;
    return `<div class="statbar"><span>⭐ <b>${fmt(s.pts)}</b> נק'</span><span>🔥 רצף <b>${s.streak}</b></span><span>שיא <b>${s.best}</b></span></div>`;
  },
  show() {
    const it = this.nextItem();
    overlay.clearLayers();
    view.innerHTML = askHtml(it, this.stats()) + `<div class="actions"><button class="btn ghost" id="skip">לא יודע/ת — הראו לי</button></div>`;
    fitIsrael();
    const done = ll => {
      const km = showAnswer(it, ll);
      const pts = km == null ? 0 : pointsFor(km), s = this.session;
      s.n++; s.pts += pts; s.streak = km != null && km <= 3 ? s.streak + 1 : 0;
      if (s.streak > s.best) { s.best = s.streak; store.set('yh-pbest', s.best); }
      view.innerHTML = resultHtml(it, km, pts, this.stats()) + `<div class="actions"><button class="btn primary wide" id="next">המקום הבא</button></div>`;
      $('#next').onclick = () => this.show();
    };
    ask(done);
    $('#skip').onclick = () => { onMapClick = null; done(null); };
  },
};

// ===================== אתגר יומי =====================
// אותם 20 מקומות לכל השחקנים ביום נתון (נבחרים לפי התאריך), ניסיון אחד ביום, עד 2,000 נקודות.
const DAILY_QUOTA = { streams: 7, spots: 6, settlements: 4, mountains: 3 };
const DAILY_N = 20;
const Daily = {
  today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  pretty: d => d.split('-').reverse().slice(0, 2).join('.'),
  rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  },
  itemsFor(date) {
    const r = this.rng('yh-daily-v2-' + date);
    const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    let out = [];
    for (const [cat, n] of Object.entries(DAILY_QUOTA)) out = out.concat(shuffle(ITEMS.filter(it => it.cat === cat).sort(byName), r).slice(0, n));
    return shuffle(out, r);
  },
  load() { const s = store.get('yh-daily2', null); this.st = s && s.date === this.today() ? s : { date: this.today(), res: [], started: false }; },
  save() { store.set('yh-daily2', this.st); },
  total() { return this.st.res.reduce((a, r) => a + r.pts, 0); },
  progress(items, cur) {
    return `<div class="dprog" aria-hidden="true">${items.map((_, i) => { const r = this.st.res[i]; return `<i class="${r ? tone(r.pts) : i === cur ? 'cur' : ''}"></i>`; }).join('')}</div>
      <div class="dhead"><span>שאלה <b>${Math.min(cur + 1, items.length)}</b> מתוך ${items.length}</span><span>⭐ <b>${fmt(this.total())}</b></span></div>`;
  },
  show() {
    this.load();
    const items = this.itemsFor(this.st.date);
    overlay.clearLayers();
    if (!this.st.started) return this.intro();
    if (this.st.res.length >= items.length) return this.summary(items);
    const i = this.st.res.length, it = items[i];
    view.innerHTML = askHtml(it, this.progress(items, i));
    fitIsrael();
    ask(ll => {
      const km = showAnswer(it, ll), pts = pointsFor(km);
      this.st.res.push({ id: it.id, km: Math.round(km * 10) / 10, pts }); this.save();
      const last = this.st.res.length >= items.length;
      view.innerHTML = resultHtml(it, km, pts, this.progress(items, i)) +
        `<div class="actions"><button class="btn primary wide" id="next">${last ? 'לתוצאה הסופית' : 'השאלה הבאה'}</button></div>`;
      $('#next').onclick = () => this.show();
    });
  },
  intro() {
    view.innerHTML = `<div class="intro">
      <span class="eyebrow">אתגר יומי · ${this.pretty(this.st.date)}</span>
      <h1>20 מקומות. ניסיון אחד.</h1>
      <p>כל השחקנים מקבלים היום את אותם מקומות. כל תשובה שווה עד 100 נקודות — ככל שלוחצים קרוב יותר, מקבלים יותר.</p>
      <ul class="mixlist">
        <li><span class="chip c-streams">נחלים</span><b>${DAILY_QUOTA.streams}</b></li>
        <li><span class="chip c-spots">אתרי טיול</span><b>${DAILY_QUOTA.spots}</b></li>
        <li><span class="chip c-settlements">יישובים</span><b>${DAILY_QUOTA.settlements}</b></li>
        <li><span class="chip c-mountains">הרים ומכתשים</span><b>${DAILY_QUOTA.mountains}</b></li>
      </ul>
      <button class="btn primary wide" id="start">התחלת האתגר</button></div>`;
    fitIsrael();
    $('#start').onclick = () => { this.st.started = true; this.save(); this.show(); };
  },
  rank(t) {
    return t >= 1800 ? 'מורה דרך 🧭' : t >= 1450 ? 'מטייל/ת ותיק/ה 🥾' : t >= 1100 ? 'מכיר/ה את הארץ 🗺️' : t >= 700 ? 'בדרך הנכונה 🌱' : 'מחר עוד הזדמנות ☀️';
  },
  squares() { return this.st.res.map(r => ({ good: '🟩', mid: '🟨', bad: '🟥' }[tone(r.pts)])).join(''); },
  summary(items) {
    items.forEach((it, i) => { const r = this.st.res[i]; if (r) drawTarget(it, tone(r.pts), false); });
    const t = this.total(), tm = new Date(); tm.setHours(24, 0, 0, 0);
    const left = tm - Date.now(), hh = Math.floor(left / 36e5), mm = Math.floor(left / 6e4) % 60;
    view.innerHTML = `<div class="final">
      <span class="eyebrow">אתגר יומי · ${this.pretty(this.st.date)}</span>
      <div class="bigscore"><b>${fmt(t)}</b><span>מתוך ${fmt(DAILY_N * 100)}</span></div>
      <div class="rank">${this.rank(t)}</div>
      <div class="squares" aria-label="תוצאה לכל שאלה">${this.squares()}</div>
      <button class="btn primary wide" id="share">שיתוף התוצאה</button>
      <p class="fine">האתגר הבא בעוד ${hh}:${String(mm).padStart(2, '0')} שעות · בינתיים אפשר לתרגל חופשי</p>
      <ol class="rlist">${items.map((it, i) => { const r = this.st.res[i] || { pts: 0, km: 0 };
        return `<li data-i="${i}"><i class="dot ${tone(r.pts)}"></i><span class="n">${esc(it.name)}</span><span class="m">${r.km ? r.km + ' ק"מ' : 'פגיעה'}</span><b>${r.pts}</b></li>`; }).join('')}</ol>
      </div>`;
    requestAnimationFrame(() => map.fitBounds(L.featureGroup(overlay.getLayers()).getBounds(), { ...pad(), maxZoom: 9, animate: false }));
    $('#share').onclick = () => this.share();
    view.querySelectorAll('.rlist li').forEach(li => li.onclick = () => showAnswer(items[+li.dataset.i], null));
  },
  async share() {
    const grid = this.squares().match(/.{1,10}/gu).join('\n');
    const text = `ידיעת הארץ · אתגר יומי ${this.pretty(this.st.date)}\n⭐ ${fmt(this.total())} מתוך ${fmt(DAILY_N * 100)}\n${grid}\n${location.origin + location.pathname}`;
    try { if (navigator.share) return void await navigator.share({ text }); } catch (e) { return; }
    location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
  },
};

// ===================== ניווט =====================
const MODES = { daily: Daily, practice: Practice };
let mode = MODES[store.get('yh-mode', 'daily')] ? store.get('yh-mode', 'daily') : 'daily';
function go(m) {
  mode = m; store.set('yh-mode', m); onMapClick = null;
  document.querySelectorAll('.seg button').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  $('#sheet').scrollTop = 0;
  MODES[m].show();
}
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => go(b.dataset.mode));

// הגדרות
const menu = $('#menu');
$('#menuBtn').onclick = () => menu.showModal();
menu.addEventListener('click', e => { if (e.target === menu) menu.close(); });

const VERSION = '1.5';
$('#version').textContent = `גרסה ${VERSION}`;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // בודק עדכון בכל פתיחה, ואם יש גרסה חדשה — טוען אותה מיד
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { lockZoom(); if (onMapClick) fitIsrael(); }, 150); });
go(mode);
