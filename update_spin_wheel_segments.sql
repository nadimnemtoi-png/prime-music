-- Actualizează do_daily_spin pentru noua distribuție a roții:
-- 1 Nimic, 2 Freeze, 2x "1 monedă", 2x "5 monede", 1x "10 monede",
-- 1x "3 monede" (premiu nou) și 1x "Spin din nou" (premiu nou — dacă
-- pică, elevul poate roti din nou imediat, fără să mai aștepte a doua zi).
-- Fiecare felie are aceeași șansă (10%):
--   Nimic:        10%
--   1 monedă:     20%
--   5 monede:     20%
--   Freeze:       20%
--   3 monede:     10%  (premiu nou)
--   10 monede:    10%
--   Spin din nou: 10%  (premiu nou)

create or replace function do_daily_spin(p_student_id uuid)
returns table(success boolean, message text, outcome_type text, amount integer, new_coins integer, new_freeze_count integer, sub_index integer) as $$
declare
  v_today date := (now() at time zone 'Europe/Bucharest')::date;
  v_last_spin date;
  v_coins integer;
  v_freeze integer;
  v_rand numeric;
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

  v_rand := random();
  if v_rand < 0.10 then
    v_type := 'nimic'; v_amount := 0; v_sub := 0;
  elsif v_rand < 0.30 then
    v_type := 'coin'; v_amount := 1; v_sub := floor(random()*2)::integer;
  elsif v_rand < 0.50 then
    v_type := 'coin'; v_amount := 5; v_sub := floor(random()*2)::integer;
  elsif v_rand < 0.70 then
    v_type := 'freeze'; v_amount := 1; v_sub := floor(random()*2)::integer;
  elsif v_rand < 0.80 then
    v_type := 'coin'; v_amount := 3; v_sub := 0;
  elsif v_rand < 0.90 then
    v_type := 'coin'; v_amount := 10; v_sub := 0;
  else
    v_type := 'respin'; v_amount := 0; v_sub := 0;
  end if;

  update students
    set last_spin_date = (case when v_type = 'respin' then v_last_spin else v_today end),
        coins = coins + (case when v_type = 'coin' then v_amount else 0 end),
        freeze_count = freeze_count + (case when v_type = 'freeze' then v_amount else 0 end)
    where id = p_student_id;

  if v_type = 'coin' then
    insert into coin_ledger(student_id, amount, reason) values (p_student_id, v_amount, 'spin_win');
  end if;

  select coins, freeze_count into v_coins, v_freeze from students where id = p_student_id;

  return query select true, 'ok', v_type, v_amount, v_coins, v_freeze, v_sub;
end;
$$ language plpgsql;
