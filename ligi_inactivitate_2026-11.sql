-- Ligi: o săptămână fără joc = rămâi în ligă; din a doua săptămână la rând fără joc coboară câte o ligă pe săptămână.
-- Locurile de coborâre pentru cei activi = quota − cei care coboară pentru inactivitate. (rulat noiembrie 2026)

create or replace function public.league_close_week(p_teacher uuid, w date) returns void
language plpgsql security definer set search_path = public as $fn$
declare a timestamptz := league_week_from(w); b timestamptz := league_ts(w + 7);
begin
  if exists (select 1 from league_weeks where week_start = w and teacher_id = p_teacher) then return; end if;
  insert into league_results(week_start, student_id, teacher_id, league, rank, members, xp, move, new_league, coins)
  with x as (select * from league_xp(p_teacher, a, b)),
  m as (
    select s.id, coalesce(s.league,1) as lg, coalesce(x.xp,0) as xp, x.last_at, coalesce(s.league_idle,0) as idle
      from students s left join x on x.student_id = s.id
     where s.teacher_id = p_teacher and not coalesce(s.archived,false)
       and (s.created_at is null or s.created_at < b)
  ),
  r as (
    select m.*,
           case when xp > 0 then row_number() over (partition by lg, (xp > 0) order by xp desc, last_at asc nulls last, id) else 0 end as rk,
           case when xp = 0 then row_number() over (partition by lg, (xp > 0) order by idle desc, id) else 0 end as irk,
           count(*) filter (where xp > 0) over (partition by lg) as na,
           count(*) filter (where xp = 0) over (partition by lg) as ni,
           count(*) filter (where xp = 0 and idle >= 1) over (partition by lg) as nd   -- a doua+ săptămână la rând fără joc
      from m
  ),
  d as (
    select r.*, case when r.xp > 0 and r.rk <= qq.up then 1
                     -- o săptămână fără joc: rămâne în ligă; din a doua săptămână la rând fără joc coboară câte o ligă pe săptămână
                     when r.lg > 1 and r.xp = 0 and r.idle >= 1 then -1
                     when r.lg > 1 and r.xp > 0 and qq.down > r.nd and r.rk > r.na - (qq.down - r.nd) then -1
                     else 0 end as mv
      from r cross join lateral league_quota(r.lg, r.na::int) qq
  )
  select w, id, p_teacher, lg, rk, na, xp, mv, lg + mv,
         case when xp > 0 and na >= 3 then (case rk when 1 then 30 when 2 then 20 when 3 then 10 else 0 end) else 0 end
    from d
  on conflict (week_start, student_id) do nothing;

  update students s set league = r.new_league,
                        league_idle = case when r.xp > 0 then 0 else coalesce(s.league_idle,0) + 1 end
    from league_results r where r.week_start = w and r.teacher_id = p_teacher and r.student_id = s.id;
  update students s set coins = coalesce(s.coins,0) + r.coins
    from league_results r where r.week_start = w and r.teacher_id = p_teacher and r.student_id = s.id and r.coins > 0;
  insert into coin_ledger(student_id, amount, reason)
    select student_id, coins, 'league:' || w from league_results
     where week_start = w and teacher_id = p_teacher and coins > 0;
  insert into league_weeks(week_start, teacher_id) values (w, p_teacher) on conflict do nothing;
end $fn$;

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
    return (
      with t as (
        select s.id, s.name, s.prime_avatar as av, coalesce(x.xp,0) as xp, x.last_at, coalesce(s.league_idle,0) as idle
          from students s left join league_xp(tid, league_week_from(cur), league_ts(cur + 7)) x on x.student_id = s.id
         where s.teacher_id = tid and not coalesce(s.archived,false) and coalesce(s.league,1) = lg
      ),
      c as (select (count(*) filter (where xp > 0))::int as na, count(*)::int as tot, (count(*) filter (where xp = 0 and idle >= 1))::int as nd from t)
      select jsonb_build_object(
        'active', true, 'week', cur, 'from', (league_week_from(cur) at time zone 'Europe/Bucharest')::date,
        'end', league_ts(cur + 7), 'league', lg, 'me', sid,
        'na', c.na, 'total', c.tot, 'up', qq.up, 'down', qq.down,
        'down_active', case when lg > 1 then greatest(0, qq.down - c.nd) else 0 end,
        'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'xp', t.xp, 'avatar', t.av)
                                           order by (t.xp > 0) desc, t.xp desc, t.last_at asc nulls last, t.id), '[]'::jsonb)
                   from t where t.xp > 0 or t.id = sid),
        'last', (select to_jsonb(r) - 'teacher_id' from league_results r where r.student_id = sid order by r.week_start desc limit 1)
      )
      from c cross join lateral league_quota(lg, c.na) qq
    );
  end if;
  tid := my_teacher_id();
  if tid is null then return jsonb_build_object('active', false); end if;
  return (
    with q as (
      select s.id, s.name, s.instrument, s.prime_avatar as av, coalesce(s.league,1) as lg, coalesce(s.league_idle,0) as idle,
             coalesce(x.xp,0) as xp, x.last_at
        from students s left join league_xp(tid, league_week_from(cur), league_ts(cur + 7)) x on x.student_id = s.id
       where s.teacher_id = tid and not coalesce(s.archived,false)
    ),
    c as (select g as lg, (select count(*) from q where q.lg = g and q.xp > 0)::int as na,
                          (select count(*) from q where q.lg = g and q.xp = 0)::int as ni,
                          (select count(*) from q where q.lg = g and q.xp = 0 and q.idle >= 1)::int as nd from generate_series(1,5) g)
    select jsonb_build_object(
      'active', true, 'week', cur, 'from', (league_week_from(cur) at time zone 'Europe/Bucharest')::date, 'end', league_ts(cur + 7),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'xp', q.xp, 'league', q.lg, 'instrument', q.instrument, 'idle', q.idle, 'avatar', q.av)
                                         order by q.lg desc, (q.xp > 0) desc, q.xp desc, q.last_at asc nulls last, q.idle desc, q.id), '[]'::jsonb) from q),
      'quota', (select jsonb_object_agg(c.lg::text, jsonb_build_object('na', c.na, 'ni', c.ni, 'up', qq.up, 'down', qq.down,
                                                                        'down_active', case when c.lg > 1 then greatest(0, qq.down - c.nd) else 0 end))
                  from c cross join lateral league_quota(c.lg, c.na) qq)
    )
  );
end $fn$;
