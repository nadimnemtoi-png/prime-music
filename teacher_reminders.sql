-- Prime School — notificare pe telefon pentru post-it-uri, la ora aleasa.
--  1) remind_at / reminded_at pe teacher_notes
--  2) abonamentele de notificari ale PROFESORILOR (separat de ale elevilor)
--  3) pg_cron: la fiecare 5 minute verifica daca a venit ora vreunui post-it
begin;

alter table public.teacher_notes add column if not exists remind_at   timestamptz;
alter table public.teacher_notes add column if not exists reminded_at timestamptz;
create index if not exists teacher_notes_remind_idx on public.teacher_notes (remind_at) where reminded_at is null;

create table if not exists public.teacher_push_subscriptions (
  id           bigint generated always as identity primary key,
  teacher_id   uuid not null references public.teachers(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  last_seen_at timestamptz default now(),
  last_sent_at timestamptz,
  created_at   timestamptz not null default now()
);
-- fara reguli publice: doar serverul (cheia service_role) citeste/scrie abonamentele
alter table public.teacher_push_subscriptions enable row level security;
revoke all on public.teacher_push_subscriptions from anon, authenticated;

commit;

-- (in afara tranzactiei) programarea verificarii la 5 minute
select cron.unschedule('prime-teacher-reminders') where exists (select 1 from cron.job where jobname = 'prime-teacher-reminders');
select cron.schedule('prime-teacher-reminders', '*/5 * * * *',
  $$select net.http_post(url := 'https://primeschool.ro/api/push?a=reminders', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 30000)$$);
