'use strict';
// מצב "רשום יישובים": בוחרים אזור ורושמים כמה שיותר יישובים שבתוכו.
(function () {
  const norm = s => s.replace(/[֑-ׇ]/g, '').replace(/[׳']/g, "'").replace(/[״"]/g, '').replace(/[-–־]/g, ' ')
    .replace(/^(קיבוץ|מושב|כפר הנוער) /, '').replace(/\s+/g, ' ').trim();
  const key = s => norm(s).replace(/['\s]/g, '').replace(/יי/g, 'י').replace(/וו/g, 'ו');

  const SETT = ITEMS.filter(it => it.cat === 'settlements');
  const BY_KEY = new Map(), BY_NORM = new Map();
  // כל שם נרשם גם בחלקיו: "שבלי - אום אל-גנם" → "שבלי", "גבע בנימין (אדם)" → "אדם", "כנרת (מושבה)" → "כנרת"
  const aliases = name => [name, ...name.split(/\s+-\s+|\s*[()]\s*/).filter(p => p.length > 1)];
  const put = (m, k, it) => { if (k && !m.has(k)) m.set(k, it); };
  SETT.forEach(it => aliases(it.name).forEach(a => { put(BY_NORM, norm(a), it); put(BY_KEY, key(a), it); }));
  const find = s => { for (const a of aliases(s)) { const it = BY_NORM.get(norm(a)) || BY_KEY.get(key(a)); if (it) return it; } };
  const inName = n => 'ב' + (/^הרי? /.test(n) ? n : n.replace(/^ה/, ''));
  const regionFeat = n => n === 'איו"ש' ? HATMARIM.map(h => h.feat) : REGIONS.filter(r => r.n === n).map(r => r.feat);

  const AREAS = window.LIST_AREAS.map(a => {
    const feats = a.regions.flatMap(regionFeat);
    const inside = it => { const pt = turf.point(ll2pt(it.p)); return feats.some(f => turf.booleanPointInPolygon(pt, f)); };
    const rings = feats.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]));
    const near = it => { const pt = turf.point(ll2pt(it.p)); return rings.some(r => turf.pointToLineDistance(pt, turf.lineString(r)) < 4); };
    const members = SETT.filter(inside);
    const mustItems = a.must.map(n => find(n) || { id: 't:' + n, name: n, missingData: true });
    return { ...a, feats, inside, near, members, mustItems };
  });

  let area = null, found = new Map();
  const ui = $('#listmode');

  function bestKey(a) { return 'yh-list-' + a.n; }
  function getBest(a) { try { return +localStorage.getItem(bestKey(a)) || 0; } catch (e) { return 0; } }
  function setBest(a, v) { try { if (v > getBest(a)) localStorage.setItem(bestKey(a), v); } catch (e) {} }

  function showMenu() {
    area = null; found = new Map(); overlay.clearLayers();
    $('#q').innerHTML = 'רשום כמה שיותר יישובים<small>בחר אזור, ואז רשום את כל היישובים שאתה מכיר בתוכו</small>';
    const btn = a => `<button data-a="${a.n}">${a.n}<span>${getBest(a) ? 'שיא: ' + getBest(a) : ''}</span></button>`;
    ui.innerHTML = `<div class="areas">${AREAS.filter(a => !a.extra).map(btn).join('')}</div>
      <div class="sub">אזורים נוספים שמומלץ להכיר:</div>
      <div class="areas">${AREAS.filter(a => a.extra).map(btn).join('')}</div>`;
    ui.querySelectorAll('[data-a]').forEach(b => b.onclick = () => start(AREAS.find(a => a.n === b.dataset.a)));
  }

  function start(a) {
    area = a; found = new Map(); overlay.clearLayers();
    const g = L.geoJSON(turf.featureCollection(a.feats), { style: { color: '#ffb400', weight: 3, fillOpacity: .08 } }).addTo(overlay);
    map.fitBounds(g.getBounds(), { padding: [20, 20] });
    $('#q').innerHTML = `${a.n}<small>רשום יישוב ולחץ Enter. בסיום לחץ "סיימתי"</small>`;
    ui.innerHTML = `<div class="addrow"><input id="lname" placeholder="שם יישוב…" autocomplete="off"><button id="ladd">הוסף</button></div>
      <div id="lcount"></div><div id="lmsg"></div><div id="chips"></div>
      <div class="actions"><button id="ldone">סיימתי</button> <button id="lback" class="ghost">← חזרה לאזורים</button></div>`;
    const inp = $('#lname');
    const add = () => { const v = inp.value.trim(); if (v) submit(v); inp.value = ''; inp.focus(); };
    $('#ladd').onclick = add;
    inp.onkeydown = e => { if (e.key === 'Enter') add(); };
    $('#ldone').onclick = finish;
    $('#lback').onclick = showMenu;
    count(); inp.focus();
  }

  function count() { $('#lcount').textContent = `מצאת ${found.size} יישובים · מומלצים: ${[...found.values()].filter(it => area.mustItems.includes(it)).length}/${area.mustItems.length}`; }
  function msg(t, cls) { $('#lmsg').innerHTML = `<span class="${cls}">${t}</span>`; }

  function submit(v) {
    const it = find(v) || area.mustItems.find(m => m.missingData && aliases(m.name).some(a => key(a) === key(v)));
    if (!it) return msg(`"${v}" — לא מכיר יישוב בשם הזה. בדוק כתיב`, 'bad');
    if (found.has(it.id)) return msg(`${it.name} — כבר רשמת`, 'muted');
    const ok = area.mustItems.includes(it) || area.inside(it) || area.near(it);
    if (!ok) {
      L.circleMarker(it.p, { radius: 6, color: '#ff5c5c', fillOpacity: .8 }).addTo(overlay).bindTooltip(it.name, { className: 'lbl' });
      return msg(`${it.name} — לא ${inName(area.n)}${it.region ? ' (הוא ' + inName(it.region) + ')' : ''}`, 'bad');
    }
    found.set(it.id, it);
    if (it.p) L.circleMarker(it.p, { radius: 6, color: '#2ecc71', fillOpacity: .9 }).addTo(overlay).bindTooltip(it.name, { permanent: true, direction: 'top', className: 'lbl' });
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = it.name; $('#chips').prepend(c);
    msg(`✓ ${it.name}`, 'ok'); count();
  }

  function finish() {
    setBest(area, found.size);
    const missedMust = area.mustItems.filter(it => !found.has(it.id));
    const others = area.members.filter(it => !found.has(it.id) && !area.mustItems.includes(it));
    missedMust.filter(it => it.p).forEach(it => L.circleMarker(it.p, { radius: 6, color: '#ffb400', fillOpacity: .9 }).addTo(overlay)
      .bindTooltip(it.name, { permanent: true, direction: 'top', className: 'lbl' }));
    others.forEach(it => L.circleMarker(it.p, { radius: 3, color: '#aaa', weight: 1, fillOpacity: .7 }).addTo(overlay).bindTooltip(it.name, { className: 'lbl' }));
    $('#q').innerHTML = `${area.n}: מצאת ${found.size}<small>שיא: ${getBest(area)}</small>`;
    ui.innerHTML = `
      <div class="sub">מומלץ לזכור — לא רשמת (${missedMust.length}):</div>
      <div class="chips must">${missedMust.map(it => `<span class="chip warn" data-id="${it.id || ''}">${it.name}</span>`).join('') || '<span class="ok">כל המומלצים! 👏</span>'}</div>
      <div class="sub">רשמת (${found.size}):</div>
      <div class="chips">${[...found.values()].map(it => `<span class="chip">${it.name}</span>`).join('')}</div>
      <details><summary>עוד ${others.length} יישובים באזור (נקודות אפורות במפה)</summary><div class="chips">${others.map(it => `<span class="chip dim" data-id="${it.id}">${it.name}</span>`).join('')}</div></details>
      <div class="actions"><button id="lagain">שוב</button> <button id="lback" class="ghost">← אזורים</button></div>`;
    ui.querySelectorAll('[data-id]').forEach(c => c.onclick = () => { const it = ITEMS.find(x => x.id === c.dataset.id); if (it) map.setView(it.p, 11); });
    $('#lagain').onclick = () => start(area);
    $('#lback').onclick = showMenu;
  }

  MODES.list = showMenu;
})();
