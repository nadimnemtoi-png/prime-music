-- Prime School — mai multi elevi la aceeasi ora din orar (nu doar 2).
-- student_ids = lista elevilor de la ora respectiva. Coloanele vechi
-- (student_id / student_id_2 / student_name / student_name_2) raman si sunt
-- tinute in pas de aplicatie (primii doi elevi), ca nimic vechi sa nu se strice.
begin;

alter table public.schedule_slots add column if not exists student_ids uuid[] not null default '{}';

-- orele existente: lista = elevul 1 + elevul 2 (cati erau)
update public.schedule_slots
   set student_ids = array_remove(array[student_id, student_id_2], null)
 where coalesce(array_length(student_ids, 1), 0) = 0
   and (student_id is not null or student_id_2 is not null);

-- regula profesorului: TOTI elevii din lista trebuie sa fie ai lui (elevii stersi,
-- care nu mai exista, sunt ignorati, ca ora sa nu dispara)
drop policy if exists "teacher scoped access" on public.schedule_slots;
create policy "teacher scoped access" on public.schedule_slots as permissive for all to authenticated
  using (
    teacher_id = public.my_teacher_id()
    and (student_id is null or public.student_teacher(student_id) = public.my_teacher_id())
    and (student_id_2 is null or public.student_teacher(student_id_2) = public.my_teacher_id())
    and not exists (select 1 from unnest(student_ids) x where public.student_teacher(x) <> public.my_teacher_id())
  )
  with check (
    teacher_id = public.my_teacher_id()
    and (student_id is null or public.student_teacher(student_id) = public.my_teacher_id())
    and (student_id_2 is null or public.student_teacher(student_id_2) = public.my_teacher_id())
    and not exists (select 1 from unnest(student_ids) x where public.student_teacher(x) <> public.my_teacher_id())
  );

commit;
