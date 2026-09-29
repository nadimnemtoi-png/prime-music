import { pushConfig, sendToSubscriptions, isQuietHoursRO } from './_webpush.js';

// Pentru profesor (apelat prin /api/push):
//   GET  ?a=status -> ce elevi au notificarile pornite si pe ce dispozitive
//   POST ?a=test   -> trimite o notificare de test unui elev (nu noaptea)

async function verifyTeacher(SB_URL, SERVICE_KEY, bearer) {
  if (!bearer) return false;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${bearer}` } });
    if (!r.ok) return false;
    const user = await r.json();
    return !!(user && user.id);
  } catch (e) {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function platformOf(ua) {
  const s = String(ua || '');
  if (/iPad/i.test(s) || (/Macintosh/i.test(s) && /Mobile\//i.test(s))) return 'iPad';
  if (/iPhone|iPod/i.test(s)) return 'iPhone';
  if (/Android/i.test(s)) return 'Android';
  if (/Windows/i.test(s)) return 'Windows';
  if (/Macintosh/i.test(s)) return 'Mac';
  return 'alt dispozitiv';
}

export default async function handler(req, res) {
  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await verifyTeacher(SB_URL, SERVICE_KEY, bearer))) return res.status(401).json({ error: 'Unauthorized' });

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const action = String((req.query && req.query.a) || '');

  try {
    if (action === 'status') {
      const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=student_id,user_agent,last_seen_at,last_sent_at&order=id&limit=5000`, { headers: sbHeaders });
      if (!r.ok) return res.status(502).json({ error: 'Supabase request failed' });
      const rows = await r.json();
      const students = {};
      rows.forEach((s) => {
        const e = students[s.student_id] || (students[s.student_id] = { devices: 0, platforms: [], last_seen_at: null, last_sent_at: null });
        e.devices++;
        const p = platformOf(s.user_agent);
        if (!e.platforms.includes(p)) e.platforms.push(p);
        if (s.last_seen_at && (!e.last_seen_at || s.last_seen_at > e.last_seen_at)) e.last_seen_at = s.last_seen_at;
        if (s.last_sent_at && (!e.last_sent_at || s.last_sent_at > e.last_sent_at)) e.last_sent_at = s.last_sent_at;
      });
      return res.status(200).json({ configured: !!pushConfig(), students });
    }

    if (action === 'test') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const cfg = pushConfig();
      if (!cfg) return res.status(200).json({ skipped: 'not_configured' });
      const studentId = String((req.body || {}).student_id || '');
      if (!UUID_RE.test(studentId)) return res.status(400).json({ error: 'Invalid student' });
      if (isQuietHoursRO()) return res.status(200).json({ skipped: 'quiet_hours' });
      const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?student_id=eq.${studentId}&select=id,endpoint,p256dh,auth`, { headers: sbHeaders });
      if (!r.ok) return res.status(502).json({ error: 'Supabase request failed' });
      const subs = await r.json();
      if (!subs.length) return res.status(200).json({ sent: 0, devices: 0 });
      const result = await sendToSubscriptions(subs, {
        title: '🔔 Test Prime School',
        body: 'Notificările funcționează! Așa afli când primești XP sau ai temă nouă.',
        tag: 'test', url: '/',
      }, { SB_URL, sbHeaders, cfg, ttlSeconds: 3600 });
      return res.status(200).json({ ...result, devices: subs.length });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
