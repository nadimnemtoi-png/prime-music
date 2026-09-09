-- RULEAZA O SINGURA DATA (dar e sigur si daca il rulezi de doua ori din
-- greseala — nu acorda de doua ori acelasi bonus). Acorda retroactiv monedele
-- pentru prezenta la lectii si pentru streak-urile deja existente ale
-- elevilor, de dinainte sa introducem sistemul de monede, ca sa nu piarda ce
-- au facut deja. Trimite si o notificare fiecarui elev care a primit ceva.
--
-- IMPORTANT: ruleaza ASTA DUPA ce ai rulat deja coins_migration.sql (sau
-- update_streak_bonus.sql) si notifications_migration.sql.

begin;

create temporary table backfill_totals (student_id uuid primary key, amount integer not null default 0) on commit drop;

-- 1) Prezenta la lectii deja inregistrate — 10 monede pentru fiecare lectie cu
-- present=true, o singura data per elev (marcat prin coins_attendance_backfilled,
-- ca sa nu se acorde din nou daca rulezi scriptul de doua ori).
alter table students add column if not exists coins_attendance_backfilled boolean not null default false;

create temporary table attendance_applied on commit drop as
with attendance_counts as (
  select student_id, count(*) as cnt
  from lessons
  where present = true
  group by student_id
),
applied as (
  update students s
  set coins = s.coins + (ac.cnt * 10),
      coins_attendance_backfilled = true
  from attendance_counts ac
  where s.id = ac.student_id
    and s.coins_attendance_backfilled = false
  returning s.id as student_id, ac.cnt * 10 as amount
)
select * from applied;

insert into coin_ledger(student_id, amount, reason)
select student_id, amount, 'lesson_attendance_backfill' from attendance_applied;

insert into backfill_totals(student_id, amount)
select student_id, amount from attendance_applied
on conflict (student_id) do update set amount = backfill_totals.amount + excluded.amount;

-- 2) Streak-ul curent al fiecarui elev (zile consecutive cu joc jucat sau
-- inregistrare trimisa, calculat exact ca in api/streak-bonus.js) — acorda
-- bonusul progresiv (20/25/30/35...) prin aceeasi functie folosita si live,
-- deci e sigur si aici la rulari repetate.
do $$
declare
  rec record;
  v_cursor date;
  v_has boolean;
  v_streak integer;
  v_result record;
begin
  for rec in select id from students loop
    v_cursor := (now() at time zone 'Europe/Bucharest')::date;
    select exists(
      select 1 from practice_logs where student_id = rec.id and (created_at at time zone 'Europe/Bucharest')::date = v_cursor
      union all
      select 1 from game_scores where student_id = rec.id and (played_at at time zone 'Europe/Bucharest')::date = v_cursor
    ) into v_has;
    if not v_has then
      v_cursor := v_cursor - 1;
    end if;
    v_streak := 0;
    loop
      select exists(
        select 1 from practice_logs where student_id = rec.id and (created_at at time zone 'Europe/Bucharest')::date = v_cursor
        union all
        select 1 from game_scores where student_id = rec.id and (played_at at time zone 'Europe/Bucharest')::date = v_cursor
      ) into v_has;
      exit when not v_has;
      v_streak := v_streak + 1;
      v_cursor := v_cursor - 1;
    end loop;
    if v_streak > 0 then
      select * into v_result from award_streak_coins(rec.id, v_streak, 20, 5);
      if v_result.awarded > 0 then
        insert into backfill_totals(student_id, amount) values (rec.id, v_result.awarded)
        on conflict (student_id) do update set amount = backfill_totals.amount + excluded.amount;
      end if;
    end if;
  end loop;
end $$;

-- 3) O singura notificare pe elev, cu totalul primit (prezenta + streak la un loc)
insert into notifications(student_id, title, message, icon)
select student_id,
       '🎉 Ai primit ' || amount || ' monede!',
       'Bonus pentru prezența și activitatea ta de până acum, de când am introdus monedele în aplicație.',
       '🪙'
from backfill_totals
where amount > 0;

commit;
