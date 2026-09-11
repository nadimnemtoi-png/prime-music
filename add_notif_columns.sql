-- 1) Pentru notificarile de la SPIN (monede/Freeze) sa dispara la 24h dupa ce
-- au fost vazute — retinem CAND au fost vazute, nu doar faptul ca au fost.
alter table notifications add column if not exists seen_at timestamptz;

-- 2) Pentru parerea profesorului si XP-ul acordat la o repetitie — sa dispara
-- din notificarile elevului dupa ce profesorul adauga o lectie noua. Nu atinge
-- xp_rating (care ramane in calculul XP-ului lunar), doar ascunde notificarea.
alter table practice_logs add column if not exists notif_cleared boolean not null default false;
