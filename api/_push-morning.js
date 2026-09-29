import { pushConfig, sendToSubscriptions, isQuietHoursRO } from './_webpush.js';

// Trimite la 07:00 (ora Romaniei) notificarile puse la coada noaptea
// (XP / parere / tema date de profesor intre 22:00 si 07:00).
//
// E apelat automat din Supabase (pg_cron) la 07:00 fix, tot anul. N-are nevoie
// de parola: trimite DOAR ce e deja la coada, sterge mesajele dupa trimitere
// (deci un al doilea apel nu mai trimite nimic) si refuza sa trimita cat timp
// e inca "noapte" (22:00–07:00) — oricine l-ar apela, nu poate trezi elevii.

export default async function handler(req, res) {
  if (isQuietHoursRO()) return res.status(200).json({ skipped: 'quiet_hours' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const cfg = pushConfig();
  if (!SERVICE_KEY || !cfg) return res.status(500).json({ error: 'Server not configured' });
  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    const qRes = await fetch(`${SB_URL}/rest/v1/push_queue?select=id,student_id,title,body,tag,url&order=id&limit=1000`, { headers: sbHeaders });
    if (!qRes.ok) return res.status(502).json({ error: 'Supabase request failed' });
    const queue = await qRes.json();
    if (!queue.length) return res.status(200).json({ queued: 0, sent: 0 });

    // Scoatem imediat mesajele din coada, inainte sa le trimitem — asa, daca
    // functia e apelata de doua ori in acelasi timp, nimeni nu le primeste dublu.
    const ids = queue.map((q) => q.id);
    const del = await fetch(`${SB_URL}/rest/v1/push_queue?id=in.(${ids.join(',')})`, {
      method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=representation' },
    });
    if (!del.ok) return res.status(502).json({ error: 'Supabase request failed' });
    const claimed = await del.json();
    if (!claimed.length) return res.status(200).json({ queued: 0, sent: 0 });

    const studentIds = [...new Set(claimed.map((q) => q.student_id))];
    const sRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?student_id=in.(${studentIds.join(',')})&select=id,student_id,endpoint,p256dh,auth`, { headers: sbHeaders });
    if (!sRes.ok) return res.status(502).json({ error: 'Supabase request failed' });
    const subs = await sRes.json();

    let sent = 0, removed = 0;
    await Promise.all(claimed.map(async (q) => {
      const mine = subs.filter((s) => s.student_id === q.student_id);
      if (!mine.length) return;
      const r = await sendToSubscriptions(mine, { title: q.title, body: q.body, tag: q.tag || 'prime-school', url: q.url || '/' },
        { SB_URL, sbHeaders, cfg, ttlSeconds: 5 * 3600 });
      sent += r.sent; removed += r.removed;
    }));
    return res.status(200).json({ queued: claimed.length, sent, removed });
  } catch (e) {
    console.error('push-morning failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
