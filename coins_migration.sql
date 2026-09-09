-- Sistem de monede pentru elevi: castigate din prezenta la lectii + streak-ul
-- zilnic din cont, cheltuite pe deblocarea jocurilor noi din "magazin".

-- 1. Coloane noi pe students
alter table students add column if not exists coins integer not null default 0;
-- Retine cel mai mare streak pentru care s-a acordat deja bonus, ca sa nu se
-- acorde de doua ori acelasi prag (7, 14, 21 zile...).
alter table students add column if not exists coins_streak_rewarded integer not null default 0;

-- 2. Istoricul monedelor (de unde a venit fiecare castig/cheltuiala) — util si
-- pentru tine, ca sa vezi de ce a primit/cheltuit un elev monede.
create table if not exists coin_ledger (
  id bigint generated always as identity primary key,
  student_id uuid not null references students(id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_student_idx on coin_ledger(student_id, created_at desc);

-- 3. Ce jocuri a deblocat (cumparat) fiecare elev
create table if not exists game_unlocks (
  id bigint generated always as identity primary key,
  student_id uuid not null references students(id) on delete cascade,
  game_id text not null,
  unlocked_at timestamptz not null default now(),
  unique (student_id, game_id)
);

-- 4. Functie ATOMICA pentru bonusul de streak — o apeleaza doar serverul
-- (api/streak-bonus.js), niciodata direct din telefonul elevului, si e sigura
-- la apeluri repetate: acorda bonus o singura data per prag de 7 zile.
create or replace function award_streak_coins(p_student_id uuid, p_current_streak integer, p_coins_per_milestone integer)
returns table(new_coins integer, awarded integer) as $$
declare
  v_already integer;
  v_milestones_already integer;
  v_milestones_now integer;
  v_new_milestones integer;
  v_award integer;
begin
  select coins_streak_rewarded into v_already from students where id = p_student_id for update;
  if not found then
    return query select 0, 0;
    return;
  end if;
  v_milestones_now := floor(p_current_streak::numeric / 7);
  v_milestones_already := floor(v_already::numeric / 7);
  v_new_milestones := greatest(0, v_milestones_now - v_milestones_already);
  v_award := v_new_milestones * p_coins_per_milestone;
  if v_award > 0 then
    update students
      set coins = coins + v_award,
          coins_streak_rewarded = p_current_streak
      where id = p_student_id;
    insert into coin_ledger(student_id, amount, reason) values (p_student_id, v_award, 'streak_milestone');
  end if;
  return query select coins, v_award from students where id = p_student_id;
end;
$$ language plpgsql;

-- 5. Functie ATOMICA pentru cumpararea unui joc — verifica soldul chiar in
-- baza de date (nu in ce trimite telefonul elevului), deci nu poate fi
-- pacalita de doua apasari rapide sau de cineva care modifica raspunsul.
create or replace function buy_game_unlock(p_student_id uuid, p_game_id text, p_price integer)
returns table(success boolean, new_coins integer, message text) as $$
declare
  v_coins integer;
  v_already_unlocked boolean;
begin
  select coins into v_coins from students where id = p_student_id for update;
  if not found then
    return query select false, 0, 'Elev inexistent';
    return;
  end if;
  select exists(select 1 from game_unlocks where student_id = p_student_id and game_id = p_game_id) into v_already_unlocked;
  if v_already_unlocked then
    return query select true, v_coins, 'Deja detinut';
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
