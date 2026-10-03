-- TEST pe prime-test (NU pe proiectul real). Date false + verificari pe roluri.
-- Totul se anuleaza la final, proiectul de test ramane curat.
begin;

-- conturi false: A = administrator (Nadim), B si C = profesori
insert into public.teachers (id, name, email, role, auth_user_id) values
 ('11111111-1111-1111-1111-111111111111','Nadim (test)','a@test.ro','admin','a0000000-0000-0000-0000-00000000000a'),
 ('22222222-2222-2222-2222-222222222222','Prof B','b@test.ro','teacher','b0000000-0000-0000-0000-00000000000b'),
 ('33333333-3333-3333-3333-333333333333','Prof C','c@test.ro','teacher','c0000000-0000-0000-0000-00000000000c');

insert into public.students (id, name, instrument, teacher_id, monthly_xp, xp_period, archived) values
 ('51000000-0000-0000-0000-000000000001','Elev A1','Pian','11111111-1111-1111-1111-111111111111',500,'2026-10',false),
 ('51000000-0000-0000-0000-000000000002','Elev A2','Pian','11111111-1111-1111-1111-111111111111',300,'2026-10',false),
 ('51000000-0000-0000-0000-000000000003','Elev B1','Pian','22222222-2222-2222-2222-222222222222',900,'2026-10',false),
 ('51000000-0000-0000-0000-000000000004','Elev C1','Pian','33333333-3333-3333-3333-333333333333',100,'2026-10',false);

insert into public.lessons (student_id, teacher_id, date)
select id, teacher_id, current_date from public.students where name like 'Elev %';
insert into public.notifications (student_id, title, message)
select id, 'T', 'mesaj ' || name from public.students where name like 'Elev %';
insert into public.teacher_activity (student_id, type, message)
select id, 'test', 'activ ' || name from public.students where name like 'Elev %';
insert into public.site_visits (student_id) select id from public.students where name like 'Elev %';
insert into public.weekly_income (date, amount, teacher_id) values
 (current_date, 100, '11111111-1111-1111-1111-111111111111'),
 (current_date, 200, '22222222-2222-2222-2222-222222222222');
insert into public.schedule_slots (day, time, teacher_id, student_id) values
 ('Luni','10:00','11111111-1111-1111-1111-111111111111','51000000-0000-0000-0000-000000000001'),
 ('Luni','11:00','22222222-2222-2222-2222-222222222222','51000000-0000-0000-0000-000000000003');

create temp table r (n serial, test text, val text);
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

-- ===== A (administrator) =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into r (test,val) select 'A elevi', string_agg(name, ',' order by name) from public.students;
insert into r (test,val) select 'A lectii', count(*)::text from public.lessons;
insert into r (test,val) select 'A notificari', count(*)::text from public.notifications;
insert into r (test,val) select 'A activitate', count(*)::text from public.teacher_activity;
insert into r (test,val) select 'A venituri', coalesce(sum(amount),0)::text from public.weekly_income;
insert into r (test,val) select 'A program', count(*)::text from public.schedule_slots;
insert into r (test,val) select 'A clasament', string_agg(name, ',' order by monthly_xp desc) from public.leaderboard_public;
insert into r (test,val) select 'A vede profesori', count(*)::text from public.teachers;
insert into r (test,val) select 'A statistici', string_agg(name || '=' || students || ' elevi/' || active_7d || ' activi/' || lessons_total || ' lectii', '; ') from public.admin_teacher_stats();
reset role;

-- ===== B (profesor) =====
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
insert into r (test,val) select 'B elevi', string_agg(name, ',' order by name) from public.students;
insert into r (test,val) select 'B lectii', count(*)::text from public.lessons;
insert into r (test,val) select 'B notificari', count(*)::text from public.notifications;
insert into r (test,val) select 'B activitate', count(*)::text from public.teacher_activity;
insert into r (test,val) select 'B venituri', coalesce(sum(amount),0)::text from public.weekly_income;
insert into r (test,val) select 'B program', count(*)::text from public.schedule_slots;
insert into r (test,val) select 'B clasament', string_agg(name, ',' order by monthly_xp desc) from public.leaderboard_public;
insert into r (test,val) select 'B vede profesori', count(*)::text from public.teachers;
do $$ begin
  perform * from public.admin_teacher_stats();
  insert into r (test,val) values ('B statistici admin', 'PERMIS (GRESIT)');
exception when others then insert into r (test,val) values ('B statistici admin', 'blocat (corect)'); end $$;
do $$ declare k int; begin
  update public.students set name = 'SPART' where id = '51000000-0000-0000-0000-000000000001';
  get diagnostics k = row_count;
  insert into r (test,val) values ('B modifica elevul lui A', k || ' randuri (corect: 0)');
end $$;
insert into public.students (name, instrument) values ('Elev B nou', 'Pian');
do $$ begin
  insert into public.students (name, instrument, teacher_id) values ('Intrus', 'Pian', '11111111-1111-1111-1111-111111111111');
  insert into r (test,val) values ('B adauga elev la A', 'PERMIS (GRESIT)');
exception when others then insert into r (test,val) values ('B adauga elev la A', 'blocat (corect)'); end $$;
do $$ begin
  insert into public.lessons (student_id, date) values ('51000000-0000-0000-0000-000000000001', current_date);
  insert into r (test,val) values ('B lectie pt elevul lui A', 'PERMIS (GRESIT)');
exception when others then insert into r (test,val) values ('B lectie pt elevul lui A', 'blocat (corect)'); end $$;
do $$ begin
  update public.teachers set role = 'admin' where auth_user_id = 'b0000000-0000-0000-0000-00000000000b';
  insert into r (test,val) values ('B se face admin', 'PERMIS (GRESIT)');
exception when others then insert into r (test,val) values ('B se face admin', 'blocat (corect)'); end $$;
reset role;
insert into r (test,val) select 'elev nou al lui B are profesorul', coalesce(t.name,'NIMENI') from public.students s left join public.teachers t on t.id = s.teacher_id where s.name = 'Elev B nou';

-- ===== C (profesor, fara nimic in comun cu B) =====
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
insert into r (test,val) select 'C elevi', string_agg(name, ',' order by name) from public.students;
insert into r (test,val) select 'C clasament', string_agg(name, ',' order by monthly_xp desc) from public.leaderboard_public;
reset role;

-- ===== Elev B1 (token de elev) =====
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000003","role":"authenticated","student_id":"51000000-0000-0000-0000-000000000003"}', true);
set local role authenticated;
insert into r (test,val) select 'Elev B1 vede elevi', string_agg(name, ',' order by name) from public.students;
insert into r (test,val) select 'Elev B1 notificari', count(*)::text from public.notifications;
insert into r (test,val) select 'Elev B1 lectii', count(*)::text from public.lessons;
insert into r (test,val) select 'Elev B1 clasament', string_agg(name, ',' order by monthly_xp desc) from public.leaderboard_public;
insert into r (test,val) select 'Elev B1 vede profesori', count(*)::text from public.teachers;
insert into r (test,val) select 'Elev B1 venituri', count(*)::text from public.weekly_income;
insert into r (test,val) select 'Elev B1 program', count(*)::text from public.schedule_slots;
reset role;

-- ===== Anonim (fara logare) =====
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r (test,val) select 'Anonim clasament', count(*)::text from public.leaderboard_public;
insert into r (test,val) select 'Anonim elevi', count(*)::text from public.students;
insert into r (test,val) select 'Anonim vizite', count(*)::text from public.site_visits;
insert into r (test,val) select 'Anonim medalii', count(*)::text from public.monthly_awards;
insert into r (test,val) select 'Anonim scoruri', count(*)::text from public.game_scores;
reset role;

-- Rezultatele se afiseaza ca "eroare": asa Supabase le arata SI anuleaza automat
-- tot ce s-a inserat mai sus (proiectul de test ramane curat).
do $$ begin
  raise exception 'REZULTAT: %', (select string_agg(test || ': ' || coalesce(val,'(nimic)'), ' || ' order by n) from r);
end $$;
