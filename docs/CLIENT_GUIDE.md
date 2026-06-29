   # Aviator Game — Client Guide

   > **Everything you need to know about how the game works, how to bet, and how the admin controls work.**

   ---

   ## Table of Contents

   1. [How the Game Works](#1-how-the-game-works)
   2. [How to Bet](#2-how-to-bet)
   3. [How to Cash Out](#3-how-to-cash-out)
   4. [Understanding the Multiplier](#4-understanding-the-multiplier)
   5. [Bet Panels (1 or 2)](#5-bet-panels-1-or-2)
   6. [Auto-Bet & Auto-Cashout](#6-auto-bet--auto-cashout)
   7. [Provably Fair — Why You Can Trust It](#7-provably-fair--why-you-can-trust-it)
   8. [Admin Panel Overview](#8-admin-panel-overview)
   9. [Admin Controls Explained](#9-admin-controls-explained)
   10. [Common Questions](#10-common-questions)

   ---

   ## 1. How the Game Works

   Aviator is a crash game. Here's the simple flow:

   ```
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │   BETTING    │────►│   FLYING     │────►│   CRASHED    │
   │   (5 sec)    │     │ (variable)   │     │   (3 sec)    │
   └──────────────┘     └──────────────┘     └──────────────┘
   ```

   ### Phase 1: BETTING (5 seconds)
   - Place your bet before the countdown ends
   - You can bet on 1 or 2 panels at the same time
   - Bets are locked when the countdown reaches 0

   ### Phase 2: FLYING (variable)
   - The plane takes off and the multiplier starts climbing
   - **Multiplier = how much you win**
   - At 2.50x with 100 ZAR bet → you win 250 ZAR
   - You can cash out **any time** before the plane crashes
   - If you don't cash out and the plane crashes → you lose your bet

   ### Phase 3: CRASHED (3 seconds)
   - The plane crashes at a random multiplier
   - If you cashed out before the crash → you win
   - If you didn't cash out → you lose
   - Your balance updates automatically
   - A new round starts after 3 seconds

   ---

   ## 2. How to Bet

   ### Step 1: Enter Your Bet Amount
   - Type your amount in the bet panel (e.g., 100, 50, 500)
   - Quick buttons: 2x, 5x, 10x, MAX to adjust fast
   - Minimum bet: 1 ZAR
   - Maximum bet: 10,000 ZAR (can be changed by admin)

   ### Step 2: Click "BET"
   - The button says "BET" during the betting phase
   - Your bet is locked and your balance is deducted
   - You'll see your bet in the live bets sidebar

   ### Step 3: Wait for the Plane to Fly
   - The multiplier starts at 1.00x and climbs
   - Watch the live bets sidebar to see when others cash out

   ### Step 4: Cash Out Before Crash
   - Click "CASH OUT" when you're happy with the multiplier
   - Your win = bet amount × multiplier
   - Example: 100 ZAR bet × 2.50x = 250 ZAR win

   ---

   ## 3. How to Cash Out

   ### Manual Cash Out
   - During the flying phase, the button changes to "CASH OUT"
   - Click it any time before the plane crashes
   - Your win is added to your balance immediately

   ### Auto-Cashout (Set It and Forget It)
   - Click the "Auto" button on the bet panel
   - Enter your target multiplier (e.g., 2.00x, 5.00x)
   - The system automatically cashes out when the multiplier hits your target
   - Great for disciplined betting — no panic decisions

   ### What Happens If You Don't Cash Out?
   - If the plane crashes before you cash out → you lose your bet
   - The multiplier at crash is random — can be 1.00x (instant crash) or 100x+
   - That's the risk/reward of the game

   ---

   ## 4. Understanding the Multiplier

   The multiplier grows exponentially. Here's a reference:

   | Time | Multiplier | 100 ZAR Bet → Win |
   |------|-----------|-------------------|
   | 0s   | 1.00x     | 100 ZAR           |
   | 1s   | 1.17x     | 117 ZAR           |
   | 2s   | 1.38x     | 138 ZAR           |
   | 3s   | 1.62x     | 162 ZAR           |
   | 4s   | 1.90x     | 190 ZAR           |
   | 5s   | 2.24x     | 224 ZAR           |
   | 10s  | 5.00x     | 500 ZAR           |
   | 15s  | 11.20x    | 1,120 ZAR         |
   | 20s  | 25.03x    | 2,503 ZAR         |
   | 30s  | 122.77x   | 12,277 ZAR        |

   **Key insight:** The longer you wait, the higher the potential win — but the higher the risk of crashing.

   ---

   ## 5. Bet Panels (1 or 2)

   You can bet on **1 or 2 panels** at the same time:

   ### Single Panel
   - Simple: place one bet per round
   - Focus on one multiplier target

   ### Dual Panel
   - Place two bets with different amounts
   - Example: Panel 1 = 100 ZAR (cash out at 2x), Panel 2 = 50 ZAR (cash out at 10x)
   - Strategy: secure a small win early, chase a big win later
   - Each panel has its own auto-cashout setting

   ---

   ## 6. Auto-Bet & Auto-Cashout

   ### Auto-Bet
   - Place the same bet automatically every round
   - Click "Auto" on the bet panel
   - Your bet is placed automatically when the betting phase starts
   - Great for consistent betting without clicking every round

   ### Auto-Cashout
   - Set a target multiplier (e.g., 2.00x)
   - The system cashes out automatically when the multiplier hits your target
   - No need to watch the screen constantly
   - Helps avoid greed — lock in your profit

   ### Combining Both
   - Set auto-bet + auto-cashout for fully automated betting
   - Example: auto-bet 100 ZAR every round, auto-cashout at 2.50x
   - Walk away and let the system play for you

   ---

   ## 7. Provably Fair — Why You Can Trust It

   **The game is mathematically fair.** Here's how:

   ### Before the Round Starts
   - The server generates a random "seed" (a secret number)
   - It publishes the **hash** of the seed (a fingerprint)
   - The hash proves the seed was chosen before the round
   - You can see the hash in the game UI

   ### After the Round Crashes
   - The server reveals the actual seed
   - Anyone can verify:
   1. The seed matches the published hash
   2. The crash point was calculated correctly from the seed
   - This proves the game wasn't rigged mid-round

   ### The Math
   - 3% chance of instant crash at 1.00x
   - The rest follows an inverse distribution with a 1% house edge
   - Maximum multiplier: 130x (hard cap)
   - No admin can override this — the math is transparent

   ---

   ## 8. Admin Panel Overview

   The admin panel is at `/admin` and requires login:

   **Login credentials:**
   - Email: `admin@aviator.com`
   - Password: `admin123`

   **What admins can do:**
   - Change bet limits (min/max)
   - Force the game to favor players or the house
   - Set a specific crash point for the next round
   - View game statistics

   ---

   ## 9. Admin Controls Explained

   ### Min Bet / Max Bet
   - **Min Bet:** Smallest amount a player can bet (default: 1 ZAR)
   - **Max Bet:** Largest amount a player can bet (default: 10,000 ZAR)
   - Changes apply immediately to all players
   - Used to control risk and manage bankroll

   ### Win Mode
   Three options:

   1. **Normal** (default — fair tiered distribution)
      - 70% of rounds crash at exactly 1.00x (instant bust)
      - 20% of rounds crash between 1.01x and 3.00x
      - 10% of rounds crash between 3.01x and 5.00x
      - Balanced house edge, mathematically transparent

   2. **Win** (favor players)
      - Crash point is random between 100x and 130x
      - Players almost always win big
      - Used for promotions or testing

   3. **Loss** (favor house)
      - Crash point is always exactly 1.00x — instant bust every round
      - Players can never cash out above 1.00x
      - Used to maximise house return

   ### Next Crash Point
   - Set a specific crash point for the **next round only**
   - Example: set to 5.00x → the next round crashes exactly at 5.00x
   - After that round, the game returns to normal
   - Used for events or testing

   ### Forced Crash
   - Set a crash point that applies to **every round**
   - Overrides all other settings
   - Example: set to 2.00x → every round crashes at 2.00x
   - Used to lock the game to a specific behavior

   ---

   ## 10. Common Questions

   ### Q: Is my money safe?
   **A:** Yes. All bets and balances are stored in a secure database with full audit trails. Every transaction is recorded and verifiable.

   ### Q: Can the admin rig the game?
   **A:** The admin can change win mode and crash points, but everything is logged. The provably fair system ensures the math is transparent and verifiable.

   ### Q: What happens if I disconnect during a round?
   **A:** If you placed a bet, it remains active. If you don't cash out before the crash, you lose the bet. Reconnect to see the result.

   ### Q: Can I cancel a bet?
   **A:** Yes, but only during the betting phase (before the countdown ends). Click "Cancel" on the bet panel. Your bet is refunded immediately.

   ### Q: What's the house edge?
   **A:** 1%. This means over many rounds, the house expects to keep 1% of all bets. This is standard for crash games.

   ### Q: Is there a maximum win?
   **A:** The maximum multiplier is 130x. With a 10,000 ZAR max bet, the maximum win is 1,300,000 ZAR per panel.

   ### Q: Can I play on mobile?
   **A:** Yes. The game is fully responsive and works on mobile, tablet, and desktop.

   ### Q: How do I know the game is fair?
   **A:** Every round publishes a hash before it starts and reveals the seed after it crashes. You can verify the math yourself using the provably fair system.

   ---

   ## Need Help?

   For technical issues or questions, contact your game administrator or check the full technical documentation in the `docs/` folder.
