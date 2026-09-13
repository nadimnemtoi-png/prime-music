-- Ca sa stim cati elevi folosesc site-ul instalat ca aplicatie (PWA) pe
-- ecranul principal, nu doar dintr-un tab de browser — marcam asta la fiecare
-- vizita inregistrata (site_visits), detectat automat din pagina (display-mode
-- standalone / navigator.standalone pe iOS).
alter table site_visits add column if not exists is_pwa boolean not null default false;
