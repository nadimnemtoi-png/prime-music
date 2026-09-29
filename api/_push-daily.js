import { pushConfig, sendToSubscriptions, hourRO } from './_webpush.js';

// Reminderul de seara, la 19:00 fix (ora Romaniei, tot anul) — apelat automat
// din Supabase (pg_cron). Maxim O notificare pe elev, doar daca are rost:
//   1) azi e ultima zi pentru inregistrarea de la ultima lectie si inca n-a
//      trimis-o (aceeasi regula ca butonul de inregistrare din aplicatie);
//   2) altfel, are un streak de 2+ zile si azi inca n-a facut nimic — il
//      pierde la miezul noptii.
// Elevii activi azi / fara streak / fara termen azi nu primesc nimic.
//
// N-are nevoie de parola: ruleaza doar intre 19:00 si 19:59 si O SINGURA DATA
// pe zi (tabela push_runs) — un apel in plus, de oriunde, nu mai trimite nimic.
const SEND_HOUR = 19;

const TZ = 'Europe/Bucharest';
const ymdInTZ = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
function addDaysYmd(ymd, days) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const dowOfYmd = (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay();
// Aceleasi zile ca DAY_TO_JSDOW din index.html
const DAY_TO_JSDOW = { Luni: 1, 'Marți': 2, Miercuri: 3, Joi: 4, Vineri: 5, 'Sâmbătă': 6 };

// Aceeasi regula ca getRecordingCutoff() din index.html: ziua dinaintea
// urmatoarei lectii din orar, STRICT dupa data ultimei lectii.
function recordingCutoffYmd(scheduleDays, lessonYmd) {
  if (!scheduleDays.length || !lessonYmd) return null;
  const baseDow = dowOfYmd(lessonYmd);
  let best = null;
  scheduleDays.forEach((day) => {
    const t = DAY_TO_JSDOW[day];
    if (t === undefined) return;
    let after = (t - baseDow + 7) % 7;
    if (after === 0) after = 7;
    if (best === null || after < best) best = after;
  });
  return best === null ? null : addDaysYmd(lessonYmd, best - 1);
}

export default async function handler(req, res) {
  if (hourRO() !== SEND_HOUR) return res.status(200).json({ skipped: 'not_time' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const cfg = pushConfig();
  if (!SERVICE_KEY || !cfg) return res.status(500).json({ error: 'Server not configured' });
  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  // O singura rulare pe zi: prima care reuseste sa scrie ziua de azi in
  // push_runs trimite; toate celelalte apeluri din aceeasi zi se opresc aici.
  const runDay = ymdInTZ(new Date());
  const claim = await fetch(`${SB_URL}/rest/v1/push_runs?on_conflict=day,kind`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ day: runDay, kind: 'evening' }),
  }).catch(() => null);
  if (!claim || !claim.ok) return res.status(502).json({ error: 'Supabase request failed' });
  const claimed = await claim.json().catch(() => []);
  if (!Array.isArray(claimed) || !claimed.length) return res.status(200).json({ skipped: 'already_ran_today' });

  const get = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    return r.json();
  };
  const getAll = async (path) => {
    let all = [], offset = 0;
    while (true) {
      const page = await get(`${path}&limit=1000&offset=${offset}`);
      all = all.concat(page);
      if (page.length < 1000) break;
      offset += 1000;
    }
    return all;
  };

  try {
    const subs = await getAll('push_subscriptions?select=id,student_id,endpoint,p256dh,auth&order=id');
    const ids = [...new Set(subs.map((s) => s.student_id))];
    if (!ids.length) return res.status(200).json({ students: 0, sent: 0 });
    const inList = `in.(${ids.join(',')})`;
    const since = new Date(Date.now() - 90 * 86400000).toISOString();

    const [students, lessons, practices, games, freezes, slots] = await Promise.all([
      getAll(`students?id=${inList}&archived=is.false&select=id,access_blocked&order=id`),
      getAll(`lessons?student_id=${inList}&date=gte.${since.slice(0, 10)}&select=student_id,date,created_at,present,tema&order=date.desc,created_at.desc`),
      getAll(`practice_logs?student_id=${inList}&created_at=gte.${since}&select=student_id,type,created_at,week_start&order=id`),
      getAll(`game_scores?student_id=${inList}&played_at=gte.${since}&select=student_id,played_at&order=id`),
      getAll(`streak_freezes?student_id=${inList}&select=student_id,date&order=student_id`),
      getAll('schedule_slots?select=day,student_id,student_id_2,is_empty&order=id'),
    ]);

    const todayYmd = ymdInTZ(new Date());
    const by = (rows, key = 'student_id') => rows.reduce((m, r) => ((m[r[key]] = m[r[key]] || []).push(r), m), {});
    const lessonsBy = by(lessons), practicesBy = by(practices), gamesBy = by(games), freezesBy = by(freezes);
    const subsBy = by(subs);

    const plan = [];
    for (const st of students) {
      if (st.access_blocked) continue;
      const sid = st.id;
      const ls = lessonsBy[sid] || [];
      const pr = practicesBy[sid] || [];

      // 1) Termenul pentru inregistrare — aceeasi logica ca practiceSection din renderElev
      let message = null;
      const last = ls[0];
      if (last && last.tema) {
        const counted = pr.filter((p) => p.type);
        const lastPractice = counted.reduce((a, b) => {
          const ta = new Date(a.created_at || a.week_start || 0).getTime();
          const tb = new Date(b.created_at || b.week_start || 0).getTime();
          return tb > ta ? b : a;
        }, counted[0] || null);
        const lastPresent = ls.find((l) => l.present !== false) || null;
        const lastPresentTime = lastPresent ? new Date(lastPresent.created_at || lastPresent.date).getTime() : null;
        const done = !!(lastPresent && lastPractice && new Date(lastPractice.created_at || lastPractice.week_start || 0).getTime() >= lastPresentTime);
        const wasAbsent = last.present === false;
        if (!done && !wasAbsent) {
          const days = Object.keys(DAY_TO_JSDOW).filter((day) => slots.some((s) =>
            s.day === day && !s.is_empty && (s.student_id === sid || s.student_id_2 === sid)));
          if (recordingCutoffYmd(days, last.date) === todayYmd) {
            message = {
              title: '🎙 Azi e ultima zi pentru înregistrare',
              body: 'Trimite-o până la 23:59 — profesorul o ascultă înainte de lecția de mâine.',
              tag: 'deadline', url: '/',
            };
          }
        }
      }

      // 2) Streak in pericol — aceeasi regula ca in streak-bonus.js
      if (!message) {
        const daySet = new Set();
        pr.forEach((p) => { if (p.created_at) daySet.add(ymdInTZ(new Date(p.created_at))); });
        (gamesBy[sid] || []).forEach((g) => { if (g.played_at) daySet.add(ymdInTZ(new Date(g.played_at))); });
        (freezesBy[sid] || []).forEach((f) => { if (f.date) daySet.add(f.date); });
        if (!daySet.has(todayYmd)) {
          let streak = 0;
          let cursor = addDaysYmd(todayYmd, -1);
          while (daySet.has(cursor)) { streak++; cursor = addDaysYmd(cursor, -1); }
          if (streak >= 2) {
            message = {
              title: `🔥 Streak de ${streak} zile în pericol!`,
              body: 'Un joc de 2 minute azi și îl păstrezi. Se pierde la miezul nopții.',
              tag: 'streak', url: '/',
            };
          }
        }
      }

      if (message) plan.push({ sid, message, subs: subsBy[sid] || [] });
    }

    let sent = 0, removed = 0;
    const results = await Promise.all(plan.map((p) =>
      sendToSubscriptions(p.subs, p.message, { SB_URL, sbHeaders, cfg, ttlSeconds: 5 * 3600 })));
    results.forEach((r) => { sent += r.sent; removed += r.removed; });
    return res.status(200).json({ today: todayYmd, students: students.length, notified: plan.length, sent, removed });
  } catch (e) {
    console.error('push-daily failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
