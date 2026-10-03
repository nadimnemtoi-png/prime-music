-- ============================================================================
-- Prime School — mai multi profesori (pasii 1 si 2)
-- Fiecare profesor vede DOAR elevii lui si tot ce tine de ei. Administratorul
-- (Nadim) NU primeste acces la datele altor profesori; vede doar cifre, prin
-- functia admin_teacher_stats().
-- Elevii (token cu student_id) raman exact ca inainte: vad doar randurile lor.
-- Ruleaza intr-o singura tranzactie: daca ceva esueaza, nu se schimba nimic.
-- ============================================================================
begin;

-- 1) Tabelul teachers: legatura cu contul de logare + rol + stare -------------
alter table public.teachers add column if not exists auth_user_id uuid unique;
alter table public.teachers add column if not exists role text not null default 'teacher';
alter table public.teachers add column if not exists active boolean not null default true;
alter table public.teachers add column if not exists must_change_password boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teachers_role_check') then
    alter table public.teachers add constraint teachers_role_check check (role in ('admin','teacher'));
  end if;
end $$;

-- 2) Functii ajutatoare (SECURITY DEFINER = citesc teachers/students fara sa
--    treaca prin reguli, ca sa nu apara bucle intre reguli) ------------------
create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select t.id from public.teachers t
  where t.auth_user_id = auth.uid() and t.active
    and (auth.jwt() ->> 'student_id') is null
  limit 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teachers t
    where t.auth_user_id = auth.uid() and t.active and t.role = 'admin'
      and (auth.jwt() ->> 'student_id') is null)
$$;

create or replace function public.student_teacher(sid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.teacher_id from public.students s where s.id = sid
$$;

-- Profesorul "grupei" celui care intreaba: pentru elev = profesorul lui,
-- pentru profesor = el insusi. Folosit la clasament.
create or replace function public.scope_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.student_teacher(nullif(auth.jwt() ->> 'student_id','')::uuid),
    public.my_teacher_id())
$$;

revoke all on function public.my_teacher_id(), public.is_admin(),
  public.student_teacher(uuid), public.scope_teacher_id() from public, anon;
grant execute on function public.my_teacher_id(), public.is_admin(),
  public.student_teacher(uuid), public.scope_teacher_id() to authenticated, service_role;
-- clasamentul (vederea) e citit si fara logare: pentru anonim functia intoarce
-- NULL, deci clasamentul iese gol (nu da eroare)
grant execute on function public.scope_teacher_id() to anon;

-- 3) teacher_id pe tabelele care nu sunt legate de un elev -------------------
alter table public.criteria       add column if not exists teacher_id uuid;
alter table public.materials      add column if not exists teacher_id uuid;
alter table public.weekly_income  add column if not exists teacher_id uuid;
alter table public.schedule_slots add column if not exists teacher_id uuid;

-- La inserare din aplicatie, teacher_id se completeaza singur cu profesorul logat
-- (aplicatia nu trebuie sa-l trimita).
alter table public.students       alter column teacher_id set default public.my_teacher_id();
alter table public.lessons        alter column teacher_id set default public.my_teacher_id();
alter table public.criteria       alter column teacher_id set default public.my_teacher_id();
alter table public.materials      alter column teacher_id set default public.my_teacher_id();
alter table public.weekly_income  alter column teacher_id set default public.my_teacher_id();
alter table public.schedule_slots alter column teacher_id set default public.my_teacher_id();

create index if not exists students_teacher_id_idx       on public.students (teacher_id);
create index if not exists lessons_teacher_id_idx        on public.lessons (teacher_id);
create index if not exists schedule_slots_teacher_id_idx on public.schedule_slots (teacher_id);
create index if not exists weekly_income_teacher_id_idx  on public.weekly_income (teacher_id);

-- 4) Contul administratorului + atribuirea datelor existente -----------------
-- (pe proiectul real: contul andrei.nemtoi@yahoo.com; daca nu exista, nu se
--  insereaza nimic si actualizarile de mai jos nu fac nimic)
insert into public.teachers (name, email, role, auth_user_id)
select 'Nadim', u.email, 'admin', u.id
from auth.users u
where lower(u.email) = 'andrei.nemtoi@yahoo.com'
  and not exists (select 1 from public.teachers t where t.auth_user_id = u.id);

do $$
declare admin_id uuid;
begin
  select t.id into admin_id from public.teachers t
  join auth.users u on u.id = t.auth_user_id
  where lower(u.email) = 'andrei.nemtoi@yahoo.com';
  if admin_id is not null then
    update public.students       set teacher_id = admin_id where teacher_id is null;
    update public.lessons        set teacher_id = admin_id where teacher_id is null;
    update public.criteria       set teacher_id = admin_id where teacher_id is null;
    update public.materials      set teacher_id = admin_id where teacher_id is null;
    update public.weekly_income  set teacher_id = admin_id where teacher_id is null;
    update public.schedule_slots set teacher_id = admin_id where teacher_id is null;
  end if;
end $$;

-- 4b) Reguli de unicitate care erau pe toata aplicatia devin pe profesor ------
-- Venituri: un rand pe zi PENTRU FIECARE profesor (nu unul pe zi pentru toti).
alter table public.weekly_income drop constraint if exists weekly_income_date_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'weekly_income_teacher_date_key') then
    alter table public.weekly_income add constraint weekly_income_teacher_date_key unique (teacher_id, date);
  end if;
end $$;

-- Medalii lunare: fiecare profesor are propriile locuri 1-5 in fiecare luna.
alter table public.monthly_awards add column if not exists teacher_id uuid;
update public.monthly_awards a set teacher_id = s.teacher_id
  from public.students s where s.id = a.student_id and a.teacher_id is null;
-- teacher_id se completeaza singur din elev (si cand scrie serverul)
create or replace function public.fill_teacher_from_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is null and new.student_id is not null then
    new.teacher_id := public.student_teacher(new.student_id);
  end if;
  return new;
end $$;
drop trigger if exists monthly_awards_fill_teacher on public.monthly_awards;
create trigger monthly_awards_fill_teacher before insert on public.monthly_awards
  for each row execute function public.fill_teacher_from_student();
alter table public.monthly_awards drop constraint if exists monthly_awards_year_month_rank_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'monthly_awards_teacher_month_rank_key') then
    alter table public.monthly_awards add constraint monthly_awards_teacher_month_rank_key unique (teacher_id, year_month, rank);
  end if;
end $$;
create index if not exists monthly_awards_teacher_id_idx on public.monthly_awards (teacher_id);

-- 5) Regulile "teacher full access ..." (orice cont fara student_id vedea TOT)
--    devin "teacher scoped access" (doar ale profesorului logat) -------------
do $$
declare r record; expr text;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and (policyname ilike 'teacher full access%' or policyname = 'teacher scoped access')
             and tablename <> 'teachers'
  loop
    if exists (select 1 from information_schema.columns c
               where c.table_schema='public' and c.table_name=r.tablename and c.column_name='teacher_id')
       and exists (select 1 from information_schema.columns c
               where c.table_schema='public' and c.table_name=r.tablename and c.column_name='student_id') then
      -- ex. lessons, schedule_slots: randul e al profesorului SI elevul (daca exista) e tot al lui
      expr := 'teacher_id = public.my_teacher_id() and (student_id is null or public.student_teacher(student_id) = public.my_teacher_id())';
    elsif exists (select 1 from information_schema.columns c
               where c.table_schema='public' and c.table_name=r.tablename and c.column_name='teacher_id') then
      expr := 'teacher_id = public.my_teacher_id()';
    elsif exists (select 1 from information_schema.columns c
               where c.table_schema='public' and c.table_name=r.tablename and c.column_name='student_id') then
      expr := 'public.student_teacher(student_id) = public.my_teacher_id()';
    else
      raise exception 'Nu stiu cum sa restrang tabelul % (nici teacher_id, nici student_id)', r.tablename;
    end if;
    if r.tablename = 'schedule_slots' then
      expr := expr || ' and (student_id_2 is null or public.student_teacher(student_id_2) = public.my_teacher_id())';
    end if;
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy "teacher scoped access" on public.%I as permissive for all to authenticated using (%s) with check (%s)',
                   r.tablename, expr, expr);
  end loop;
end $$;

-- 5b) Reguli vechi prea largi (lasau pe ORICINE logat - chiar si elevii - sau
--     chiar si pe cei nelogati sa citeasca tot) ------------------------------
-- venituri: oricine logat (inclusiv elevii) le putea citi
drop policy if exists "Only authenticated teacher can read income" on public.weekly_income;
-- vizite: le putea citi oricine, chiar fara logare
drop policy if exists "teacher select" on public.site_visits;
drop policy if exists "teacher scoped select" on public.site_visits;
create policy "teacher scoped select" on public.site_visits for select to authenticated
  using (public.student_teacher(student_id) = public.my_teacher_id()
         or (student_id is null and public.is_admin()));
-- medalii: le putea citi oricine, chiar fara logare
drop policy if exists "teacher select all monthly awards" on public.monthly_awards;
drop policy if exists "teacher scoped access" on public.monthly_awards;
create policy "teacher scoped access" on public.monthly_awards as permissive for all to authenticated
  using (teacher_id = public.my_teacher_id() and public.student_teacher(student_id) = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id() and public.student_teacher(student_id) = public.my_teacher_id());
-- program, criterii, materiale: elevul vede doar pe ale profesorului lui
drop policy if exists "student read schedule_slots" on public.schedule_slots;
drop policy if exists "student reads own teacher rows" on public.schedule_slots;
create policy "student reads own teacher rows" on public.schedule_slots for select to authenticated
  using ((auth.jwt() ->> 'student_id') is not null and teacher_id = public.scope_teacher_id());
drop policy if exists "student read criteria" on public.criteria;
drop policy if exists "student reads own teacher rows" on public.criteria;
create policy "student reads own teacher rows" on public.criteria for select to authenticated
  using ((auth.jwt() ->> 'student_id') is not null and teacher_id = public.scope_teacher_id());
drop policy if exists "student read materials" on public.materials;
drop policy if exists "student reads own teacher rows" on public.materials;
create policy "student reads own teacher rows" on public.materials for select to authenticated
  using ((auth.jwt() ->> 'student_id') is not null and teacher_id = public.scope_teacher_id());
-- scoruri la jocuri: le putea citi oricine fara logare (aplicatia trimite mereu tokenul)
drop policy if exists "select" on public.game_scores;

-- 6) Cele 6 tabele care nu aveau deloc securitate pe randuri ------------------
do $$
declare t text;
begin
  foreach t in array array['coin_ledger','game_unlocks','notifications','rank_snapshots','streak_freezes','teacher_activity']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "teacher scoped access" on public.%I', t);
    execute format('drop policy if exists "student own rows" on public.%I', t);
    execute format('create policy "teacher scoped access" on public.%I as permissive for all to authenticated using (public.student_teacher(student_id) = public.my_teacher_id()) with check (public.student_teacher(student_id) = public.my_teacher_id())', t);
    execute format('create policy "student own rows" on public.%I as permissive for all to authenticated using (nullif(auth.jwt() ->> ''student_id'','''')::uuid = student_id) with check (nullif(auth.jwt() ->> ''student_id'','''')::uuid = student_id)', t);
  end loop;
end $$;

-- 7) Tabelul teachers: fiecare isi vede randul lui; administratorul ii vede pe
--    toti (doar datele profesorilor, nu ale elevilor lor). Crearea/dezactivarea
--    se face doar de pe server. --------------------------------------------
drop policy if exists "Only authenticated teacher can read teachers table" on public.teachers;
drop policy if exists "teacher full access teachers" on public.teachers;
drop policy if exists "teacher reads own row or admin all" on public.teachers;
drop policy if exists "teacher updates own row" on public.teachers;
create policy "teacher reads own row or admin all" on public.teachers
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());
create policy "teacher updates own row" on public.teachers
  for update to authenticated
  using (auth_user_id = auth.uid() and (auth.jwt() ->> 'student_id') is null)
  with check (auth_user_id = auth.uid() and (auth.jwt() ->> 'student_id') is null);
-- un profesor nu-si poate schimba singur rolul, starea sau legatura cu contul
revoke update on public.teachers from authenticated;
grant update (name, phone, instrument, must_change_password) on public.teachers to authenticated;

-- 8) Clasamentul: fiecare vede doar grupa lui ---------------------------------
create or replace view public.leaderboard_public as
  select id, name, instrument, monthly_xp, xp_period
  from public.students
  where archived = false
    and teacher_id = public.scope_teacher_id();

-- 9) Cifrele pentru administrator (fara nume de elevi) ------------------------
create or replace function public.admin_teacher_stats()
returns table (teacher_id uuid, name text, email text, role text, active boolean,
               students bigint, active_7d bigint, active_30d bigint,
               lessons_month bigint, lessons_total bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Doar administratorul' using errcode = '42501';
  end if;
  return query
  select t.id, t.name, t.email, t.role, t.active,
    (select count(*) from students s where s.teacher_id = t.id and not s.archived),
    (select count(distinct v.student_id) from site_visits v join students s on s.id = v.student_id
       where s.teacher_id = t.id and v.created_at >= now() - interval '7 days'),
    (select count(distinct v.student_id) from site_visits v join students s on s.id = v.student_id
       where s.teacher_id = t.id and v.created_at >= now() - interval '30 days'),
    (select count(*) from lessons l where l.teacher_id = t.id
       and l.date >= date_trunc('month', (now() at time zone 'Europe/Bucharest'))::date),
    (select count(*) from lessons l where l.teacher_id = t.id)
  from teachers t
  where t.auth_user_id is not null
  order by (t.role = 'admin') desc, t.created_at;
end $$;
revoke all on function public.admin_teacher_stats() from public, anon;
grant execute on function public.admin_teacher_stats() to authenticated;

commit;
