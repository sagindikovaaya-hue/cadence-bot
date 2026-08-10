-- Cadence AI Content Manager — Phase 1 schema
-- Run this once in the Supabase SQL editor for your project.

alter table users
  add column if not exists audience text,
  add column if not exists primary_goal text,
  add column if not exists posting_frequency jsonb,
  add column if not exists formats text[],
  add column if not exists streak_current int default 0,
  add column if not exists streak_best int default 0,
  add column if not exists last_active_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_telegram_id_key'
  ) then
    alter table users add constraint users_telegram_id_key unique (telegram_id);
  end if;
end $$;

create table if not exists content_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(telegram_id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  target_percent int,
  goal text,
  formats text[],
  created_at timestamptz not null default now()
);

create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(telegram_id) on delete cascade,
  summary jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(telegram_id) on delete cascade,
  scheduled_date date not null,
  format text not null,
  pillar_key text,
  topic text,
  hook text,
  goal text,
  cta text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  unique (user_id, scheduled_date)
);

create table if not exists homework_items (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(telegram_id) on delete cascade,
  date date not null,
  task text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists content_pillars_user_idx on content_pillars(user_id);
create index if not exists strategies_user_active_idx on strategies(user_id, is_active);
create index if not exists content_items_user_date_idx on content_items(user_id, scheduled_date);
create index if not exists homework_items_user_date_idx on homework_items(user_id, date);
