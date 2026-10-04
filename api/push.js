// Un singur endpoint pentru tot ce tine de notificarile pe telefon — planul
// gratuit Vercel accepta cel mult 12 functii in /api, asa ca nu adaugam cate
// una pentru fiecare actiune. Logica e in fisierele care incep cu "_" (pe
// acelea Vercel nu le transforma in functii separate).
//
//   GET  /api/push?a=key          cheia publica (telefonul elevului)
//   POST /api/push?a=subscribe    salveaza abonamentul (token elev)
//   POST /api/push?a=unsubscribe  sterge abonamentul (token elev)
//   POST /api/push?a=notify       XP / parere / tema noua (token profesor)
//   GET  /api/push?a=status       cine are notificarile pornite (token profesor)
//   POST /api/push?a=test         notificare de test (token profesor)
//   *    /api/push?a=morning      07:00 — coada de noapte + "ultima zi pentru inregistrare" (pg_cron)
//   *    /api/push?a=evening      19:00 — "streak in pericol" (pg_cron)
//   POST /api/push?a=tsubscribe   telefonul PROFESORULUI (post-it-uri cu ora)
//   POST /api/push?a=tunsubscribe / ?a=ttest
//   *    /api/push?a=reminders    la 5 minute — post-it-urile scadente (pg_cron)

import subscribe from './_push-subscribe.js';
import notify from './_push-notify.js';
import admin from './_push-admin.js';
import morning from './_push-morning.js';
import evening, { deadlineMorning } from './_push-daily.js';
import teacherPush from './_push-teacher.js';

export default async function handler(req, res) {
  const a = String((req.query && req.query.a) || '');
  if (a === 'key' || a === 'subscribe' || a === 'unsubscribe') return subscribe(req, res);
  if (a === 'notify') return notify(req, res);
  if (a === 'tsubscribe' || a === 'tunsubscribe' || a === 'ttest' || a === 'reminders') return teacherPush(req, res);
  if (a === 'status' || a === 'test') return admin(req, res);
  if (a === 'morning') {
    // 07:00: intai coada de noapte, apoi "ultima zi pentru inregistrare".
    // Fiecare isi scrie propriul raspuns; il adunam intr-unul singur.
    const out = {};
    const capture = (name) => ({
      status() { return this; },
      setHeader() {},
      json(body) { out[name] = body; return this; },
    });
    await morning(req, capture('queue'));
    await deadlineMorning(req, capture('deadline'));
    return res.status(200).json(out);
  }
  if (a === 'evening') return evening(req, res);
  return res.status(404).json({ error: 'Not found' });
}
