-- Securitate (07.10.2026): cine ce poate scrie in baza de date.
-- Tot fisierul ruleaza intr-o singura tranzactie: ori se aplica tot, ori nimic.
begin;

-- 1) Profesorul isi poate salva ce notificari a vazut (sincronizare intre dispozitive)
alter table public.teachers add column if not exists seen_practices_at timestamptz, add column if not exists seen_activity_at timestamptz;
grant update (seen_practices_at, seen_activity_at) on public.teachers to authenticated;

-- 2) site_visits: doar elevul logat isi inregistreaza propria vizita, cu valori normale
drop policy if exists "insert" on public.site_visits;
drop policy if exists "student inserts own visit" on public.site_visits;
create policy "student inserts own visit" on public.site_visits for insert to authenticated
  with check (student_id is not null and student_id = nullif(auth.jwt()->>'student_id','')::uuid);
alter table public.site_visits drop constraint if exists site_visits_values_chk;
alter table public.site_visits add constraint site_visits_values_chk check (
  (device_type is null or device_type in ('mobil','tableta','calculator')) and
  (os is null or os in ('Android','iOS','iPadOS','Windows','macOS','Linux','Altul')) and
  (browser is null or browser in ('Chrome','Safari','Firefox','Edge','Opera','Alt browser')) and
  (device_id is null or device_id ~ '^[A-Za-z0-9-]{1,64}$')
);

-- 3) practice_logs: elevul nu-si poate da singur XP / parere si nu poate pune linkuri straine
create or replace function public.practice_logs_student_guard() returns trigger
language plpgsql set search_path = public as $fn$
declare sid text := nullif(auth.jwt()->>'student_id','');
begin
  if sid is null then return new; end if;            -- profesor sau server: neschimbat
  if tg_op = 'INSERT' then
    new.xp_rating := 0; new.feedback_text := null;
  else
    new.xp_rating := old.xp_rating; new.feedback_text := old.feedback_text;
    new.student_id := old.student_id; new.week_start := old.week_start; new.created_at := old.created_at;
  end if;
  if new.type is not null and new.type not in ('clip','bifare') then
    raise exception 'tip de repetitie invalid';
  end if;
  if new.file_url is not null and new.file_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/recordings/' || sid || '/[A-Za-z0-9_.-]+$') then
    raise exception 'link de inregistrare invalid';
  end if;
  return new;
end $fn$;
drop trigger if exists practice_logs_student_guard on public.practice_logs;
create trigger practice_logs_student_guard before insert or update on public.practice_logs
  for each row execute function public.practice_logs_student_guard();

-- 4) teacher_activity: elevul isi poate citi activitatea si poate adauga doar "s-a conectat"
drop policy if exists "student own rows" on public.teacher_activity;
drop policy if exists "student reads own activity" on public.teacher_activity;
drop policy if exists "student inserts own connect" on public.teacher_activity;
create policy "student reads own activity" on public.teacher_activity for select to authenticated
  using (nullif(auth.jwt()->>'student_id','')::uuid = student_id);
create policy "student inserts own connect" on public.teacher_activity for insert to authenticated
  with check (nullif(auth.jwt()->>'student_id','')::uuid = student_id and type = 'connect'
              and length(coalesce(message,'')) <= 200 and length(coalesce(icon,'')) <= 8);

-- 5) Jocuri deblocate, freeze-uri, monede, clasamente: elevul doar le citeste (le scrie serverul)
do $do$ declare t text; begin
  foreach t in array array['game_unlocks','streak_freezes','coin_ledger','rank_snapshots'] loop
    execute format('drop policy if exists "student own rows" on public.%I', t);
    execute format('drop policy if exists "student reads own rows" on public.%I', t);
    execute format('create policy "student reads own rows" on public.%I for select to authenticated using (nullif(auth.jwt()->>''student_id'','''')::uuid = student_id)', t);
  end loop;
end $do$;
drop policy if exists "student own game_scores insert" on public.game_scores;

-- 6) Functiile care dau XP / monede / jocuri / freeze: le poate apela doar serverul
do $do$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('award_streak_coins','buy_game_unlock','do_daily_spin','increment_student_game_xp','use_streak_freeze','get_db_size')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $do$;

commit;
