-- Prime School — spatiul ocupat de fiecare profesor in sectiunea "Profesori".
-- Fisierele din stocare sunt in dosare dupa elev: recordings/<id elev>/<fisier>,
-- deci adunam marimea fisierelor elevilor fiecarui profesor. Tot doar cifre.
drop function if exists public.admin_teacher_stats();
create function public.admin_teacher_stats()
returns table (teacher_id uuid, name text, email text, role text, active boolean,
               students bigint, active_7d bigint, active_30d bigint,
               lessons_month bigint, lessons_total bigint, storage_bytes bigint)
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
    (select count(*) from lessons l where l.teacher_id = t.id),
    (select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o
       where o.bucket_id = 'recordings'
         and split_part(o.name, '/', 1) in (select s.id::text from students s where s.teacher_id = t.id))
  from teachers t
  where t.auth_user_id is not null
  order by (t.role = 'admin') desc, t.created_at;
end $$;
revoke all on function public.admin_teacher_stats() from public, anon;
grant execute on function public.admin_teacher_stats() to authenticated;
