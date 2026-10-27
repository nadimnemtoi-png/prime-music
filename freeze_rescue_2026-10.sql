-- Prime School · „Salvează seria mai târziu” (pregătit 27.10.2026)
-- Când elevul zice „Nu” la Freeze, dar AVEA atunci destule Freeze-uri, ținem minte
-- zilele ratate și termenul (sfârșitul zilei de mâine). Până atunci își poate salva
-- seria din butonul de pe cardul de streak. Scrie doar serverul (api/*).
-- Sigur de rulat de mai multe ori. Doar adaugă două coloane, nu schimbă date.
begin;
alter table public.students add column if not exists freeze_rescue_dates date[];
alter table public.students add column if not exists freeze_rescue_until date;
commit;
