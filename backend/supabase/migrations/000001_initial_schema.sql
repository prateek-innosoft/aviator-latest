create extension if not exists "uuid-ossp";

create table if not exists config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  kyc_status text default 'pending',
  role text default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists wallets (
  user_id uuid primary key references users(id) on delete cascade,
  currency text default 'INR',
  balance numeric(19,2) default 0 not null,
  version int default 1 not null,
  updated_at timestamptz default now()
);

create table if not exists wallet_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('bet_lock','bet_refund','win','deposit','withdrawal','fee')),
  amount numeric(19,2) not null,
  running_balance numeric(19,2) not null,
  round_id uuid,
  bet_id uuid,
  reference text,
  created_at timestamptz default now()
);

create table if not exists rounds (
  id uuid primary key default uuid_generate_v4(),
  hashed_seed text not null,
  seed text,
  crash_point numeric(19,2),
  status text not null check (status in ('betting','flying','crashed')),
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table if not exists bets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  panel smallint not null check (panel in (0,1)),
  amount numeric(19,2) not null,
  status text not null check (status in ('locked','cashed_out','lost','cancelled')),
  cashout_multiplier numeric(19,2),
  win_amount numeric(19,2),
  locked_at timestamptz default now(),
  resolved_at timestamptz
);

create unique index idx_bets_unique_active
  on bets(user_id, round_id, panel)
  where status <> 'cancelled';

create table if not exists cashouts (
  id uuid primary key default uuid_generate_v4(),
  bet_id uuid not null references bets(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  multiplier numeric(19,2) not null,
  win_amount numeric(19,2) not null,
  created_at timestamptz default now()
);

create table if not exists audit_rounds (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id) on delete cascade,
  hashed_seed text not null,
  seed text,
  crash_point numeric(19,2),
  status text not null,
  server_instance_id text,
  checksum text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists user_limits (
  user_id uuid primary key references users(id) on delete cascade,
  daily_deposit numeric(19,2) default 0,
  daily_withdrawal numeric(19,2) default 0,
  daily_bet numeric(19,2) default 0,
  weekly_deposit numeric(19,2) default 0,
  weekly_withdrawal numeric(19,2) default 0,
  weekly_bet numeric(19,2) default 0,
  max_bet numeric(19,2) default 10000,
  min_bet numeric(19,2) default 1,
  updated_at timestamptz default now()
);

create index if not exists idx_bets_user_status on bets(user_id, status);
create index if not exists idx_bets_round_status on bets(round_id, status);
create index if not exists idx_bets_locked on bets(round_id) where status = 'locked';
create index if not exists idx_wallet_ledger_user_created on wallet_ledger(user_id, created_at desc);
create index if not exists idx_rounds_status_started on rounds(status, started_at desc);
create index if not exists idx_audit_rounds_round on audit_rounds(round_id);

alter table users enable row level security;
alter table wallets enable row level security;
alter table wallet_ledger enable row level security;
alter table bets enable row level security;
alter table cashouts enable row level security;
alter table user_limits enable row level security;

create policy "Users can read own profile" on users
  for select using (auth.uid() = id);

create policy "Users can read own wallet" on wallets
  for select using (auth.uid() = user_id);

create policy "Users can read own ledger" on wallet_ledger
  for select using (auth.uid() = user_id);

create policy "Users can read own bets" on bets
  for select using (auth.uid() = user_id);

create policy "Users can read own cashouts" on cashouts
  for select using (auth.uid() = user_id);

create policy "Users can read own limits" on user_limits
  for select using (auth.uid() = user_id);

create policy "Admins can manage all users" on users
  for all using ((select role from users where id = auth.uid()) = 'admin');

create policy "Admins can manage all wallets" on wallets
  for all using ((select role from users where id = auth.uid()) = 'admin');

create policy "Admins can manage all ledger" on wallet_ledger
  for all using ((select role from users where id = auth.uid()) = 'admin');

create policy "Admins can manage all bets" on bets
  for all using ((select role from users where id = auth.uid()) = 'admin');

create policy "Admins can manage all cashouts" on cashouts
  for all using ((select role from users where id = auth.uid()) = 'admin');

create policy "Admins can manage all limits" on user_limits
  for all using ((select role from users where id = auth.uid()) = 'admin');

insert into config (key, value) values ('bet_limits', '{"min_bet":1,"max_bet":10000,"currency":"INR"}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into config (key, value) values ('game', '{"starting_balance":50000,"house_edge":0.01,"max_multiplier":1000}'::jsonb)
on conflict (key) do update set value = excluded.value;
