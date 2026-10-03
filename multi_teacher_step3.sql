-- Prime School — pasul 3 (mai multi profesori)
-- Elevii se logheaza cu username + parola. Username-urile se repeta (ex. 5 elevi
-- "tudor", fiecare cu alta parola), deci NU facem username-ul unic, ci
-- COMBINATIA username + parola — ca doi elevi (chiar de la profesori diferiti)
-- sa nu poata avea aceleasi date de logare.
create unique index if not exists students_username_password_key
  on public.students (lower(username), elev_password)
  where username is not null and elev_password is not null;
