-- Recunoasterea dispozitivelor (tabletele / telefonul profesorului vs. ale elevilor)
-- Rulat in Supabase SQL Editor, 30.09.2026. Doar adauga coloane — nu schimba date.
alter table public.site_visits add column if not exists device_id text;
alter table public.site_visits add column if not exists school_device boolean not null default false;
create index if not exists site_visits_device_idx on public.site_visits(device_id) where device_id is not null;
