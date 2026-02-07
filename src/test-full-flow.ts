/**
 * Optix Full Flow Test
 *
 * Tests the complete trading flow from user creation to settlement.
 * Watch your Supabase dashboard to see data appear in real-time!
 */

import { db } from './lib/db/index.js';
import { config } from './config/index.js';
import { PythClient } from './lib/pyth/client.js';

// Test wallets
const ALICE = '0xAlice1234567890123456789012345678901234';
const BOB = '0xBob12345678901234567890123456789012345';
const CHARLIE = '0xCharlie12345678901234567890123456789012';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTIX FULL FLOW TEST');
  console.log('  Watch your Supabase dashboard: https://supabase.com/dashboard');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Verify config
  if (!config.supabase.url) {
    console.log('ERROR: Supabase not configured');
    process.exit(1);
  }

  // Get live ETH price
  console.log('📡 Fetching live ETH price from Pyth...');
  const pyth = new PythClient();
  const ethPriceData = await pyth.getEthUsdPrice();
  const ethPrice = ethPriceData.price;
  console.log(`   Current ETH/USD: $${ethPrice.toFixed(2)}\n`);

  // ============================================================================
  // PHASE 1: USER ONBOARDING
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 1: USER ONBOARDING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Creating 3 users: Alice, Bob, Charlie...');
  const alice = await db.getOrCreateUser(ALICE);
  const bob = await db.getOrCreateUser(BOB);
  const charlie = await db.getOrCreateUser(CHARLIE);

  console.log(`   Alice:   ID=${alice.id.slice(0, 8)}... Balance=$${alice.balance}`);
  console.log(`   Bob:     ID=${bob.id.slice(0, 8)}... Balance=$${bob.balance}`);
  console.log(`   Charlie: ID=${charlie.id.slice(0, 8)}... Balance=$${charlie.balance}`);
  console.log('\n   >> Check "users" table in Supabase!\n');
  await sleep(1000);

  // ============================================================================
  // PHASE 2: ALICE WRITES OPTIONS
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 2: ALICE WRITES OPTIONS (Option Writer/Seller)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Calculate strikes based on current price
  const atmStrike = Math.round(ethPrice / 100) * 100; // Round to nearest 100
  const otmCallStrike = atmStrike + 200;
  const otmPutStrike = atmStrike - 200;

  console.log(`Creating options based on ETH @ $${ethPrice.toFixed(2)}...`);

  // ATM Call
  const call1 = await db.createOption(ALICE, {
    underlying: 'ETH',
    strikePrice: atmStrike,
    premium: 150,
    expiryMinutes: 60,
    optionType: 'call',
    amount: 0.5,
  });
  console.log(`   1. ATM CALL: Strike=$${atmStrike}, Premium=$150, Size=0.5 ETH`);

  // OTM Call
  const call2 = await db.createOption(ALICE, {
    underlying: 'ETH',
    strikePrice: otmCallStrike,
    premium: 80,
    expiryMinutes: 120,
    optionType: 'call',
    amount: 1.0,
  });
  console.log(`   2. OTM CALL: Strike=$${otmCallStrike}, Premium=$80, Size=1.0 ETH`);

  // ATM Put
  const put1 = await db.createOption(ALICE, {
    underlying: 'ETH',
    strikePrice: atmStrike,
    premium: 140,
    expiryMinutes: 60,
    optionType: 'put',
    amount: 0.5,
  });
  console.log(`   3. ATM PUT:  Strike=$${atmStrike}, Premium=$140, Size=0.5 ETH`);

  // OTM Put
  const put2 = await db.createOption(ALICE, {
    underlying: 'ETH',
    strikePrice: otmPutStrike,
    premium: 60,
    expiryMinutes: 120,
    optionType: 'put',
    amount: 1.0,
  });
  console.log(`   4. OTM PUT:  Strike=$${otmPutStrike}, Premium=$60, Size=1.0 ETH`);

  console.log('\n   >> Check "options" table in Supabase!\n');
  await sleep(1000);

  // ============================================================================
  // PHASE 3: BOB BUYS OPTIONS
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 3: BOB BUYS OPTIONS (Option Buyer)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bobBalanceBefore = await db.getUserBalance(BOB);
  const aliceBalanceBefore = await db.getUserBalance(ALICE);

  console.log(`Bob buys the ATM CALL from Alice...`);
  console.log(`   Bob balance before:   $${bobBalanceBefore}`);
  console.log(`   Alice balance before: $${aliceBalanceBefore}`);

  await db.buyOption(call1.id, BOB);

  const bobBalanceAfter = await db.getUserBalance(BOB);
  const aliceBalanceAfter = await db.getUserBalance(ALICE);

  console.log(`   Bob balance after:    $${bobBalanceAfter} (-$${call1.premium} premium)`);
  console.log(`   Alice balance after:  $${aliceBalanceAfter} (+$${call1.premium} premium)`);

  console.log('\nBob buys the OTM PUT from Alice...');
  await db.buyOption(put2.id, BOB);
  console.log(`   Bob now holds: 1 CALL + 1 PUT`);

  console.log('\n   >> Check "trades" table in Supabase!\n');
  await sleep(1000);

  // ============================================================================
  // PHASE 4: CHARLIE OPENS POSITIONS
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 4: CHARLIE OPENS POSITIONS (Position Trader)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Charlie opens long and short positions...');

  const longPos = await db.openPosition(CHARLIE, call2.id, 'long', 2, 80);
  console.log(`   1. LONG position: 2 contracts @ $80 entry`);

  const shortPos = await db.openPosition(CHARLIE, put1.id, 'short', 1, 140);
  console.log(`   2. SHORT position: 1 contract @ $140 entry`);

  const charliePositions = await db.getOpenPositions(CHARLIE);
  console.log(`\n   Charlie has ${charliePositions.length} open positions`);

  console.log('\n   >> Check "positions" table in Supabase!\n');
  await sleep(1000);

  // ============================================================================
  // PHASE 5: MARKET OVERVIEW
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 5: MARKET OVERVIEW');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const openOptions = await db.getOpenOptions();
  const calls = await db.getCallOptions();
  const puts = await db.getPutOptions();
  const recentTrades = await db.getRecentTrades(10);
  const stats = await db.getStats();

  console.log('Order Book:');
  console.log(`   Open options: ${openOptions.length}`);
  console.log(`   - Calls available: ${calls.length}`);
  console.log(`   - Puts available: ${puts.length}`);

  console.log('\nRecent Trades:');
  for (const trade of recentTrades.slice(0, 3)) {
    console.log(`   - ${trade.id.slice(0, 8)}... Premium: $${trade.premium}, Size: ${trade.size}`);
  }

  console.log('\nPlatform Statistics:');
  console.log(`   Total options created: ${stats.totalOptions}`);
  console.log(`   Open options: ${stats.openOptions}`);
  console.log(`   Total trades: ${stats.totalTrades}`);
  console.log(`   Total volume: $${stats.totalVolume}`);

  // ============================================================================
  // PHASE 6: SIMULATE POSITION CLOSE
  // ============================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 6: CHARLIE CLOSES POSITION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const exitPrice = 95; // Option premium increased
  console.log(`Charlie closes LONG position @ $${exitPrice} (was $80 entry)...`);

  const { pnl } = await db.closePosition(longPos.id, CHARLIE, exitPrice);
  console.log(`   P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);

  const charlieBalance = await db.getUserBalance(CHARLIE);
  console.log(`   Charlie balance: $${charlieBalance}`);

  const remainingPositions = await db.getOpenPositions(CHARLIE);
  console.log(`   Remaining positions: ${remainingPositions.length}`);

  console.log('\n   >> Check position status changed in Supabase!\n');

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  FINAL BALANCES');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const finalAlice = await db.getUserBalance(ALICE);
  const finalBob = await db.getUserBalance(BOB);
  const finalCharlie = await db.getUserBalance(CHARLIE);

  console.log(`   Alice (Writer):   $${finalAlice} (earned premiums)`);
  console.log(`   Bob (Buyer):      $${finalBob} (paid premiums)`);
  console.log(`   Charlie (Trader): $${finalCharlie} (trading P&L)`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  FULL FLOW TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('Tables populated in Supabase:');
  console.log('   - users: 3 users with balances');
  console.log('   - options: 4 options (calls and puts)');
  console.log('   - trades: 2 trades (option purchases)');
  console.log('   - positions: 2 positions (1 closed, 1 open)');
  console.log('\nGo check your Supabase dashboard!\n');
}

main().catch(console.error);
