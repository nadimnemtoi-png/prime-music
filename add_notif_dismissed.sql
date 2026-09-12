-- Notificarile elevului nu mai dispar automat dupa un timp (nici cele de la
-- SPIN dupa 24h, nici parerea profesorului la o lectie noua) — de acum, elevul
-- le inchide singur prin swipe, iar asta se retine definitiv aici, ca sa nu
-- mai reapara nici la refresh.
alter table notifications add column if not exists dismissed boolean not null default false;

-- notif_cleared de pe practice_logs exista deja (folosit pana acum pentru
-- clear automat la lectie noua) — il refolosim ca "inchis manual prin swipe",
-- fara sa mai fie nevoie de o coloana noua acolo.
