-- Rulează O SINGURĂ DATĂ, imediat după ce dai push la noua logică de
-- notificări "X a fost înlocuit de Y în top 5".
--
-- De ce: coloana students.in_top5 era actualizată până acum doar pentru
-- elevul care își încărca pagina, deci poate fi puțin "desincronizată" față
-- de topul real (ex: un elev nu și-a mai deschis aplicația de câteva zile,
-- iar flag-ul lui a rămas vechi). Noua logică compară topul de ACUM cu ce
-- arată coloana asta ca să detecteze cine a ieșit și cine a intrat — dacă
-- pornim cu flag-uri desincronizate, poate ieși o notificare falsă o
-- singură dată, imediat după push. Acest script sincronizează flag-urile
-- exact cu topul real de acum, ca prima verificare de după push să pornească
-- corect, fără notificări false.

begin;

update students set in_top5 = false where in_top5 = true;

update students set in_top5 = true
where id in (
  select id from students
  where archived = false and access_blocked = false
  order by monthly_xp desc nulls last
  limit 5
);

commit;
