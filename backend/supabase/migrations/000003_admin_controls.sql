-- Singleton row for live game admin settings (source of truth for the game server).
create table if not exists admin_controls (
  id               int primary key default 1 check (id = 1),
  min_bet          numeric(19, 2) not null default 1,
  max_bet          numeric(19, 2) not null default 50000,
  win_mode         text not null default 'normal'
                   check (win_mode in ('normal', 'win', 'loss')),
  forced_crash     numeric(19, 2),
  next_crash_point numeric(19, 2),
  updated_at       timestamptz not null default now(),
  updated_by       text
);

-- Seed from existing bet_limits config when present.
insert into admin_controls (id, min_bet, max_bet)
select
  1,
  coalesce((c.value->>'min_bet')::numeric, 1),
  coalesce((c.value->>'max_bet')::numeric, 50000)
from config c
where c.key = 'bet_limits'
on conflict (id) do nothing;

insert into admin_controls (id) values (1)
on conflict (id) do nothing;
