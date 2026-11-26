'use strict';
// טבלת דירוג + הרשמה בכינוי (Firebase: כניסה אנונימית + Firestore).
// פעיל רק אם firebase-config.js קיים. מבנה הנתונים והחוקים: firestore.rules
window.Board = (function () {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !window.firebase) return null;
  firebase.initializeApp(cfg);
  const auth = firebase.auth(), db = firebase.firestore();
  if (/[?&]emu=1/.test(location.search)) { // בדיקות מקומיות מול האמולטור
    auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
    db.useEmulator('127.0.0.1', 8085);
  }
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let me = null;          // { uid, name, total, days, best }
  const ready = new Promise(res => auth.onAuthStateChanged(async u => {
    if (!u) { try { await auth.signInAnonymously(); } catch (e) { res(); } return; }
    try { const s = await db.collection('users').doc(u.uid).get(); me = s.exists ? { uid: u.uid, ...s.data() } : { uid: u.uid }; } catch (e) { me = { uid: u.uid }; }
    res();
  }));
  const registered = () => !!(me && me.name);
  const cleanName = s => s.replace(/\s+/g, ' ').trim();

  async function register(raw) {
    await ready;
    const name = cleanName(raw);
    if (name.length < 2 || name.length > 20) throw new Error('כינוי צריך להיות 2–20 תווים');
    if (!/^[\p{L}\p{N} ._'"-]+$/u.test(name)) throw new Error('אפשר אותיות, מספרים ורווחים בלבד');
    const uid = auth.currentUser.uid, key = name.toLowerCase();
    const taken = await db.collection('names').doc(key).get();
    if (taken.exists && taken.data().uid !== uid) throw new Error('הכינוי הזה תפוס — נסו אחר');
    const b = db.batch();
    b.set(db.collection('names').doc(key), { uid });
    b.set(db.collection('users').doc(uid), { name, total: 0, days: 0, best: 0, lastDate: '' });
    await b.commit();
    me = { uid, name, total: 0, days: 0, best: 0, lastDate: '' };
  }

  // שולח את תוצאת האתגר של היום (פעם אחת). מחזיר true אם נשלח או כבר היה שם.
  async function submit(st) {
    await ready;
    if (!registered()) return false;
    const uid = me.uid, id = `${st.date}_${uid}`, total = st.res.reduce((a, r) => a + r.pts, 0);
    if (lsGet('yh-sub', '') === id) return true;
    const ref = db.collection('scores').doc(id), uref = db.collection('users').doc(uid);
    try {
      await db.runTransaction(async tx => {
        const [s, u] = [await tx.get(ref), await tx.get(uref)];
        if (s.exists) return;
        const o = u.data();
        tx.set(ref, { uid, name: o.name, date: st.date, total, res: st.res.map(r => r.pts) });
        tx.update(uref, { total: o.total + total, days: o.days + 1, best: Math.max(o.best, total), lastDate: st.date });
        me = { ...me, total: o.total + total, days: o.days + 1, best: Math.max(o.best, total), lastDate: st.date };
      });
      lsSet('yh-sub', id);
      return true;
    } catch (e) { console.warn('submit failed', e); return false; }
  }

  async function today(date) {
    const q = await db.collection('scores').where('date', '==', date).get();
    return q.docs.map(d => d.data()).sort((a, b) => b.total - a.total);
  }
  async function allTime() {
    const q = await db.collection('users').orderBy('total', 'desc').limit(100).get();
    return q.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.days > 0);
  }

  // ---------- תצוגה ----------
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const daysTxt = n => n === 1 ? 'יום אחד' : `${n} ימים`;
  const medal = i => ['🥇', '🥈', '🥉'][i] || (i + 1);
  function tableHtml(rows, valueOf, sub) {
    if (!rows.length) return `<p class="empty">עוד אין כאן אף אחד. תהיו הראשונים!</p>`;
    const myIdx = rows.findIndex(r => me && r.uid === me.uid);
    let shown = rows.slice(0, 20).map((r, i) => [r, i]);
    if (myIdx >= 20) shown.push([rows[myIdx], myIdx]);
    return `<ol class="board">${shown.map(([r, i]) => `<li class="${me && r.uid === me.uid ? 'me' : ''}">
      <span class="pos">${medal(i)}</span><span class="who">${e(r.name)}${sub ? `<small>${sub(r)}</small>` : ''}</span><b>${valueOf(r).toLocaleString('he-IL')}</b></li>`).join('')}</ol>`;
  }
  function joinHtml(why) {
    return `<form class="join" id="joinForm">
      <b>${why}</b>
      <div class="row"><input id="nick" maxlength="20" placeholder="כינוי (יופיע בטבלה)" autocomplete="nickname" required>
      <button class="btn primary">הצטרפות</button></div>
      <p class="err" id="nickErr"></p></form>`;
  }
  function wireJoin(root, after) {
    const f = root.querySelector('#joinForm'); if (!f) return;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true; f.querySelector('#nickErr').textContent = '';
      try { await register(f.querySelector('#nick').value); after(); }
      catch (err) { f.querySelector('#nickErr').textContent = err.message || 'משהו השתבש, נסו שוב'; btn.disabled = false; }
    };
  }

  // קטע בסיכום האתגר היומי
  async function renderDaily(root, st) {
    root.innerHTML = `<div class="lbwrap"><h3>הדירוג של היום</h3><p class="fine">טוען…</p></div>`;
    await ready;
    if (!registered()) {
      root.innerHTML = `<div class="lbwrap"><h3>הדירוג של היום</h3>${joinHtml('הצטרפו לטבלה כדי להשוות עם כולם')}</div>`;
      return wireJoin(root, () => renderDaily(root, st));
    }
    await submit(st);
    try {
      const rows = await today(st.date);
      const i = rows.findIndex(r => r.uid === me.uid);
      root.innerHTML = `<div class="lbwrap"><h3>הדירוג של היום${i >= 0 ? ` · אתם במקום ${i + 1} מתוך ${rows.length}` : ''}</h3>${tableHtml(rows, r => r.total)}</div>`;
    } catch (err) { root.innerHTML = `<div class="lbwrap"><h3>הדירוג של היום</h3><p class="fine">אין חיבור כרגע — הטבלה תופיע כשתחזור הרשת.</p></div>`; }
  }

  // לשונית "דירוג"
  let tab = 'today';
  async function show() {
    if (typeof overlay !== 'undefined') overlay.clearLayers();
    if (typeof fitIsrael === 'function') fitIsrael();
    const v = document.querySelector('#view');
    const date = Daily.today();
    v.innerHTML = `<div class="boardview"><div class="seg small" role="tablist">
        <button data-t="today" class="${tab === 'today' ? 'on' : ''}">היום</button>
        <button data-t="all" class="${tab === 'all' ? 'on' : ''}">כל הזמנים</button></div>
      <div id="bbody"><p class="fine">טוען…</p></div></div>`;
    v.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; show(); });
    const body = v.querySelector('#bbody');
    await ready;
    const head = registered() ? `<p class="mine">את/ה משחק/ת בתור <b>${e(me.name)}</b>${me.days ? ` · ${daysTxt(me.days)} · ${me.total.toLocaleString('he-IL')} נק'` : ''}</p>` : joinHtml('הצטרפו לטבלה עם כינוי — בלי סיסמה ובלי מייל');
    try {
      if (tab === 'today') {
        const rows = await today(date);
        body.innerHTML = head + `<h3>אתגר ${date.split('-').reverse().slice(0, 2).join('.')}</h3>` + tableHtml(rows, r => r.total);
      } else {
        const rows = await allTime();
        body.innerHTML = head + `<h3>סך הכל נקודות</h3>` + tableHtml(rows, r => r.total, r => `${daysTxt(r.days)} · שיא ${r.best.toLocaleString('he-IL')}`);
      }
    } catch (err) { body.innerHTML = head + `<p class="fine">אין חיבור לשרת כרגע. נסו שוב בעוד רגע.</p>`; }
    wireJoin(body, () => show());
  }

  return { show, renderDaily, submit, register, ready };
})();
