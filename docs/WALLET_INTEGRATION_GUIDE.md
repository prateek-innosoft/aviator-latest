# Wallet Integration Guide

This guide shows exactly how to replace the 3 wallet functions in `backend/src/store.ts` with database operations.

## Overview

Replace these 3 functions:
1. `placeBet()` - Debit wallet and record bet
2. `cancelBet()` - Refund wallet and cancel bet
3. `cashoutBet()` - Credit wallet and complete bet

**Critical**: All 3 MUST use database transactions to prevent race conditions.

---

## Function 1: placeBet()

### Current Implementation (In-Memory)

**Location**: `backend/src/store.ts` lines 131-163

```typescript
export function placeBet(
  userId: string,
  roundId: string,
  panel: number,
  amount: number,
  reference: string,
): BetResult {
  const wallet = wallets.get(userId);
  if (!wallet) return { ok: false, reason: "no_wallet" };
  if (!(amount > 0)) return { ok: false, reason: "invalid_amount" };

  const key = betKey(roundId, userId, panel);
  const existing = bets.get(key);
  if (existing && existing.status === "placed") return { ok: false, reason: "duplicate" };

  if (wallet.balance < amount) return { ok: false, reason: "insufficient" };

  // Atomic (synchronous) debit.
  wallet.balance = round2(wallet.balance - amount);
  const bet: BetRecord = {
    id: crypto.randomUUID(),
    userId,
    roundId,
    panel,
    amount,
    reference,
    status: "placed",
    multiplier: null,
    win: null,
  };
  bets.set(key, bet);
  return { ok: true, balance: wallet.balance, bet_id: bet.id };
}
```

### Your Implementation (With Database Transaction)

```typescript
export async function placeBet(
  userId: string,
  roundId: string,
  panel: number,
  amount: number,
  reference: string,
): Promise<BetResult> {
  // Step 1: Check wallet exists
  const wallet = await db.wallets.findOne({ user_id: userId });
  if (!wallet) return { ok: false, reason: "no_wallet" };
  if (!(amount > 0)) return { ok: false, reason: "invalid_amount" };

  // Step 2: Check for duplicate bet
  const existing = await db.bets.findOne({
    user_id: userId,
    round_id: roundId,
    panel: panel,
    status: "placed"
  });
  if (existing) return { ok: false, reason: "duplicate" };

  // Step 3: Check sufficient balance
  if (wallet.balance < amount) return { ok: false, reason: "insufficient" };

  // Step 4: Database transaction (CRITICAL - prevents race conditions)
  try {
    await db.transaction(async (tx) => {
      // Debit wallet
      await tx.wallets.update(
        { user_id: userId },
        { balance: wallet.balance - amount }
      );

      // Insert bet
      await tx.bets.insert({
        id: crypto.randomUUID(),
        user_id: userId,
        round_id: roundId,
        panel: panel,
        amount: amount,
        reference: reference,
        status: "placed",
        multiplier: null,
        win: null,
        created_at: new Date()
      });
    });

    // Step 5: Return success with updated balance
    const updatedWallet = await db.wallets.findOne({ user_id: userId });
    return { 
      ok: true, 
      balance: updatedWallet.balance, 
      bet_id: existing?.id 
    };
  } catch (error) {
    console.error("placeBet transaction failed:", error);
    return { ok: false, reason: "transaction_failed" };
  }
}
```

### Key Changes
- Changed from `function` to `async function`
- Changed return type to `Promise<BetResult>`
- Replaced `wallets.get()` with database query
- Replaced `bets.get()` with database query
- Wrapped debit + insert in `db.transaction()`
- Added error handling

---

## Function 2: cancelBet()

### Current Implementation (In-Memory)

**Location**: `backend/src/store.ts` lines 165-181

```typescript
export function cancelBet(
  userId: string,
  roundId: string,
  panel: number,
  _reference: string,
): BetResult {
  const wallet = wallets.get(userId);
  if (!wallet) return { ok: false, reason: "no_wallet" };
  const key = betKey(roundId, userId, panel);
  const bet = bets.get(key);
  if (!bet || bet.status !== "placed") return { ok: false, reason: "not_found" };

  // Refund.
  wallet.balance = round2(wallet.balance + bet.amount);
  bet.status = "cancelled";
  return { ok: true, balance: wallet.balance };
}
```

### Your Implementation (With Database Transaction)

```typescript
export async function cancelBet(
  userId: string,
  roundId: string,
  panel: number,
  reference: string,
): Promise<BetResult> {
  // Step 1: Check wallet exists
  const wallet = await db.wallets.findOne({ user_id: userId });
  if (!wallet) return { ok: false, reason: "no_wallet" };

  // Step 2: Find the bet
  const bet = await db.bets.findOne({
    user_id: userId,
    round_id: roundId,
    panel: panel,
    status: "placed"
  });
  if (!bet) return { ok: false, reason: "not_found" };

  // Step 3: Database transaction (CRITICAL - prevents race conditions)
  try {
    await db.transaction(async (tx) => {
      // Refund wallet
      await tx.wallets.update(
        { user_id: userId },
        { balance: wallet.balance + bet.amount }
      );

      // Update bet status
      await tx.bets.update(
        { id: bet.id },
        { status: "cancelled" }
      );
    });

    // Step 4: Return success with updated balance
    const updatedWallet = await db.wallets.findOne({ user_id: userId });
    return { ok: true, balance: updatedWallet.balance };
  } catch (error) {
    console.error("cancelBet transaction failed:", error);
    return { ok: false, reason: "transaction_failed" };
  }
}
```

### Key Changes
- Changed from `function` to `async function`
- Changed return type to `Promise<BetResult>`
- Replaced `wallets.get()` with database query
- Replaced `bets.get()` with database query
- Wrapped refund + update in `db.transaction()`
- Added error handling

---

## Function 3: cashoutBet()

### Current Implementation (In-Memory)

**Location**: `backend/src/store.ts` lines 183-202

```typescript
export function cashoutBet(
  userId: string,
  roundId: string,
  panel: number,
  multiplier: number,
  _reference: string,
): BetResult {
  const wallet = wallets.get(userId);
  if (!wallet) return { ok: false, reason: "no_wallet" };
  const key = betKey(roundId, userId, panel);
  const bet = bets.get(key);
  if (!bet || bet.status !== "placed") return { ok: false, reason: "not_found" };

  const win = round2(bet.amount * multiplier);
  wallet.balance = round2(wallet.balance + win);
  bet.status = "cashed_out";
  bet.multiplier = multiplier;
  bet.win = win;
  return { ok: true, balance: wallet.balance, win, multiplier, bet_id: bet.id };
}
```

### Your Implementation (With Database Transaction)

```typescript
export async function cashoutBet(
  userId: string,
  roundId: string,
  panel: number,
  multiplier: number,
  reference: string,
): Promise<BetResult> {
  // Step 1: Check wallet exists
  const wallet = await db.wallets.findOne({ user_id: userId });
  if (!wallet) return { ok: false, reason: "no_wallet" };

  // Step 2: Find the bet
  const bet = await db.bets.findOne({
    user_id: userId,
    round_id: roundId,
    panel: panel,
    status: "placed"
  });
  if (!bet) return { ok: false, reason: "not_found" };

  // Step 3: Calculate win amount
  const win = round2(bet.amount * multiplier);

  // Step 4: Database transaction (CRITICAL - prevents race conditions)
  try {
    await db.transaction(async (tx) => {
      // Credit wallet with win
      await tx.wallets.update(
        { user_id: userId },
        { balance: wallet.balance + win }
      );

      // Update bet status
      await tx.bets.update(
        { id: bet.id },
        { 
          status: "cashed_out",
          multiplier: multiplier,
          win: win
        }
      );
    });

    // Step 5: Return success with updated balance
    const updatedWallet = await db.wallets.findOne({ user_id: userId });
    return { 
      ok: true, 
      balance: updatedWallet.balance, 
      win, 
      multiplier, 
      bet_id: bet.id 
    };
  } catch (error) {
    console.error("cashoutBet transaction failed:", error);
    return { ok: false, reason: "transaction_failed" };
  }
}
```

### Key Changes
- Changed from `function` to `async function`
- Changed return type to `Promise<BetResult>`
- Replaced `wallets.get()` with database query
- Replaced `bets.get()` with database query
- Wrapped credit + update in `db.transaction()`
- Added error handling

---

## Database Schema Required

### Wallets Table
```sql
CREATE TABLE wallets (
  user_id VARCHAR PRIMARY KEY,
  balance DECIMAL NOT NULL DEFAULT 0,
  currency VARCHAR NOT NULL DEFAULT 'INR'
);
```

### Bets Table
```sql
CREATE TABLE bets (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  round_id VARCHAR NOT NULL,
  panel INT NOT NULL,
  amount DECIMAL NOT NULL,
  reference VARCHAR,
  status VARCHAR NOT NULL, -- 'placed', 'cancelled', 'cashed_out'
  multiplier DECIMAL,
  win DECIMAL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Testing Checklist

### Unit Tests
- [ ] Test `placeBet()` with sufficient balance
- [ ] Test `placeBet()` with insufficient balance
- [ ] Test `placeBet()` with duplicate bet
- [ ] Test `cancelBet()` with valid bet
- [ ] Test `cancelBet()` with invalid bet
- [ ] Test `cashoutBet()` with valid bet
- [ ] Test `cashoutBet()` with invalid bet

### Integration Tests
- [ ] Test concurrent `placeBet()` calls
- [ ] Test concurrent `cancelBet()` calls
- [ ] Test concurrent `cashoutBet()` calls
- [ ] Test transaction rollback on error

### Race Condition Tests
- [ ] Test 100+ concurrent `placeBet()` operations
- [ ] Test cashout during round start
- [ ] Test cancel during flying phase

---

## Common Pitfalls to Avoid

### 1. Not Using Transactions
```typescript
// ❌ WRONG - race condition possible
await db.wallets.debit(amount);
await db.bets.insert(bet);

// ✅ CORRECT - atomic operation
await db.transaction(async (tx) => {
  await tx.wallets.debit(amount);
  await tx.bets.insert(bet);
});
```

### 2. Not Checking Balance Before Transaction
```typescript
// ❌ WRONG - transaction fails late
await db.transaction(async (tx) => {
  await tx.wallets.debit(amount); // Might fail if insufficient
  await tx.bets.insert(bet);
});

// ✅ CORRECT - check before transaction
if (wallet.balance < amount) return { ok: false, reason: "insufficient" };
await db.transaction(async (tx) => {
  await tx.wallets.debit(amount);
  await tx.bets.insert(bet);
});
```

### 3. Not Handling Errors
```typescript
// ❌ WRONG - no error handling
await db.transaction(async (tx) => {
  await tx.wallets.debit(amount);
  await tx.bets.insert(bet);
});

// ✅ CORRECT - with error handling
try {
  await db.transaction(async (tx) => {
    await tx.wallets.debit(amount);
    await tx.bets.insert(bet);
  });
} catch (error) {
  console.error("Transaction failed:", error);
  return { ok: false, reason: "transaction_failed" };
}
```

---

## Summary

### What You Need to Do
1. Replace 3 functions in `backend/src/store.ts`
2. Use database transactions for all 3 functions
3. Create wallets and bets tables
4. Test for race conditions

### Time Estimate
- **placeBet()**: 2-4 hours
- **cancelBet()**: 2-3 hours
- **cashoutBet()**: 2-3 hours
- **Testing**: 4-8 hours
- **Total**: 1-2 days for experienced developer

### Critical Requirement
**All 3 functions MUST use database transactions** to prevent race conditions when 100+ players bet/cashout simultaneously.
