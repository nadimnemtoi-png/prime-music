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
        select s.id, s.name, s.prime_avatar as av, coalesce(x.xp,0) as xp, x.last_at
          from students s left join league_xp(tid, league_week_from(cur), league_ts(cur + 7)) x on x.student_id = s.id
         where s.teacher_id = tid and not coalesce(s.archived,false) and coalesce(s.league,1) = lg
      ),
      c as (select (count(*) filter (where xp > 0))::int as na, count(*)::int as tot from t)
      select jsonb_build_object(
        'active', true, 'week', cur, 'from', (league_week_from(cur) at time zone 'Europe/Bucharest')::date,
        'end', league_ts(cur + 7), 'league', lg, 'me', sid,
        'na', c.na, 'total', c.tot, 'up', qq.up, 'down', qq.down,
        'down_active', case when lg > 1 then greatest(0, qq.down - (c.tot - c.na)) else 0 end,
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
                          (select count(*) from q where q.lg = g and q.xp = 0)::int as ni from generate_series(1,5) g)
    select jsonb_build_object(
      'active', true, 'week', cur, 'from', (league_week_from(cur) at time zone 'Europe/Bucharest')::date, 'end', league_ts(cur + 7),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'xp', q.xp, 'league', q.lg, 'instrument', q.instrument, 'idle', q.idle, 'avatar', q.av)
                                         order by q.lg desc, (q.xp > 0) desc, q.xp desc, q.last_at asc nulls last, q.idle desc, q.id), '[]'::jsonb) from q),
      'quota', (select jsonb_object_agg(c.lg::text, jsonb_build_object('na', c.na, 'ni', c.ni, 'up', qq.up, 'down', qq.down,
                                                                        'down_active', case when c.lg > 1 then greatest(0, qq.down - c.ni) else 0 end))
                  from c cross join lateral league_quota(c.lg, c.na) qq)
    )
  );
end $fn$;
