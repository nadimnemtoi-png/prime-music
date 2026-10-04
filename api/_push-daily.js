import { pushConfig, sendToSubscriptions, hourRO, addInAppCards } from './_webpush.js';

// Doua reminderuri zilnice, trimise automat din Supabase (pg_cron), la ore
// fixe (ora Romaniei, tot anul):
//   • DIMINEATA, 07:00 (o data cu coada de noapte) — "Azi e ultima zi pentru
//     inregistrare": azi e ultima zi pentru inregistrarea de la ultima lectie
//     si elevul inca n-a trimis-o (aceeasi regula ca butonul din aplicatie).
//   • SEARA, 19:00 — "Streak in pericol": are un streak de 2+ zile si azi
//     inca n-a facut nimic — il pierde la miezul noptii. Elevii care n-au mai
//     intrat de 5+ zile (dar nu de mai mult de 60) primesc "Ti-am simtit
//     lipsa", cel mult o data la 7 zile.
// Fiecare rulare trimite cel mult O notificare pe elev, doar daca are rost.
//
// N-au nevoie de parola: fiecare ruleaza doar in ora ei (07:xx / 19:xx) si O
// SINGURA DATA pe zi (tabela push_runs) — un apel in plus, de oriunde, nu mai
// trimite nimic.

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

const WINBACK_MIN_DAYS = 5;
const WINBACK_MAX_DAYS = 60; // dupa doua luni fara nicio vizita, probabil a plecat — nu-l mai deranjam
// Mesajele "Ti-am simtit lipsa": 4 variante, se alterneaza — un elev nu primeste
// aceeasi varianta de doua ori la rand. Emoji-ul si numele instrumentului
// depind de instrumentul elevului (Pian / Chitară / altceva).
const instEmoji = (i) => (i === 'Pian' ? '🎹' : i === 'Chitară' ? '🎸' : '🎵');
const WINBACK_VARIANTS = [
  { title: () => '🎵 Ți-am simțit lipsa!', body: (n) => `Au trecut ${n} zile de la ultima ta vizită. Intră la un joc de 2 minute, te așteptăm!` },
  { title: (i) => `${instEmoji(i)} ${i === 'Pian' ? 'Pianul te așteaptă' : i === 'Chitară' ? 'Chitara te așteaptă' : 'Muzica te așteaptă'}`, body: (n) => `${n} zile fără tine. Un exercițiu scurt și ești din nou în ritm!` },
  { title: () => '👋 Hei, mai ești pe aici?', body: (n) => `Nu te-am mai văzut de ${n} zile. Vino să vezi ce ai mai câștigat!` },
  { title: (i) => `${instEmoji(i)} Te-am pierdut pe drum?`, body: (n) => `Au trecut ${n} zile. Intră puțin și vezi ce jocuri ai deblocat!` },
];
// Toate titlurile posibile (ca sa gasim ce varianta a primit elevul ultima data)
const WINBACK_ALL_TITLES = [...new Set(WINBACK_VARIANTS.flatMap((v) => ['Pian', 'Chitară', ''].map((i) => v.title(i))))];
const variantOfTitle = (t) => WINBACK_ALL_TITLES.findIndex((x) => x === t) >= 0
  ? WINBACK_VARIANTS.findIndex((v) => ['Pian', 'Chitară', ''].some((i) => v.title(i) === t)) : -1;
const WINBACK_LOOKBACK_DAYS = 70;

function makeHandler({ hour, kind, deadline, streak, winback }) {
  return async function handler(req, res) {
  if (hourRO() !== hour) return res.status(200).json({ skipped: 'not_time' });

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
    body: JSON.stringify({ day: runDay, kind }),
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

    const [students, lessons, practices, games, freezes, slots, visits, recentWinback] = await Promise.all([
      getAll(`students?id=${inList}&archived=is.false&select=id,access_blocked,instrument&order=id`),
      getAll(`lessons?student_id=${inList}&date=gte.${since.slice(0, 10)}&select=student_id,date,created_at,present,tema&order=date.desc,created_at.desc`),
      getAll(`practice_logs?student_id=${inList}&created_at=gte.${since}&select=student_id,type,created_at,week_start&order=id`),
      getAll(`game_scores?student_id=${inList}&played_at=gte.${since}&select=student_id,played_at&order=id`),
      getAll(`streak_freezes?student_id=${inList}&select=student_id,date&order=student_id`),
      getAll('schedule_slots?select=day,student_id,student_id_2,student_ids,is_empty&order=id'),
      winback ? getAll(`site_visits?student_id=${inList}&created_at=gte.${since}&select=student_id,created_at&order=id`) : Promise.resolve([]),
      winback ? getAll(`notifications?student_id=${inList}&title=in.(${WINBACK_ALL_TITLES.map((t) => encodeURIComponent(`"${t}"`)).join(',')})&created_at=gte.${new Date(Date.now() - WINBACK_LOOKBACK_DAYS * 86400000).toISOString()}&select=student_id,title,created_at&order=created_at.desc`) : Promise.resolve([]),
    ]);
    // Ultimul mesaj "lipsa" primit de fiecare elev (lista e deja cea mai noua intai)
    const lastWinback = {};
    recentWinback.forEach((r) => { if (!lastWinback[r.student_id]) lastWinback[r.student_id] = r; });
    const winbackSent = new Set(Object.values(lastWinback).filter((r) => Date.now() - new Date(r.created_at).getTime() < 6.5 * 86400000).map((r) => r.student_id));

    const todayYmd = ymdInTZ(new Date());
    const by = (rows, key = 'student_id') => rows.reduce((m, r) => ((m[r[key]] = m[r[key]] || []).push(r), m), {});
    const lessonsBy = by(lessons), practicesBy = by(practices), gamesBy = by(games), freezesBy = by(freezes), visitsBy = by(visits);
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
      if (deadline && last && last.tema) {
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
            s.day === day && !s.is_empty && (s.student_id === sid || s.student_id_2 === sid || (Array.isArray(s.student_ids) && s.student_ids.includes(sid)))));
          if (recordingCutoffYmd(days, last.date) === todayYmd) {
            message = {
              title: '🎙 Azi e ultima zi pentru înregistrare',
              body: 'Trimite-o până la 23:59 — profesorul o ascultă înainte de lecția de mâine.',
              tag: 'deadline', url: '/?notifs=deadline', icon: '🎙',
            };
          }
        }
      }

      // 2) Streak in pericol — aceeasi regula ca in streak-bonus.js
      if (streak && !message) {
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
              tag: 'streak', url: '/?notifs=streak', icon: '🔥',
            };
          }
        }
      }

      // 3) "Ti-am simtit lipsa" — n-a mai intrat de 5+ zile (vizita, joc sau repetitie)
      if (winback && !message && !winbackSent.has(sid)) {
        let last = null;
        const bump = (t) => { if (t && (!last || t > last)) last = t; };
        (visitsBy[sid] || []).forEach((v) => bump(v.created_at));
        pr.forEach((p) => bump(p.created_at));
        (gamesBy[sid] || []).forEach((g) => bump(g.played_at));
        if (last) {
          const daysAway = Math.round((new Date(todayYmd + 'T12:00:00Z') - new Date(ymdInTZ(new Date(last)) + 'T12:00:00Z')) / 86400000);
          if (daysAway >= WINBACK_MIN_DAYS && daysAway <= WINBACK_MAX_DAYS) {
            // Varianta urmatoare celei primite ultima data; prima data, una
            // aleasa dupa elev (ca sa nu primeasca toti aceeasi).
            const prev = lastWinback[sid] ? variantOfTitle(lastWinback[sid].title) : -1;
            const idx = prev >= 0 ? (prev + 1) % WINBACK_VARIANTS.length
              : parseInt(String(sid).replace(/[^0-9a-f]/gi, '').slice(0, 6), 16) % WINBACK_VARIANTS.length;
            const v = WINBACK_VARIANTS[idx];
            message = {
              title: v.title(st.instrument),
              body: v.body(daysAway),
              tag: 'winback', url: '/?notifs=winback', icon: instEmoji(st.instrument),
            };
          }
        }
      }

      if (message) plan.push({ sid, message, subs: subsBy[sid] || [] });
    }

    // Cardul din panoul aplicatiei (elevul il gaseste dupa ce apasa pe notificare)
    await addInAppCards(plan.map((p) => ({ student_id: p.sid, icon: p.message.icon, title: p.message.title, message: p.message.body })), { SB_URL, sbHeaders });

    let sent = 0, removed = 0;
    const results = await Promise.all(plan.map((p) =>
      sendToSubscriptions(p.subs, { title: p.message.title, body: p.message.body, tag: p.message.tag, url: p.message.url }, { SB_URL, sbHeaders, cfg, ttlSeconds: 5 * 3600 })));
    results.forEach((r) => { sent += r.sent; removed += r.removed; });
    return res.status(200).json({ today: todayYmd, students: students.length, notified: plan.length, sent, removed });
  } catch (e) {
    console.error(`push-daily (${kind}) failed`, e);
    return res.status(500).json({ error: 'Server error' });
  }
  };
}

// Seara la 19:00 — streak in pericol
export default makeHandler({ hour: 19, kind: 'evening', deadline: false, streak: true, winback: true });
// Dimineata la 07:00 — ultima zi pentru inregistrare
export const deadlineMorning = makeHandler({ hour: 7, kind: 'deadline', deadline: true, streak: false });
