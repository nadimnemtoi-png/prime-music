-- Dacă elevul a câștigat Double XP la SPIN azi, nu mai poate cumpăra Double XP din Shop până mâine
-- (limita pe zi e oricum 1000 cu double, monedele s-ar duce degeaba). Rulat pe 11.11.2026.
alter table public.students add column if not exists spin_double_date date;

create or replace function public.students_mark_spin_double() returns trigger
language plpgsql as $$
begin
  if new.last_spin_date is distinct from old.last_spin_date
     and coalesce(new.double_xp_until, '-infinity'::timestamptz) > coalesce(old.double_xp_until, '-infinity'::timestamptz) then
    new.spin_double_date := new.last_spin_date;
  end if;
  return new;
end $$;
drop trigger if exists students_mark_spin_double on public.students;
create trigger students_mark_spin_double before update on public.students
  for each row execute function public.students_mark_spin_double();

-- shop_buy: în plus față de varianta veche, refuză double_xp dacă spin_double_date = azi (ora României)
-- → mesaj 'Double XP din SPIN azi'
