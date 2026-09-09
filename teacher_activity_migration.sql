-- Tab nou in Notificari (partea de profesor): "Activitate elevi" — un jurnal
-- de evenimente vizibil DOAR profesorului (spre deosebire de tabelul
-- "notifications", care e mesajele trimise elevilor).
create table if not exists teacher_activity (
  id bigint generated always as identity primary key,
  type text not null,
  student_id uuid references students(id) on delete cascade,
  message text not null,
  icon text,
  created_at timestamptz not null default now()
);
create index if not exists teacher_activity_created_idx on teacher_activity(created_at desc);

-- Tine minte daca elevul e in top 5 chiar acum, ca sa nu-l anuntam la fiecare
-- verificare cat timp ramane acolo — doar cand INTRA din nou in top 5.
alter table students add column if not exists in_top5 boolean not null default false;

-- Tine minte in ce zi (calendaristica, Romania) am anuntat ultima oara
-- profesorul ca elevul s-a conectat — ca sa anuntam o singura data pe zi,
-- nu de fiecare data cand deschide aplicatia.
alter table students add column if not exists last_connect_notified_date date;
