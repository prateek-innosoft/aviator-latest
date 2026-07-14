-- Single persistent demo wallet — for testing the real money-flow logic
-- without building a full multi-user login system. One shared balance,
-- starting at 50,000, that survives reconnects/reloads (unlike the old
-- per-socket in-memory balance, which reset to a fresh default on every
-- connection).
create table if not exists demo_wallet (
  id int primary key default 1,
  balance numeric(14,2) not null default 50000,
  updated_at timestamptz not null default now(),
  constraint demo_wallet_single_row check (id = 1)
);

insert into demo_wallet (id, balance)
values (1, 50000)
on conflict (id) do nothing;

-- Atomic adjust — avoids the classic read-then-write race (two concurrent
-- demo sessions both reading the same stale balance before either writes).
-- p_delta is negative for a bet (debit), positive for a win/refund (credit).
-- p_min_balance guards against going below 0 on a debit; raises if the
-- resulting balance would violate it, so callers see a clean rejection
-- instead of a silently-wrong balance.
create or replace function demo_wallet_adjust(p_delta numeric, p_min_balance numeric default 0)
returns numeric as $$
declare
  v_balance numeric;
begin
  update demo_wallet
    set balance = balance + p_delta,
        updated_at = now()
    where id = 1 and balance + p_delta >= p_min_balance
  returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_balance';
  end if;

  return v_balance;
end;
$$ language plpgsql;
