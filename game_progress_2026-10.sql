-- Prime School · progresul pe tonalități la jocul „Acordurile tonalității” (pregătit 26.10.2026)
-- Ce tonalitate a pus elevul corect măcar o dată (din asta se calculează procentul
-- fiecărui nivel). Scrie DOAR serverul (api/add-xp.js, cu cheia service_role);
-- elevul își citește propriile rânduri, profesorul pe ale elevilor lui.
-- Sigur de rulat de mai multe ori. Nu atinge alte tabele.
begin;
create table if not exists public.game_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  game_id    text not null,
  item       text not null,
  done_at    timestamptz not null default now(),
  primary key (student_id, game_id, item)
);
alter table public.game_progress enable row level security;
revoke all on public.game_progress from anon, authenticated;
grant select on public.game_progress to authenticated;
drop policy if exists "student reads own rows" on public.game_progress;
create policy "student reads own rows" on public.game_progress for select to authenticated
  using ((nullif(auth.jwt()->>'student_id',''))::uuid = student_id);
drop policy if exists "teacher reads own students" on public.game_progress;
create policy "teacher reads own students" on public.game_progress for select to authenticated
  using ((auth.jwt()->>'student_id') is null and (public.is_admin() or public.student_teacher(student_id) = public.my_teacher_id()));
commit;
