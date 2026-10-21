-- Prime School · LIGILE (înlocuiesc „Elevul lunii”) · pregătit 21.10.2026, pornesc duminică 01.11.2026 la 00:00
-- Rundă săptămânală (luni 00:00 – duminică 23:59, ora României), separat pe profesor.
-- Prima rundă e mai lungă: 1–8 noiembrie (duminica de 1 noiembrie + săptămâna 2–8).
-- 5 ligi: 1 Pianissimo · 2 Piano · 3 Mezzo · 4 Forte · 5 Fortissimo.
-- XP-ul care contează = XP din jocuri (game_scores.played_at) + XP pentru înregistrări
-- (practice_logs.xp_rating, în săptămâna în care l-a dat profesorul = xp_at).
-- Nu se întâmplă nimic până la league_start(): înainte, league_board() răspunde {active:false}.
-- Sigur de rulat de mai multe ori. Totul într-o singură tranzacție.
begin;

-- ── 1. Coloane noi ─────────────────────────────────────────────────────────────
alter table public.students add column if not exists league smallint;
alter table public.students drop constraint if exists students_league_chk;
alter table public.students add constraint students_league_chk check (league is null or league between 1 and 5);

-- Când a primit XP o înregistrare (ca XP-ul să cadă în săptămâna în care a fost dat)
alter table public.practice_logs add column if not exists xp_at timestamptz;
update public.practice_logs set xp_at = coalesce(last_activity_at, created_at)
 where xp_at is null and coalesce(xp_rating,0) > 0;
create or replace function public.practice_logs_xp_at() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if coalesce(new.xp_rating,0) <= 0 then new.xp_at := null;
  elsif tg_op = 'INSERT' or coalesce(old.xp_rating,0) <> coalesce(new.xp_rating,0) then new.xp_at := now();
  end if;
  return new;
end $fn$;
-- (numele începe după „practice_logs_student_guard”, deci rulează DUPĂ el)
drop trigger if exists practice_logs_xp_at on public.practice_logs;
create trigger practice_logs_xp_at before insert or update on public.practice_logs
  for each row execute function public.practice_logs_xp_at();

-- ── 2. Tabele ───────────────────────────────────────────────────────────────────
create table if not exists public.league_results (
  week_start  date not null,
  student_id  uuid not null references public.students(id) on delete cascade,
  teacher_id  uuid,
  league      smallint not null,       -- liga în care a jucat săptămâna asta
  rank        smallint not null,       -- locul în ligă
  members     smallint not null,       -- câți elevi erau în ligă
  xp          integer  not null default 0,
  move        smallint not null default 0,   -- 1 urcă · 0 rămâne · -1 coboară
  new_league  smallint not null,
  coins       integer  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (week_start, student_id)
);
create index if not exists league_results_teacher_idx on public.league_results(teacher_id, week_start);
create table if not exists public.league_weeks (      -- ce săptămâni au fost deja încheiate (per profesor)
  week_start date not null,
  teacher_id uuid not null,
  done_at    timestamptz not null default now(),
  primary key (week_start, teacher_id)
);
revoke all on public.league_results, public.league_weeks from anon, authenticated;
grant select on public.league_results, public.league_weeks to authenticated;   -- doar citire, filtrată de regulile de mai jos
alter table public.league_results enable row level security;
alter table public.league_weeks  enable row level security;
drop policy if exists "student reads own league results" on public.league_results;
create policy "student reads own league results" on public.league_results for select to authenticated
  using (nullif(auth.jwt()->>'student_id','')::uuid = student_id);
drop policy if exists "teacher reads league results" on public.league_results;
create policy "teacher reads league results" on public.league_results for select to authenticated
  using ((auth.jwt()->>'student_id') is null and (public.is_admin() or teacher_id = public.my_teacher_id()));
drop policy if exists "teacher reads league weeks" on public.league_weeks;
create policy "teacher reads league weeks" on public.league_weeks for select to authenticated
  using ((auth.jwt()->>'student_id') is null and (public.is_admin() or teacher_id = public.my_teacher_id()));

-- ── 3. Calendarul ───────────────────────────────────────────────────────────────
create or replace function public.league_start() returns date
language sql immutable as $fn$ select date '2026-11-01' $fn$;
-- prima rundă: luni-ul de la sau după start (start duminică 1.11 → luni 2.11); ea începe totuși la start
create or replace function public.league_first_week() returns date
language sql stable as $fn$ select (date_trunc('week', (league_start() + 6)::timestamp))::date $fn$;
-- luni-ul săptămânii (ora României)
create or replace function public.league_week_start(ts timestamptz default now()) returns date
language sql stable as $fn$ select (date_trunc('week', ts at time zone 'Europe/Bucharest'))::date $fn$;
-- miezul nopții (ora României) al unei zile, ca timestamptz
create or replace function public.league_ts(d date) returns timestamptz
language sql stable as $fn$ select (d::timestamp at time zone 'Europe/Bucharest') $fn$;
-- de când se adună XP pentru runda w (prima rundă: de la start, nu de luni)
create or replace function public.league_week_from(w date) returns timestamptz
language sql stable as $fn$ select case when w = league_first_week() then league_ts(least(league_start(), w)) else league_ts(w) end $fn$;

-- ── 4. XP-ul elevilor unui profesor între a și b ─────────────────────────────────
create or replace function public.league_xp(p_teacher uuid, a timestamptz, b timestamptz)
returns table(student_id uuid, xp integer, last_at timestamptz)
language sql stable security definer set search_path = public as $fn$
  with ev as (
    select g.student_id, g.xp_gained as xp, g.played_at as at
      from game_scores g join students s on s.id = g.student_id
     where s.teacher_id = p_teacher and g.played_at >= a and g.played_at < b and g.xp_gained > 0
    union all
    select p.student_id, p.xp_rating, p.xp_at
      from practice_logs p join students s on s.id = p.student_id
     where s.teacher_id = p_teacher and p.xp_at >= a and p.xp_at < b and p.xp_rating > 0
  )
  select ev.student_id, sum(ev.xp)::int, max(ev.at) from ev group by ev.student_id
$fn$;

-- ── 5. Liga de start (doar elevii care nu au încă ligă) ─────────────────────────
-- După XP-ul din octombrie 2026: primul sfert → Mezzo (3), al doilea sfert → Piano (2),
-- restul și cei fără XP → Pianissimo (1). Elevii noi (fără XP în octombrie) → Pianissimo.
create or replace function public.league_seed(p_teacher uuid) returns void
language sql security definer set search_path = public as $fn$
  with oct as (select * from league_xp(p_teacher, league_ts(date '2026-10-01'), league_ts(date '2026-11-01'))),
  r as (
    select s.id, coalesce(o.xp,0) as xp, count(*) over () as n,
           row_number() over (order by coalesce(o.xp,0) desc, o.last_at asc nulls last, s.id) as rn
      from students s left join oct o on o.student_id = s.id
     where s.teacher_id = p_teacher and not coalesce(s.archived,false)
  )
  update students s
     set league = case when r.xp > 0 and r.rn <= ceil(r.n/4.0) then 3
                       when r.xp > 0 and r.rn <= ceil(r.n/2.0) then 2
                       else 1 end
    from r
   where s.id = r.id and s.league is null
$fn$;

-- ── 6. Încheierea unei săptămâni pentru un profesor ─────────────────────────────
-- Urcă primii q (cu XP > 0), coboară ultimii q și oricine are 0 XP; q = 3 (9+ elevi),
-- 2 (5–8), 1 (1–4). Cine e singur în ligă urcă dacă a strâns XP (și coboară doar cu 0 XP).
-- Din Fortissimo nu se urcă, din Pianissimo nu se coboară.
-- Egalitate: câștigă cine a ajuns primul la acel XP. Monede: 30/20/10 pentru locurile
-- 1/2/3 (doar cu XP > 0 și doar în ligile cu cel puțin 3 elevi).
create or replace function public.league_close_week(p_teacher uuid, w date) returns void
language plpgsql security definer set search_path = public as $fn$
declare a timestamptz := league_week_from(w); b timestamptz := league_ts(w + 7);
begin
  if exists (select 1 from league_weeks where week_start = w and teacher_id = p_teacher) then return; end if;
  insert into league_results(week_start, student_id, teacher_id, league, rank, members, xp, move, new_league, coins)
  with x as (select * from league_xp(p_teacher, a, b)),
  m as (
    select s.id, coalesce(s.league,1) as lg, coalesce(x.xp,0) as xp, x.last_at
      from students s left join x on x.student_id = s.id
     where s.teacher_id = p_teacher and not coalesce(s.archived,false)
       and (s.created_at is null or s.created_at < b)
  ),
  r as (
    select m.*, row_number() over (partition by lg order by xp desc, last_at asc nulls last, id) as rk,
           count(*) over (partition by lg) as n
      from m
  ),
  z as (select r.*, case when n >= 9 then 3 when n >= 5 then 2 else 1 end as q from r),
  d as (
    select z.*, case when lg < 5 and xp > 0 and rk <= q then 1
                     when lg > 1 and (xp = 0 or (n >= 2 and rk > n - q)) then -1
                     else 0 end as mv
      from z
  )
  select w, id, p_teacher, lg, rk, n, xp, mv, lg + mv,
         case when xp > 0 and n >= 3 then (case rk when 1 then 30 when 2 then 20 when 3 then 10 else 0 end) else 0 end
    from d
  on conflict (week_start, student_id) do nothing;

  update students s set league = r.new_league
    from league_results r where r.week_start = w and r.teacher_id = p_teacher and r.student_id = s.id;
  update students s set coins = coalesce(s.coins,0) + r.coins
    from league_results r where r.week_start = w and r.teacher_id = p_teacher and r.student_id = s.id and r.coins > 0;
  insert into coin_ledger(student_id, amount, reason)
    select student_id, coins, 'league:' || w from league_results
     where week_start = w and teacher_id = p_teacher and coins > 0;
  insert into league_weeks(week_start, teacher_id) values (w, p_teacher) on conflict do nothing;
end $fn$;

-- ── 7. Încheie tot ce e de încheiat (sigur de apelat oricând, de oricine) ──────
create or replace function public.league_finalize() returns void
language plpgsql security definer set search_path = public as $fn$
declare cur date := league_week_start(now()); w date; t uuid;
begin
  if now() < league_ts(league_start()) then return; end if;
  perform pg_advisory_xact_lock(hashtext('prime_league_finalize'));
  for t in select distinct teacher_id from students where teacher_id is not null and not coalesce(archived,false) loop
    perform league_seed(t);
    select coalesce(max(week_start) + 7, league_first_week()) into w from league_weeks where teacher_id = t;
    if w < league_first_week() then w := league_first_week(); end if;
    while w + 7 <= cur loop
      perform league_close_week(t, w);
      w := w + 7;
    end loop;
  end loop;
end $fn$;

-- ── 8. Ce vede aplicația ────────────────────────────────────────────────────────
-- Elev: liga lui, colegii din aceeași ligă (același profesor) cu XP-ul de săptămâna asta,
-- plus rezultatul ultimei săptămâni încheiate. Profesor: toți elevii lui, pe ligi.
create or replace function public.league_board() returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  sid uuid := nullif(auth.jwt()->>'student_id','')::uuid;
  cur date := league_week_start(now());
  tid uuid; lg int;
begin
  if now() < league_ts(league_start()) then
    return jsonb_build_object('active', false, 'start', league_start());
  end if;
  perform league_finalize();
  cur := greatest(cur, league_first_week());   -- duminică 1.11 face parte din prima rundă (2–8.11)
  if sid is not null then
    select teacher_id, coalesce(league,1) into tid, lg from students where id = sid and not coalesce(archived,false);
    if tid is null then return jsonb_build_object('active', false); end if;
    return jsonb_build_object(
      'active', true, 'week', cur, 'from', (league_week_from(cur) at time zone 'Europe/Bucharest')::date, 'end', league_ts(cur + 7), 'league', lg, 'me', sid,
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'xp', q.xp)
                                         order by q.xp desc, q.last_at asc nulls last, q.id), '[]'::jsonb)
                 from (select s.id, s.name, coalesce(x.xp,0) as xp, x.last_at
                         from students s left join league_xp(tid, league_week_from(cur), league_ts(cur + 7)) x on x.student_id = s.id
                        where s.teacher_id = tid and not coalesce(s.archived,false) and coalesce(s.league,1) = lg) q),
      'last', (select to_jsonb(r) - 'teacher_id' from league_results r where r.student_id = sid order by r.week_start desc limit 1)
    );
  end if;
  tid := my_teacher_id();
  if tid is null then return jsonb_build_object('active', false); end if;
  return jsonb_build_object(
    'active', true, 'week', cur, 'from', (league_week_from(cur) at time zone 'Europe/Bucharest')::date, 'end', league_ts(cur + 7),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'xp', q.xp, 'league', q.lg, 'instrument', q.instrument)
                                       order by q.lg desc, q.xp desc, q.last_at asc nulls last, q.id), '[]'::jsonb)
               from (select s.id, s.name, s.instrument, coalesce(s.league,1) as lg, coalesce(x.xp,0) as xp, x.last_at
                       from students s left join league_xp(tid, league_week_from(cur), league_ts(cur + 7)) x on x.student_id = s.id
                      where s.teacher_id = tid and not coalesce(s.archived,false)) q)
  );
end $fn$;

-- ── 9. Cine poate apela ce ──────────────────────────────────────────────────────
revoke execute on function public.league_xp(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.league_seed(uuid) from public, anon, authenticated;
revoke execute on function public.league_close_week(uuid, date) from public, anon, authenticated;
revoke execute on function public.league_finalize() from public, anon;
grant  execute on function public.league_finalize() to authenticated, service_role;
revoke execute on function public.league_board() from public, anon;
grant  execute on function public.league_board() to authenticated, service_role;

commit;
