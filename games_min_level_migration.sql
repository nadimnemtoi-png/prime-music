-- Jocul "Recunoaște acordul" (pian) devine disponibil de cumparat, dar doar
-- pentru elevii care au ajuns deja la nivelul Aur (4000 XP total) — pretul
-- creste de la 150 la 200 monede. Verificarea nivelului se face chiar in
-- baza de date (nu doar pe telefon), la fel ca soldul de monede, ca sa nu
-- poata fi ocolita.

-- Inlocuim buy_game_unlock cu o versiune care mai primeste si p_min_xp —
-- daca elevul nu are inca destul XP, cumpararea e refuzata indiferent cate
-- monede are. p_min_xp=0 (implicit) pastreaza comportamentul vechi pentru
-- jocurile fara nicio bariera de nivel.
drop function if exists buy_game_unlock(uuid, text, integer);
create or replace function buy_game_unlock(p_student_id uuid, p_game_id text, p_price integer, p_min_xp integer default 0)
returns table(success boolean, new_coins integer, message text) as $$
declare
  v_coins integer;
  v_xp integer;
  v_already_unlocked boolean;
begin
  select coins, game_xp into v_coins, v_xp from students where id = p_student_id for update;
  if not found then
    return query select false, 0, 'Elev inexistent';
    return;
  end if;
  select exists(select 1 from game_unlocks where student_id = p_student_id and game_id = p_game_id) into v_already_unlocked;
  if v_already_unlocked then
    return query select true, v_coins, 'Deja detinut';
    return;
  end if;
  if coalesce(v_xp,0) < p_min_xp then
    return query select false, v_coins, 'Nivel insuficient';
    return;
  end if;
  if v_coins < p_price then
    return query select false, v_coins, 'Fonduri insuficiente';
    return;
  end if;
  update students set coins = coins - p_price where id = p_student_id;
  insert into game_unlocks(student_id, game_id) values (p_student_id, p_game_id);
  insert into coin_ledger(student_id, amount, reason) values (p_student_id, -p_price, 'buy_game:' || p_game_id);
  return query select true, v_coins - p_price, 'Cumparat';
end;
$$ language plpgsql;
