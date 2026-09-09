-- Notificari generice pentru elevi (ex: "ai primit monede si de ce") — separate
-- de feedback-ul de la repetitii, care foloseste deja practice_logs.

create table if not exists notifications (
  id bigint generated always as identity primary key,
  student_id uuid not null references students(id) on delete cascade,
  title text not null,
  message text not null,
  icon text,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_student_idx on notifications(student_id, created_at desc);
