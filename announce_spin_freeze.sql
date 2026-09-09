-- Anunt unic catre TOTI elevii: s-a deschis sectiunea Spin & Win + explicatie Freeze.
-- Ruleaza o singura data in Supabase -> SQL Editor (Run without RLS).
-- Foloseste tabelul "notifications" deja existent, deci apar exact ca orice alta
-- notificare, in acelasi loc (clopotel).

begin;

-- 1) Anunt: s-a deschis Spin & Win (asta va aparea mai sus, fiind mai recenta).
insert into notifications (student_id, title, message, icon, created_at)
select id,
       '🎡 A apărut Spin & Win!',
       'Poți face un SPIN gratuit în fiecare zi din contul tău, direct de pe pagina principală. Poți câștiga monede sau chiar un Freeze!',
       '🎡',
       now()
from students;

-- 2) Explicatie Freeze (put usor mai devreme, ca sa apara imediat sub anuntul de mai sus).
insert into notifications (student_id, title, message, icon, created_at)
select id,
       '❄️ Ce este un Freeze?',
       'Dacă lipsești câteva zile și nu mai apuci să exersezi sau să te joci, un Freeze îți "salvează" streak-ul pentru acea zi, ca și cum ai fi fost activ. Le câștigi doar la SPIN, iar când revii după o pauză, aplicația te întreabă dacă vrei să le folosești.',
       '❄️',
       now() - interval '1 second'
from students;

commit;
