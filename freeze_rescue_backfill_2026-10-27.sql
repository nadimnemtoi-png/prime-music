-- „Salvează seria mai târziu” pentru elevii care au zis „Nu” săptămâna asta, având atunci destule
-- Freeze-uri (calculate scăzând Freeze-urile câștigate la Spin după aceea). RULAT pe 27.10.2026.
update public.students set freeze_rescue_dates = array['2026-10-20']::date[], freeze_rescue_until = date '2026-10-28'
 where name = 'Sofia Beșleagă' and freeze_offer_dismissed_for_day = date '2026-10-19';
update public.students set freeze_rescue_dates = array['2026-10-23','2026-10-24']::date[], freeze_rescue_until = date '2026-10-28'
 where name = 'Mateo Amarandei' and freeze_offer_dismissed_for_day = date '2026-10-22';
-- Levi Grosu: a lipsit 26.10, avea 8 Freeze, dar întrebarea nu i-a apărut (jucase deja azi). RULAT pe 27.10.2026.
update public.students set freeze_rescue_dates = array['2026-10-26']::date[], freeze_rescue_until = date '2026-10-28'
 where name = 'Levi Grosu' and freeze_rescue_until is null;
