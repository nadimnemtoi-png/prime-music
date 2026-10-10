-- 2026-10-10 · rulat pe baza reala
-- Permite mai multe inregistrari pe elev in aceeasi saptamana (cate una dupa fiecare lectie).
-- Inainte, regula unica (student_id, week_start) facea ca o retrimitere dupa o lectie noua
-- sa suprascrie inregistrarea deja notata.
alter table public.practice_logs drop constraint if exists practice_logs_student_id_week_start_key;
create index if not exists practice_logs_student_week_idx on public.practice_logs (student_id, week_start);
