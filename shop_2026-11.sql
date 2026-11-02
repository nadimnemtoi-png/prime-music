-- Shop (noiembrie 2026): Freeze 30 monede, Double XP 50 monede (1 oră), 10 indicii 50 monede.
-- Prețurile stau AICI, în baza de date — telefonul trimite doar ce cumpără elevul.

-- 1) Coloane noi la elevi
alter table students add column if not exists hint_count integer not null default 0;
alter table students add column if not exists double_xp_until timestamptz;

-- 2) Cumpărarea: verifică monedele, le scade și dă produsul într-un singur pas
create or replace function shop_buy(p_student_id uuid, p_item text)
returns table(success boolean, message text, new_coins integer, new_freeze_count integer, new_hint_count integer, new_double_xp_until timestamptz) as $$
declare
  v_coins integer;
  v_until timestamptz;
  v_price integer;
begin
  v_price := case p_item when 'freeze' then 30 when 'double_xp' then 50 when 'hints' then 50 else null end;
  if v_price is null then
    return query select false, 'Produs necunoscut', 0, 0, 0, null::timestamptz;
    return;
  end if;
  select coins, double_xp_until into v_coins, v_until from students where id = p_student_id for update;
  if not found then
    return query select false, 'Elev inexistent', 0, 0, 0, null::timestamptz;
    return;
  end if;
  if p_item = 'double_xp' and v_until is not null and v_until > now() then
    return query select false, 'Double XP e deja activ', s.coins, s.freeze_count, s.hint_count, s.double_xp_until from students s where s.id = p_student_id;
    return;
  end if;
  if v_coins < v_price then
    return query select false, 'Fonduri insuficiente', s.coins, s.freeze_count, s.hint_count, s.double_xp_until from students s where s.id = p_student_id;
    return;
  end if;
  update students set
    coins = coins - v_price,
    freeze_count = freeze_count + (case when p_item = 'freeze' then 1 else 0 end),
    hint_count = hint_count + (case when p_item = 'hints' then 10 else 0 end),
    double_xp_until = case when p_item = 'double_xp' then now() + interval '1 hour' else double_xp_until end
  where id = p_student_id;
  insert into coin_ledger(student_id, amount, reason) values (p_student_id, -v_price, 'shop:' || p_item);
  return query select true, 'Cumparat', s.coins, s.freeze_count, s.hint_count, s.double_xp_until from students s where s.id = p_student_id;
end;
$$ language plpgsql;

-- 3) Folosirea unui indiciu: scade 1 doar dacă elevul mai are
create or replace function use_hint(p_student_id uuid)
returns table(success boolean, new_hint_count integer) as $$
declare
  v_left integer;
begin
  update students set hint_count = hint_count - 1
  where id = p_student_id and hint_count > 0
  returning hint_count into v_left;
  if found then
    return query select true, v_left;
  else
    return query select false, coalesce((select s.hint_count from students s where s.id = p_student_id), 0);
  end if;
end;
$$ language plpgsql;

-- 4) Doar serverul (api/buy-game.js, cu cheia de service) le poate apela — nu și telefonul direct
revoke execute on function shop_buy(uuid, text) from public, anon, authenticated;
revoke execute on function use_hint(uuid) from public, anon, authenticated;
