-- Freeze (ingheata o zi ratata din streak) + Spin & Win (1 rotire gratuita pe zi).

-- 1. Coloane noi pe students
alter table students add column if not exists freeze_count integer not null default 0;
-- Retine pentru ce "ultima zi acoperita" a fost deja intrebat elevul daca vrea
-- sa foloseasca Freeze si a raspuns Nu — ca sa nu-l mai intrebam iar si iar
-- pentru aceeasi pauza, dar sa-l intrebam din nou daca apare o pauza noua.
alter table students add column if not exists freeze_offer_dismissed_for_day date;
alter table students add column if not exists last_spin_date date;

-- 2. Zilele "acoperite" cu Freeze — se aduna la zilele de activitate reala
-- (practice_logs / game_scores) cand calculam streak-ul, ca ziua sa conteze
-- ca si cum elevul ar fi facut ceva atunci.
create table if not exists streak_freezes (
  id bigint generated always as identity primary key,
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists streak_freezes_student_idx on streak_freezes(student_id);

-- 3. Functie ATOMICA pentru folosirea Freeze-urilor — primeste EXACT zilele de
-- acoperit (calculate de server, niciodata trimise de telefonul elevului) si
-- verifica soldul chiar in baza de date.
create or replace function use_streak_freeze(p_student_id uuid, p_dates date[])
returns table(success boolean, message text, new_freeze_count integer) as $$
declare
  v_freeze integer;
  v_needed integer := coalesce(array_length(p_dates,1),0);
begin
  select freeze_count into v_freeze from students where id = p_student_id for update;
  if not found then
    return query select false, 'Elev inexistent', 0;
    return;
  end if;
  if v_needed < 1 then
    return query select false, 'Nimic de acoperit', v_freeze;
    return;
  end if;
  if v_freeze < v_needed then
    return query select false, 'Nu ai destule Freeze-uri', v_freeze;
    return;
  end if;
  update students set freeze_count = freeze_count - v_needed where id = p_student_id;
  insert into streak_freezes(student_id, date)
    select p_student_id, d from unnest(p_dates) as d
    on conflict (student_id, date) do nothing;
  return query select true, 'ok', v_freeze - v_needed;
end;
$$ language plpgsql;

-- 4. Functie ATOMICA pentru Spin & Win — alege premiul chiar in baza de date
-- (nu clientul), o singura rotire pe zi (ora Romaniei), acorda premiul si
-- intoarce ce a castigat elevul.
-- Distributie: Nimic 30%, 1 moneda 30%, 5 monede 20%, 10 monede 10%, Freeze 10%.
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
  if v_rand < 0.30 then
    v_type := 'nimic'; v_amount := 0; v_sub := floor(random()*3)::integer;
  elsif v_rand < 0.60 then
    v_type := 'coin'; v_amount := 1; v_sub := floor(random()*3)::integer;
  elsif v_rand < 0.80 then
    v_type := 'coin'; v_amount := 5; v_sub := floor(random()*2)::integer;
  elsif v_rand < 0.90 then
    v_type := 'coin'; v_amount := 10; v_sub := 0;
  else
    v_type := 'freeze'; v_amount := 1; v_sub := 0;
  end if;

  update students
    set last_spin_date = v_today,
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
