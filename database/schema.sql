-- Run once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  role text not null check (role in ('student','instructor')),
  created_at timestamptz not null default now()
);
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.app_users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 150),
  description text not null default '' check (char_length(description) <= 2000),
  duration_minutes integer not null check (duration_minutes between 1 and 300),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_dates_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 5 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_option smallint not null check (correct_option between 0 and 3),
  points integer not null default 1 check (points between 1 and 100),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now()
);
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.app_users(id) on delete cascade,
  score integer not null check (score >= 0),
  total_points integer not null check (total_points >= 0 and score <= total_points),
  submitted_at timestamptz not null default now(),
  unique (exam_id, student_id)
);
create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option smallint check (selected_option between 0 and 3),
  is_correct boolean not null default false,
  unique (attempt_id, question_id)
);
create index if not exists exams_instructor_created_idx on public.exams(instructor_id, created_at desc);
create index if not exists questions_exam_position_idx on public.questions(exam_id, position);
create index if not exists attempts_student_submitted_idx on public.attempts(student_id, submitted_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists exams_set_updated_at on public.exams;
create trigger exams_set_updated_at before update on public.exams for each row execute function public.set_updated_at();

-- The backend uses a server-only Supabase service-role key and performs authorization.
-- Never expose that key in frontend files. RLS is enabled as defense in depth.
alter table public.app_users enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
revoke all on public.app_users, public.exams, public.questions, public.attempts, public.attempt_answers from anon, authenticated;
grant all on public.app_users, public.exams, public.questions, public.attempts, public.attempt_answers to service_role;
