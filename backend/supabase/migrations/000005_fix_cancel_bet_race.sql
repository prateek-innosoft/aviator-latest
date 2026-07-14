-- Fix TOCTOU race in cancel_bet: the round-status check read the `rounds`
-- row without a lock, so a concurrent start_round could flip the round
-- from 'betting' to 'flying' in between that read and the bet-row lock
-- being acquired — cancel_bet would still proceed and refund the user for
-- a bet from a round that had already taken off. Adding `for update` to
-- the rounds read serializes it against start_round's UPDATE.
create or replace function cancel_bet(
  p_user_id uuid,
  p_round_id uuid,
  p_panel smallint,
  p_reference text default null
) returns jsonb as $$
declare
  v_bet_id uuid;
  v_amount numeric;
  v_balance numeric;
  v_wallet_version int;
  v_round_status text;
begin
  select status into v_round_status from rounds where id = p_round_id for update;
  if v_round_status <> 'betting' then
    return jsonb_build_object('ok', false, 'reason', 'not_betting');
  end if;

  select id, amount into v_bet_id, v_amount
  from bets
  where user_id = p_user_id and round_id = p_round_id and panel = p_panel and status = 'locked'
  for update;

  if v_bet_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select balance, version into v_balance, v_wallet_version
  from wallets where user_id = p_user_id for update;

  update wallets
    set balance = balance + v_amount,
        version = version + 1,
        updated_at = now()
    where user_id = p_user_id and version = v_wallet_version
    returning balance into v_balance;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'reason', 'concurrent');
  end if;

  update bets set status = 'cancelled', resolved_at = now() where id = v_bet_id;

  insert into wallet_ledger (user_id, type, amount, running_balance, round_id, bet_id, reference)
  values (p_user_id, 'bet_refund', v_amount, v_balance, p_round_id, v_bet_id, p_reference);

  return jsonb_build_object('ok', true, 'balance', v_balance, 'bet_id', v_bet_id);
end;
$$ language plpgsql;
