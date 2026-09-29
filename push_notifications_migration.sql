-- Notificari pe telefon (Web Push) — Prime School, 29.09.2026
-- Rulat in Supabase SQL Editor. Tabelele NU au reguli RLS publice: doar
-- functiile de pe server (api/push.js, cu cheia service_role) le folosesc.

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_student_idx on public.push_subscriptions(student_id);
alter table public.push_subscriptions enable row level security;

-- Coada de noapte: ce trimite profesorul intre 22:00 si 07:00 pleaca la 07:00.
create table if not exists public.push_queue (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  body text not null,
  tag text,
  url text default '/',
  created_at timestamptz not null default now()
);
alter table public.push_queue enable row level security;

-- Jurnalul rularilor de seara (garanteaza o singura rulare pe zi).
create table if not exists public.push_runs (
  day date not null,
  kind text not null,
  ran_at timestamptz not null default now(),
  primary key (day, kind)
);
alter table public.push_runs enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_cron ruleaza in UTC. Programam la ambele ore posibile (vara/iarna);
-- endpoint-ul trimite doar cand in Romania e 07:00, respectiv 19:00.
select cron.schedule('prime-push-morning', '0,15,30 4,5 * * *',
  $$select net.http_post(url => 'https://primeschool.ro/api/push?a=morning', body => '{}'::jsonb, headers => '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds => 30000)$$);
select cron.schedule('prime-push-evening', '0,15 16,17 * * *',
  $$select net.http_post(url => 'https://primeschool.ro/api/push?a=evening', body => '{}'::jsonb, headers => '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds => 30000)$$);
