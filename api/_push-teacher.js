import { getTeacher } from './_teacher-auth.js';
import { pushConfig, sendPush } from './_webpush.js';

// Notificarile pe telefon ale PROFESORULUI (post-it-uri cu ora), prin /api/push:
//   POST ?a=tsubscribe    salveaza abonamentul telefonului (token profesor)
//   POST ?a=tunsubscribe  sterge abonamentul (token profesor)
//   POST ?a=ttest         notificare de test pe telefoanele profesorului
//   *    ?a=reminders     apelat de pg_cron la 5 minute: trimite post-it-urile
//                         a caror ora a venit. N-are nevoie de parola: trimite
//                         DOAR ce e scadent si marcheaza imediat ca trimis, deci
//                         un al doilea apel nu mai trimite nimic.

const isB64u = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+=*$/.test(s);

async function sendToTeacherSubs(subs, message, { SB_URL, sbHeaders, cfg }) {
  const results = await Promise.all(subs.map((s) => sendPush(s, message, cfg, 6 * 3600)));
  const goneIds = subs.filter((s, i) => results[i].gone).map((s) => s.id);
  const okIds = subs.filter((s, i) => results[i].ok).map((s) => s.id);
  const writes = [];
  if (goneIds.length) writes.push(fetch(`${SB_URL}/rest/v1/teacher_push_subscriptions?id=in.(${goneIds.join(',')})`, {
    method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' } }).catch(() => {}));
  if (okIds.length) writes.push(fetch(`${SB_URL}/rest/v1/teacher_push_subscriptions?id=in.(${okIds.join(',')})`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ last_sent_at: new Date().toISOString() }) }).catch(() => {}));
  if (writes.length) await Promise.all(writes);
  return { sent: okIds.length, removed: goneIds.length };
}

export default async function handler(req, res) {
  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const cfg = pushConfig();
  if (!SERVICE_KEY || !cfg) return res.status(500).json({ error: 'Server not configured' });
  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const action = String((req.query && req.query.a) || '');

  try {
    if (action === 'reminders') {
      const nowIso = new Date().toISOString();
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // nu trimitem remindere vechi de peste o zi
      // "revendicam" post-it-urile scadente marcandu-le ca trimise, intr-un singur pas
      const cl = await fetch(`${SB_URL}/rest/v1/teacher_notes?reminded_at=is.null&done=is.false&remind_at=lte.${encodeURIComponent(nowIso)}&remind_at=gte.${encodeURIComponent(since)}&select=id,teacher_id,text,items`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ reminded_at: nowIso }),
      });
      if (!cl.ok) return res.status(502).json({ error: 'Supabase request failed' });
      const due = await cl.json();
      if (!due.length) return res.status(200).json({ due: 0, sent: 0 });

      const tIds = [...new Set(due.map((n) => n.teacher_id))];
      const sr = await fetch(`${SB_URL}/rest/v1/teacher_push_subscriptions?teacher_id=in.(${tIds.join(',')})&select=id,teacher_id,endpoint,p256dh,auth`, { headers: sbHeaders });
      if (!sr.ok) return res.status(502).json({ error: 'Supabase request failed' });
      const subs = await sr.json();

      let sent = 0, removed = 0;
      await Promise.all(due.map(async (n) => {
        const mine = subs.filter((s) => s.teacher_id === n.teacher_id);
        if (!mine.length) return;
        let body = String(n.text || '').slice(0, 180);
        if (Array.isArray(n.items)) {
          const left = n.items.filter((x) => x && !x.d).map((x) => x.t);
          if (left.length) body += ': ' + left.slice(0, 6).join(', ') + (left.length > 6 ? '…' : '');
        }
        const r = await sendToTeacherSubs(mine, { title: '📌 Post-it', body, tag: `note-${n.id}`, url: '/' }, { SB_URL, sbHeaders, cfg });
        sent += r.sent; removed += r.removed;
      }));
      return res.status(200).json({ due: due.length, sent, removed });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const teacher = await getTeacher(SB_URL, SERVICE_KEY, bearer);
    if (!teacher) return res.status(401).json({ error: 'Invalid token' });
    const body = req.body || {};

    if (action === 'tunsubscribe') {
      const endpoint = String(body.endpoint || '');
      if (!endpoint.startsWith('https://')) return res.status(400).json({ error: 'Invalid endpoint' });
      await fetch(`${SB_URL}/rest/v1/teacher_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&teacher_id=eq.${teacher.id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' } });
      return res.status(200).json({ removed: true });
    }

    if (action === 'tsubscribe') {
      const sub = body.subscription || {};
      const endpoint = String(sub.endpoint || '');
      const keys = sub.keys || {};
      if (!endpoint.startsWith('https://') || endpoint.length > 1000) return res.status(400).json({ error: 'Invalid endpoint' });
      if (!isB64u(keys.p256dh, 80, 100) || !isB64u(keys.auth, 16, 30)) return res.status(400).json({ error: 'Invalid keys' });
      const r = await fetch(`${SB_URL}/rest/v1/teacher_push_subscriptions?on_conflict=endpoint`, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ teacher_id: teacher.id, endpoint, p256dh: keys.p256dh, auth: keys.auth,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 300), last_seen_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(502).json({ error: 'save_failed' });
      return res.status(200).json({ saved: true });
    }

    if (action === 'ttest') {
      const sr = await fetch(`${SB_URL}/rest/v1/teacher_push_subscriptions?teacher_id=eq.${teacher.id}&select=id,teacher_id,endpoint,p256dh,auth`, { headers: sbHeaders });
      const subs = sr.ok ? await sr.json() : [];
      if (!subs.length) return res.status(200).json({ sent: 0, devices: 0 });
      const r = await sendToTeacherSubs(subs, { title: '📌 Post-it', body: 'Notificările pentru post-it-uri merg pe acest telefon ✅', tag: 'note-test', url: '/' }, { SB_URL, sbHeaders, cfg });
      return res.status(200).json({ ...r, devices: subs.length });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
