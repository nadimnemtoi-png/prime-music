-- Curata evenimentele duplicate de "s-a conectat" generate de bug-ul de dinainte
-- (aparea de mai multe ori la rand, la cateva minute distanta, pentru acelasi
-- elev, in aceeasi zi). Ruleaza o singura data in Supabase -> SQL Editor
-- (Run without RLS). Pastreaza doar PRIMA aparitie per elev/zi, o sterge pe
-- restul. Nu afecteaza celelalte tipuri de evenimente (spin, streak, nivel, top 5).

begin;

delete from teacher_activity t
using teacher_activity t2
where t.type = 'connect'
  and t2.type = 'connect'
  and t.student_id = t2.student_id
  and date(t.created_at at time zone 'Europe/Bucharest') = date(t2.created_at at time zone 'Europe/Bucharest')
  and (t.created_at, t.id) > (t2.created_at, t2.id);

commit;
