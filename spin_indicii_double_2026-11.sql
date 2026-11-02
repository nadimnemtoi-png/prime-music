-- Roata (noiembrie 2026): „1 monedă” → „3 indicii”, „Spin din nou” → „Double XP” (o oră).
-- Rămân 9 felii, fiecare cu exact 1/9 șanse. Ordinea feliilor = SPIN_SEGMENTS din app.js:
-- 0 Nimic | 1 3 indicii | 2 5 monede (#1) | 3 Freeze (#1) | 4 10 monede
-- 5 3 monede | 6 Double XP | 7 5 monede (#2) | 8 Freeze (#2)
-- Double XP: o oră de acum; dacă era deja activ, se prelungește cu o oră.
create or replace function do_daily_spin(p_student_id uuid)
returns table(success boolean, message text, outcome_type text, amount integer, new_coins integer, new_freeze_count integer, sub_index integer) as $$
declare
  v_today date := (now() at time zone 'Europe/Bucharest')::date;
  v_last_spin date;
  v_coins integer;
  v_freeze integer;
  v_idx integer;
  v_type text;
  v_amount integer := 0;
  v_sub integer := 0;
begin
  select last_spin_date, coins, freeze_count into v_last_spin, v_coins, v_freeze
    from students where id = p_student_id for update;
  if not found then
    return query select false, 'Elev inexistent', null::text, 0, 0, 0, 0;
    return;
  end if;
  if v_last_spin is not null and v_last_spin = v_today then
    return query select false, 'Ai folosit deja SPIN-ul de azi', null::text, 0, v_coins, v_freeze, 0;
    return;
  end if;

  v_idx := floor(random()*9)::integer;
  case v_idx
    when 0 then v_type := 'nimic';  v_amount := 0;  v_sub := 0;
    when 1 then v_type := 'hint';   v_amount := 3;  v_sub := 0;
    when 2 then v_type := 'coin';   v_amount := 5;  v_sub := 0;
    when 3 then v_type := 'freeze'; v_amount := 1;  v_sub := 0;
    when 4 then v_type := 'coin';   v_amount := 10; v_sub := 0;
    when 5 then v_type := 'coin';   v_amount := 3;  v_sub := 0;
    when 6 then v_type := 'double'; v_amount := 1;  v_sub := 0;
    when 7 then v_type := 'coin';   v_amount := 5;  v_sub := 1;
    when 8 then v_type := 'freeze'; v_amount := 1;  v_sub := 1;
  end case;

  update students
    set last_spin_date = v_today,
        coins = coins + (case when v_type = 'coin' then v_amount else 0 end),
        freeze_count = freeze_count + (case when v_type = 'freeze' then v_amount else 0 end),
        hint_count = hint_count + (case when v_type = 'hint' then v_amount else 0 end),
        double_xp_until = (case when v_type = 'double' then greatest(coalesce(double_xp_until, now()), now()) + interval '1 hour' else double_xp_until end)
    where id = p_student_id;

  if v_type = 'coin' then
    insert into coin_ledger(student_id, amount, reason) values (p_student_id, v_amount, 'spin_win');
  end if;

  select coins, freeze_count into v_coins, v_freeze from students where id = p_student_id;

  return query select true, 'ok', v_type, v_amount, v_coins, v_freeze, v_sub;
end;
$$ language plpgsql;
