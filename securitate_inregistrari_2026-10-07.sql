-- Prime School · 2026-10-07 · Înregistrări audio (Storage, bucket "recordings")
-- Înainte: orice cont de profesor putea vedea/urca/înlocui/șterge ORICE fișier din "recordings".
-- Acum: profesorul ajunge doar la folderele elevilor lui (folder = id-ul elevului);
-- adminul la toate. Regulile elevilor (își urcă/văd doar folderul propriu) rămân la fel.
-- Redarea în aplicație nu e afectată (fișierele se citesc prin linkul public).
begin;
drop policy if exists "teacher full access recordings storage" on storage.objects;
drop policy if exists "teacher own students recordings storage" on storage.objects;
create policy "teacher own students recordings storage" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'recordings'
    and (auth.jwt() ->> 'student_id') is null
    and (
      public.is_admin()
      or exists (select 1 from public.students s
                 where s.id::text = (storage.foldername(objects.name))[1]
                   and s.teacher_id = public.my_teacher_id())
    )
  )
  with check (
    bucket_id = 'recordings'
    and (auth.jwt() ->> 'student_id') is null
    and (
      public.is_admin()
      or exists (select 1 from public.students s
                 where s.id::text = (storage.foldername(objects.name))[1]
                   and s.teacher_id = public.my_teacher_id())
    )
  );
commit;
