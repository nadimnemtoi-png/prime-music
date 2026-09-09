-- Actualizeaza bonusul de streak sa CREASCA la fiecare prag de 7 zile, in loc
-- de o suma fixa: 7 zile = 20 monede, 14 zile = 25, 21 zile = 30, 28 zile = 35,
-- si tot asa (+5 la fiecare 7 zile). Ruleaza asta o singura data, in locul
-- vechii functii award_streak_coins (care primea doar o suma fixa).

drop function if exists award_streak_coins(uuid, integer, integer);

create or replace function award_streak_coins(p_student_id uuid, p_current_streak integer, p_base_coins integer, p_increment integer)
returns table(new_coins integer, awarded integer) as $$
declare
  v_already integer;
  v_milestones_already integer;
  v_milestones_now integer;
  v_award integer;
begin
  select coins_streak_rewarded into v_already from students where id = p_student_id for update;
  if not found then
    return query select 0, 0;
    return;
  end if;
  v_milestones_now := floor(p_current_streak::numeric / 7);
  v_milestones_already := floor(v_already::numeric / 7);
  select coalesce(sum(p_base_coins + p_increment * (gs - 1)), 0)
    into v_award
    from generate_series(v_milestones_already + 1, v_milestones_now) as gs;
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
