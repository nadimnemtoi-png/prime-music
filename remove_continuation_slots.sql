-- Convertește sloturile marcate "continuare" (folosite inainte pentru lectii
-- de 2 ore) in sloturi goale normale, editabile — la fel ca oricare alt slot
-- liber din orar. Nu șterge randurile, doar le "resetează" la starea de slot
-- gol (fara elev), ca profesorul sa poata adauga pe ele orice elev, oricand.

begin;

update schedule_slots
set is_continuation = false,
    is_empty = true,
    student_id = null,
    student_id_2 = null,
    student_name = '—',
    student_name_2 = null
where is_continuation = true;

commit;
