-- Prime School — post-it-urile profesorului (Spațiu de lucru, pe pagina Acasă).
-- Fiecare profesor vede DOAR post-it-urile lui. Cand un profesor e sters,
-- post-it-urile lui se sterg automat (cascade).
begin;

create table if not exists public.teacher_notes (
  id         bigint generated always as identity primary key,
  teacher_id uuid not null default public.my_teacher_id() references public.teachers(id) on delete cascade,
  text       text not null default '' check (char_length(text) <= 300),
  color      text not null default 'y' check (color in ('y','p','b','g','o','v')),
  due_date   date,                       -- null = fara data
  done       boolean not null default false,
  items      jsonb,                      -- null = post-it simplu; [{t,d}] = lista cu bife
  created_at timestamptz not null default now()
);
create index if not exists teacher_notes_teacher_idx on public.teacher_notes (teacher_id);

alter table public.teacher_notes enable row level security;
drop policy if exists "teacher own notes" on public.teacher_notes;
create policy "teacher own notes" on public.teacher_notes as permissive for all to authenticated
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());

revoke all on public.teacher_notes from anon;
grant select, insert, update, delete on public.teacher_notes to authenticated;

commit;
