-- Notificari vazute, sincronizate intre dispozitive (rulat pe baza reala pe 07.10.2026)
alter table public.teachers
  add column if not exists seen_practices_at timestamptz,
  add column if not exists seen_activity_at timestamptz;
