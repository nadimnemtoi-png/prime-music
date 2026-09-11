-- Actualizează do_daily_spin pentru roata cu 9 felii (s-a scos una din
-- cele două felii "1 monedă"):
-- 1 Nimic, 1x "1 monedă", 2x "5 monede", 2x Freeze, 1x "10 monede",
-- 1x "3 monede", 1x "Spin din nou".
-- Fiecare felie are exact aceeași șansă: alegem un index 0-8 uniform
-- (nu praguri procentuale) ca să nu existe nicio rotunjire — 1/9 exact
-- pentru fiecare felie, la fel ca la o ruletă reală cu 9 poziții egale.

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

  -- Index 0-8, corespunzand exact ordinii feliilor de pe roata (SPIN_SEGMENTS din index.html):
  -- 0 Nimic | 1 "1 moneda" | 2 "5 monede" (#1) | 3 Freeze (#1) | 4 "10 monede"
  -- 5 "3 monede" | 6 "Spin din nou" | 7 "5 monede" (#2) | 8 Freeze (#2)
  v_idx := floor(random()*9)::integer;
  case v_idx
    when 0 then v_type := 'nimic';  v_amount := 0;  v_sub := 0;
    when 1 then v_type := 'coin';   v_amount := 1;  v_sub := 0;
    when 2 then v_type := 'coin';   v_amount := 5;  v_sub := 0;
    when 3 then v_type := 'freeze'; v_amount := 1;  v_sub := 0;
    when 4 then v_type := 'coin';   v_amount := 10; v_sub := 0;
    when 5 then v_type := 'coin';   v_amount := 3;  v_sub := 0;
    when 6 then v_type := 'respin'; v_amount := 0;  v_sub := 0;
    when 7 then v_type := 'coin';   v_amount := 5;  v_sub := 1;
    when 8 then v_type := 'freeze'; v_amount := 1;  v_sub := 1;
  end case;

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
