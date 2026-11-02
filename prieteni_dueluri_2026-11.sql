-- Prime School — Profil, prieteni și dueluri (noiembrie 2026)
-- • Prieteni: doar între elevii aceluiași profesor; cererea o acceptă elevul care o primește. Fără chat.
-- • Duel: 30 de secunde, aceleași întrebări (același „seed”), fiecare joacă când vrea, în 24 de ore.
--   Câștigă cine are mai multe răspunsuri corecte; la scor egal e egalitate.
--   Câștigătorul ia 10 monede, celălalt 1 monedă (XP-ul pentru exerciții vine separat, ca la jocuri).
--   Un elev poate provoca o singură persoană pe zi și poate juca un singur duel pe zi.
-- Elevul NU scrie direct în tabele: totul trece prin funcțiile de mai jos (SECURITY DEFINER, cu id-ul
-- elevului luat din tokenul lui). Durata se măsoară pe server (de la „start” la „trimite”).
begin;

create table if not exists public.friendships (
  id          bigint generated always as identity primary key,
  requester   uuid not null references public.students(id) on delete cascade,
  addressee   uuid not null references public.students(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);

create table if not exists public.duels (
  id         bigint generated always as identity primary key,
  challenger uuid not null references public.students(id) on delete cascade,
  opponent   uuid not null references public.students(id) on delete cascade,
  game       text not null check (game in ('note','durate')),
  seed       integer not null,
  status     text not null default 'open' check (status in ('open','done','expired','declined')),
  c_correct int, c_wrong int, c_ms int, c_started timestamptz, c_done timestamptz,
  o_correct int, o_wrong int, o_ms int, o_started timestamptz, o_done timestamptz,
  winner     uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (challenger <> opponent)
);
create index if not exists duels_challenger on public.duels (challenger, created_at desc);
create index if not exists duels_opponent on public.duels (opponent, created_at desc);

-- Elevii nu au acces direct; profesorul vede (și poate șterge) prieteniile / duelurile elevilor lui.
alter table public.friendships enable row level security;
alter table public.duels enable row level security;
revoke all on public.friendships, public.duels from anon;
grant select, delete on public.friendships to authenticated;
grant select on public.duels to authenticated;
drop policy if exists "teacher sees own students friendships" on public.friendships;
create policy "teacher sees own students friendships" on public.friendships for select to authenticated
  using (public.student_teacher(requester) = public.my_teacher_id());
drop policy if exists "teacher removes own students friendships" on public.friendships;
create policy "teacher removes own students friendships" on public.friendships for delete to authenticated
  using (public.student_teacher(requester) = public.my_teacher_id());
drop policy if exists "teacher sees own students duels" on public.duels;
create policy "teacher sees own students duels" on public.duels for select to authenticated
  using (public.student_teacher(challenger) = public.my_teacher_id());

-- ── ajutătoare ──
create or replace function public.soc_me() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'student_id','')::uuid
$$;
create or replace function public.soc_short(n text) returns text language sql immutable as $$
  select btrim(n)   -- numele întreg (elevii se văd doar între colegii aceluiași profesor)
$$;
create or replace function public.soc_today() returns date language sql stable as $$
  select (now() at time zone 'Europe/Bucharest')::date
$$;
create or replace function public.soc_day_start() returns timestamptz language sql stable as $$
  select (soc_today()::timestamp at time zone 'Europe/Bucharest')
$$;
create or replace function public.soc_expire() returns void language sql security definer set search_path = public as $$
  update duels set status = 'expired' where status = 'open' and expires_at < now()
$$;

-- ── colegi (căutare după nume) ──
create or replace function public.soc_classmates(p_q text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := soc_me(); tid uuid;
begin
  if me is null then return '[]'::jsonb; end if;
  select teacher_id into tid from students where id = me;
  return coalesce((
    select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object('id', s.id, 'name', soc_short(s.name), 'instrument', s.instrument,
        'xp', coalesce(s.game_xp,0), 'league', coalesce(s.league,1), 'avatar', s.avatar,
        'rel', case when f.id is null then null when f.status = 'accepted' then 'friend'
                    when f.requester = me then 'sent' else 'received' end,
        'fid', f.id) as x
      from students s
      left join friendships f on least(f.requester,f.addressee) = least(s.id,me) and greatest(f.requester,f.addressee) = greatest(s.id,me)
      where s.teacher_id = tid and s.id <> me and not coalesce(s.archived,false)
        and (coalesce(p_q,'') = '' or s.name ilike '%' || p_q || '%')
      limit 40) q), '[]'::jsonb);
end $$;

-- ── prietenii mei + cererile primite / trimise ──
create or replace function public.soc_friends() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := soc_me();
begin
  if me is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('fid', f.id, 'id', s.id, 'name', soc_short(s.name), 'instrument', s.instrument,
        'xp', coalesce(s.game_xp,0), 'league', coalesce(s.league,1), 'since', f.accepted_at, 'avatar', s.avatar,
        'w', (select count(*) from duels d where d.status='done' and d.winner = me and (d.challenger = s.id or d.opponent = s.id)),
        'l', (select count(*) from duels d where d.status='done' and d.winner = s.id and (d.challenger = me or d.opponent = me)))
        order by s.name)
      from friendships f join students s on s.id = case when f.requester = me then f.addressee else f.requester end
      where f.status = 'accepted' and (f.requester = me or f.addressee = me) and not coalesce(s.archived,false)), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('fid', f.id, 'id', s.id, 'name', soc_short(s.name), 'instrument', s.instrument, 'xp', coalesce(s.game_xp,0), 'avatar', s.avatar))
      from friendships f join students s on s.id = f.requester where f.status = 'pending' and f.addressee = me), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('fid', f.id, 'id', s.id, 'name', soc_short(s.name), 'avatar', s.avatar))
      from friendships f join students s on s.id = f.addressee where f.status = 'pending' and f.requester = me), '[]'::jsonb)
  );
end $$;

create or replace function public.soc_friend_request(p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me(); f friendships; n int;
begin
  if me is null or p_to is null or p_to = me then return jsonb_build_object('ok', false, 'msg', 'Cerere invalidă'); end if;
  if student_teacher(p_to) is distinct from student_teacher(me) then return jsonb_build_object('ok', false, 'msg', 'Elevul nu e de la școala ta'); end if;
  select * into f from friendships where least(requester,addressee) = least(me,p_to) and greatest(requester,addressee) = greatest(me,p_to);
  if found then
    if f.status = 'pending' and f.addressee = me then   -- și celălalt mi-a trimis cerere → devenim prieteni
      update friendships set status = 'accepted', accepted_at = now() where id = f.id;
      return jsonb_build_object('ok', true, 'msg', 'Acum sunteți prieteni!');
    end if;
    return jsonb_build_object('ok', true, 'msg', case when f.status = 'accepted' then 'Sunteți deja prieteni' else 'Cererea e deja trimisă' end);
  end if;
  select count(*) into n from friendships where requester = me and created_at >= soc_day_start();
  if n >= 10 then return jsonb_build_object('ok', false, 'msg', 'Ai trimis destule cereri azi. Mai încearcă mâine!'); end if;
  insert into friendships(requester, addressee) values (me, p_to);
  insert into notifications(student_id, title, message, icon)
    select p_to, '👥 ' || soc_short(s.name) || ' vrea să fie prietenul tău', 'Apasă aici ca să accepți.', '👥' from students s where s.id = me;
  return jsonb_build_object('ok', true, 'msg', 'Cerere trimisă');
end $$;

create or replace function public.soc_friend_respond(p_fid bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me(); f friendships;
begin
  select * into f from friendships where id = p_fid and addressee = me and status = 'pending';
  if not found then return jsonb_build_object('ok', false); end if;
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now() where id = p_fid;
    insert into notifications(student_id, title, message, icon)
      select f.requester, '🤝 ' || soc_short(s.name) || ' a acceptat cererea ta', 'Apasă aici ca să-l vezi la Prieteni.', '🤝' from students s where s.id = me;
  else
    delete from friendships where id = p_fid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.soc_friend_remove(p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me();
begin
  delete from friendships where least(requester,addressee) = least(me,p_other) and greatest(requester,addressee) = greatest(me,p_other);
  return jsonb_build_object('ok', true);
end $$;

-- ── profilul unui coleg ──
create or replace function public.soc_profile(p_sid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := soc_me(); s students;
begin
  select * into s from students where id = p_sid and not coalesce(archived,false);
  if not found or me is null or student_teacher(p_sid) is distinct from student_teacher(me) then return null; end if;
  return jsonb_build_object('id', s.id, 'name', soc_short(s.name), 'instrument', s.instrument, 'xp', coalesce(s.game_xp,0),
    'league', coalesce(s.league,1), 'me', s.id = me, 'avatar', s.avatar,
    'won', (select count(*) from duels d where d.status='done' and d.winner = s.id),
    'lost', (select count(*) from duels d where d.status='done' and d.winner is not null and d.winner <> s.id and (d.challenger = s.id or d.opponent = s.id)),
    'friends', (select count(*) from friendships f where f.status='accepted' and (f.requester = s.id or f.addressee = s.id)),
    'rel', (select case when f.status='accepted' then 'friend' when f.requester = me then 'sent' else 'received' end
              from friendships f where least(f.requester,f.addressee) = least(s.id,me) and greatest(f.requester,f.addressee) = greatest(s.id,me)),
    'since', (select f.accepted_at from friendships f where f.status='accepted' and least(f.requester,f.addressee) = least(s.id,me) and greatest(f.requester,f.addressee) = greatest(s.id,me)),
    'fav', (select g.game_type from game_scores g where g.student_id = s.id group by g.game_type order by count(*) desc limit 1));
end $$;

-- ── dueluri ──
create or replace function public.soc_played_today(p uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from duels where (challenger = p and c_started >= soc_day_start()) or (opponent = p and o_started >= soc_day_start())
$$;

create or replace function public.soc_duels() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me();
begin
  if me is null then return '{}'::jsonb; end if;
  perform soc_expire();
  return jsonb_build_object(
    'sent_today', (select count(*) from duels where challenger = me and created_at >= soc_day_start()),
    'played_today', soc_played_today(me),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'game', d.game, 'status', d.status,
        'mine', d.challenger = me, 'other', soc_short(s.name), 'other_id', s.id, 'other_avatar', s.avatar, 'expires', d.expires_at, 'created', d.created_at,
        'my_done', case when d.challenger = me then d.c_done is not null else d.o_done is not null end,
        'my_started', case when d.challenger = me then d.c_started is not null else d.o_started is not null end,
        'other_done', case when d.challenger = me then d.o_done is not null else d.c_done is not null end,
        'my_correct', case when d.challenger = me then d.c_correct else d.o_correct end,
        'my_ms', case when d.challenger = me then d.c_ms else d.o_ms end,
        'other_correct', case when d.status = 'done' then (case when d.challenger = me then d.o_correct else d.c_correct end) end,
        'other_ms', case when d.status = 'done' then (case when d.challenger = me then d.o_ms else d.c_ms end) end,
        'won', case when d.status = 'done' then (case when d.winner is null then null else d.winner = me end) end)
        order by d.created_at desc)
      from duels d join students s on s.id = case when d.challenger = me then d.opponent else d.challenger end
      where (d.challenger = me or d.opponent = me) and d.created_at > now() - interval '14 days'), '[]'::jsonb));
end $$;

create or replace function public.soc_duel_create(p_opp uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me(); d duels;
begin
  if me is null then return jsonb_build_object('ok', false, 'msg', 'Nu ești logat'); end if;
  if p_game not in ('note','durate') then return jsonb_build_object('ok', false, 'msg', 'Joc necunoscut'); end if;
  if not exists (select 1 from friendships where status='accepted' and least(requester,addressee) = least(me,p_opp) and greatest(requester,addressee) = greatest(me,p_opp))
    then return jsonb_build_object('ok', false, 'msg', 'Poți provoca doar prietenii'); end if;
  if (select instrument from students where id = me) is distinct from (select instrument from students where id = p_opp)
    then return jsonb_build_object('ok', false, 'msg', 'Poți provoca doar colegii de la același instrument'); end if;
  perform soc_expire();
  if exists (select 1 from duels where challenger = me and created_at >= soc_day_start())
    then return jsonb_build_object('ok', false, 'msg', 'Ai provocat deja pe cineva azi. Revino mâine!'); end if;
  if soc_played_today(me) > 0 then return jsonb_build_object('ok', false, 'msg', 'Ai jucat deja un duel azi. Revino mâine!'); end if;
  if exists (select 1 from duels where status = 'open' and least(challenger,opponent) = least(me,p_opp) and greatest(challenger,opponent) = greatest(me,p_opp))
    then return jsonb_build_object('ok', false, 'msg', 'Aveți deja un duel deschis'); end if;
  insert into duels(challenger, opponent, game, seed) values (me, p_opp, p_game, floor(random()*2000000000)::int) returning * into d;
  insert into notifications(student_id, title, message, icon)
    select p_opp, '⚔️ ' || soc_short(s.name) || ' te-a provocat la duel!', 'Ai 24 de ore. Apasă aici ca să joci!', '⚔️' from students s where s.id = me;
  return jsonb_build_object('ok', true, 'id', d.id);
end $$;

create or replace function public.soc_duel_start(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me(); d duels; isc boolean;
begin
  perform soc_expire();
  select * into d from duels where id = p_id and (challenger = me or opponent = me) for update;
  if not found then return jsonb_build_object('ok', false, 'msg', 'Duel inexistent'); end if;
  if d.status <> 'open' then return jsonb_build_object('ok', false, 'msg', 'Duelul s-a încheiat'); end if;
  isc := d.challenger = me;
  if (isc and d.c_done is not null) or (not isc and d.o_done is not null) then return jsonb_build_object('ok', false, 'msg', 'Ai jucat deja'); end if;
  if (isc and d.c_started is null) or (not isc and d.o_started is null) then
    if soc_played_today(me) > 0 then return jsonb_build_object('ok', false, 'msg', 'Ai jucat deja un duel azi. Revino mâine!'); end if;
    if isc then update duels set c_started = now() where id = p_id; else update duels set o_started = now() where id = p_id; end if;
  end if;
  return jsonb_build_object('ok', true, 'game', d.game, 'seed', d.seed);
end $$;

create or replace function public.soc_duel_submit(p_id bigint, p_correct int, p_wrong int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me(); d duels; isc boolean; c int := greatest(0, least(80, coalesce(p_correct,0))); w int := greatest(0, least(120, coalesce(p_wrong,0))); ms int; win uuid; los uuid;
begin
  select * into d from duels where id = p_id and (challenger = me or opponent = me) for update;
  if not found or d.status <> 'open' then return jsonb_build_object('ok', false, 'msg', 'Duelul s-a încheiat'); end if;
  isc := d.challenger = me;
  if isc then
    if d.c_started is null or d.c_done is not null then return jsonb_build_object('ok', false); end if;
    ms := least(3600000, (extract(epoch from now() - d.c_started) * 1000)::int);
    update duels set c_correct = c, c_wrong = w, c_ms = ms, c_done = now() where id = p_id returning * into d;
  else
    if d.o_started is null or d.o_done is not null then return jsonb_build_object('ok', false); end if;
    ms := least(3600000, (extract(epoch from now() - d.o_started) * 1000)::int);
    update duels set o_correct = c, o_wrong = w, o_ms = ms, o_done = now() where id = p_id returning * into d;
  end if;
  if d.c_done is not null and d.o_done is not null then
    -- duel de 30 de secunde: câștigă cine are mai multe răspunsuri corecte; la scor egal e egalitate
    win := case when d.c_correct > d.o_correct then d.challenger when d.o_correct > d.c_correct then d.opponent else null end;
    update duels set status = 'done', winner = win where id = p_id;
    if win is not null then
      los := case when win = d.challenger then d.opponent else d.challenger end;
      update students set coins = coins + 10 where id = win;
      update students set coins = coins + 1 where id = los;
      insert into coin_ledger(student_id, amount, reason) values (win, 10, 'duel_win'), (los, 1, 'duel');
    else
      update students set coins = coins + 1 where id in (d.challenger, d.opponent);
      insert into coin_ledger(student_id, amount, reason) values (d.challenger, 1, 'duel'), (d.opponent, 1, 'duel');
    end if;
    insert into notifications(student_id, title, message, icon)
      select case when me = d.challenger then d.opponent else d.challenger end,
             '⚔️ Rezultatul duelului cu ' || soc_short(s.name) || ' e gata!', 'Apasă aici ca să vezi cine a câștigat.', '⚔️'
        from students s where s.id = me;
  end if;
  return jsonb_build_object('ok', true, 'ms', ms);
end $$;

create or replace function public.soc_duel_decline(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me();
begin
  update duels set status = 'declined' where id = p_id and opponent = me and status = 'open' and o_started is null;
  return jsonb_build_object('ok', found);
end $$;

-- Funcțiile pot fi apelate de elevi logați (tokenul lor), nu de vizitatori.
revoke all on function public.soc_me(), public.soc_short(text), public.soc_today(), public.soc_day_start(), public.soc_expire(),
  public.soc_classmates(text), public.soc_friends(), public.soc_friend_request(uuid), public.soc_friend_respond(bigint, boolean),
  public.soc_friend_remove(uuid), public.soc_profile(uuid), public.soc_played_today(uuid), public.soc_duels(),
  public.soc_duel_create(uuid, text), public.soc_duel_start(bigint), public.soc_duel_submit(bigint, int, int), public.soc_duel_decline(bigint)
  from public, anon;
grant execute on function public.soc_classmates(text), public.soc_friends(), public.soc_friend_request(uuid), public.soc_friend_respond(bigint, boolean),
  public.soc_friend_remove(uuid), public.soc_profile(uuid), public.soc_duels(),
  public.soc_duel_create(uuid, text), public.soc_duel_start(bigint), public.soc_duel_submit(bigint, int, int), public.soc_duel_decline(bigint)
  to authenticated;
grant execute on function public.soc_me(), public.soc_short(text), public.soc_today(), public.soc_day_start() to authenticated;

-- ── avatarul (Prime îmbrăcat: fotbalist, medic, pianist…) — elevul și-l alege singur ──
alter table public.students add column if not exists avatar text;
create or replace function public.soc_set_avatar(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := soc_me();
begin
  if me is null then return jsonb_build_object('ok', false); end if;
  if p_key is not null and p_key not in ('fotbal','costum','medic','pianist','astronaut','chef','pompier','detectiv','pictor','pirat','rege','ninja','savant','dj','baschet','pilot','gamer','scafandru','cowboy','erou','toba')
    then return jsonb_build_object('ok', false); end if;
  update students set avatar = p_key where id = me;
  return jsonb_build_object('ok', true, 'avatar', p_key);
end $$;
revoke all on function public.soc_set_avatar(text) from public, anon;
grant execute on function public.soc_set_avatar(text) to authenticated;

commit;
