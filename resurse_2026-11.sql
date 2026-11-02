-- Prime School — Resurse (noiembrie 2026)
-- Profesorul pune link-uri (YouTube / site-uri) sau fișiere PDF / Word (max. 10 MB)
-- pentru toți elevii lui, doar pentru pian, doar pentru chitară sau pentru elevi aleși.
-- Elevul vede doar resursele profesorului lui care îi sunt adresate.
begin;

-- 1) Resursele
create table if not exists public.resources (
  id          bigint generated always as identity primary key,
  teacher_id  uuid not null default public.my_teacher_id() references public.teachers(id) on delete cascade,
  kind        text not null check (kind in ('link','file')),
  title       text not null check (char_length(title) between 1 and 150),
  description text check (description is null or char_length(description) <= 300),
  url         text check (url is null or (url ~ '^https?://' and char_length(url) <= 1000)),   -- pentru link
  file_url    text,                                                                          -- pentru fișier (link public din Storage)
  file_path   text,                                                                          -- calea în bucket, ca să-l putem șterge
  file_name   text check (file_name is null or char_length(file_name) <= 200),
  file_size   integer check (file_size is null or file_size between 1 and 10485760),
  file_type   text check (file_type is null or file_type in ('pdf','doc','docx')),
  audience    text not null default 'all' check (audience in ('all','pian','chitara','selected')),
  created_at  timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and file_url is not null))
);
create index if not exists resources_teacher_idx on public.resources (teacher_id, created_at desc);

-- 2) Elevii aleși (doar când audience = 'selected')
create table if not exists public.resource_targets (
  resource_id bigint not null references public.resources(id) on delete cascade,
  student_id  uuid   not null references public.students(id) on delete cascade,
  primary key (resource_id, student_id)
);
create index if not exists resource_targets_student_idx on public.resource_targets (student_id);

-- 3) Cine a deschis resursa (pentru „NOU” la elev și 👁 8/12 la profesor)
create table if not exists public.resource_views (
  resource_id bigint not null references public.resources(id) on delete cascade,
  student_id  uuid   not null references public.students(id) on delete cascade,
  seen_at     timestamptz not null default now(),
  primary key (resource_id, student_id)
);

-- 4) Elevul vede resursa? (SECURITY DEFINER, ca să nu apară bucle între reguli)
create or replace function public.resource_visible_to_student(rid bigint, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resources r join public.students s on s.id = sid
    where r.id = rid and r.teacher_id = s.teacher_id
      and (r.audience = 'all'
        or (r.audience = 'pian' and s.instrument = 'Pian')
        or (r.audience = 'chitara' and s.instrument = 'Chitară')
        or (r.audience = 'selected' and exists (select 1 from public.resource_targets t where t.resource_id = r.id and t.student_id = sid)))
  )
$$;
create or replace function public.resource_owner(rid bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select teacher_id from public.resources where id = rid
$$;
revoke all on function public.resource_visible_to_student(bigint, uuid), public.resource_owner(bigint) from public, anon;
grant execute on function public.resource_visible_to_student(bigint, uuid), public.resource_owner(bigint) to authenticated, service_role;

-- 5) Reguli (RLS)
alter table public.resources enable row level security;
alter table public.resource_targets enable row level security;
alter table public.resource_views enable row level security;

drop policy if exists "teacher own resources" on public.resources;
create policy "teacher own resources" on public.resources as permissive for all to authenticated
  using (teacher_id = public.my_teacher_id()) with check (teacher_id = public.my_teacher_id());
drop policy if exists "student reads own resources" on public.resources;
create policy "student reads own resources" on public.resources for select to authenticated
  using ((auth.jwt() ->> 'student_id') is not null
         and public.resource_visible_to_student(id, nullif(auth.jwt() ->> 'student_id','')::uuid));

drop policy if exists "teacher own resource targets" on public.resource_targets;
create policy "teacher own resource targets" on public.resource_targets as permissive for all to authenticated
  using (public.resource_owner(resource_id) = public.my_teacher_id()
         and public.student_teacher(student_id) = public.my_teacher_id())
  with check (public.resource_owner(resource_id) = public.my_teacher_id()
              and public.student_teacher(student_id) = public.my_teacher_id());

drop policy if exists "teacher reads views of own resources" on public.resource_views;
create policy "teacher reads views of own resources" on public.resource_views for select to authenticated
  using (public.resource_owner(resource_id) = public.my_teacher_id());
drop policy if exists "student own resource views" on public.resource_views;
create policy "student own resource views" on public.resource_views for select to authenticated
  using (nullif(auth.jwt() ->> 'student_id','')::uuid = student_id);
drop policy if exists "student marks resource seen" on public.resource_views;
create policy "student marks resource seen" on public.resource_views for insert to authenticated
  with check (nullif(auth.jwt() ->> 'student_id','')::uuid = student_id
              and public.resource_visible_to_student(resource_id, student_id));

revoke all on public.resources, public.resource_targets, public.resource_views from anon;
grant select, insert, update, delete on public.resources, public.resource_targets to authenticated;
grant select, insert on public.resource_views to authenticated;

-- 6) Fișierele: bucket public „resources” (PDF / Word, max. 10 MB).
--    Profesorul urcă / șterge doar în folderul lui (folder = id-ul profesorului).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', true, 10485760,
        array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = true, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "teacher own resource files" on storage.objects;
create policy "teacher own resource files" on storage.objects for all to authenticated
  using (bucket_id = 'resources' and (auth.jwt() ->> 'student_id') is null
         and (storage.foldername(name))[1] = public.my_teacher_id()::text)
  with check (bucket_id = 'resources' and (auth.jwt() ->> 'student_id') is null
              and (storage.foldername(name))[1] = public.my_teacher_id()::text);

commit;
