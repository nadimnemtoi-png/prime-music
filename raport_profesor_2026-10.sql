-- Raport săptămânal / lunar (Wrapped) pentru profesori:
-- ține minte ce raport a văzut deja fiecare profesor, ca să nu reapară pe alt dispozitiv.
alter table teachers add column if not exists report_week_seen date;
alter table teachers add column if not exists report_month_seen text;
-- profesorii pot scrie doar aceste 2 coloane, pe rândul lor (politica existentă)
grant update (report_week_seen, report_month_seen) on public.teachers to authenticated;
