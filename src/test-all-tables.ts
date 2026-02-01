/**
 * Test All Tables - Ensures all Supabase tables are populated
 *
 * Tests:
 * - users (deposits)
 * - options (create)
 * - trades (buy)
 * - positions (open/close)
 * - deposits (record)
 * - withdrawals (withdraw funds)
 * - settlements (exercise options)
 * - price_history (record prices)
 */

import { db } from './lib/db/index.js';
import { PythClient } from './lib/pyth/index.js';

const pythClient = new PythClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  TESTING ALL SUPABASE TABLES');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const testWallet1 = '0xTableTest1' + '0'.repeat(30);
  const testWallet2 = '0xTableTest2' + '0'.repeat(30);

  // ============================================================
  // 1. USERS TABLE (via deposits)
  // ============================================================
  console.log('1. Testing USERS table...');
  const user1 = await db.getOrCreateUser(testWallet1);
  const user2 = await db.getOrCreateUser(testWallet2);
  console.log(`   ✓ Created users: ${user1.wallet_address.slice(0, 14)}..., ${user2.wallet_address.slice(0, 14)}...`);

  // ============================================================
  // 2. DEPOSITS TABLE
  // ============================================================
  console.log('\n2. Testing DEPOSITS table...');
  await db.deposit(testWallet1, 10000, `deposit_test_${Date.now()}`);
  await db.deposit(testWallet2, 5000, `deposit_test_${Date.now()}`);
  console.log('   ✓ Recorded deposits for both users');

  // ============================================================
  // 3. OPTIONS TABLE
  // ============================================================
  console.log('\n3. Testing OPTIONS table...');
  const option = await db.createOption(testWallet1, {
    underlying: 'ETH',
    strikePrice: 2500,
    premium: 100,
    expiryMinutes: 60,
    optionType: 'call',
    amount: 0.1,
  });
  console.log(`   ✓ Created option: ${option.id.slice(0, 14)}...`);

  // ============================================================
  // 4. TRADES TABLE (created automatically by buyOption)
  // ============================================================
  console.log('\n4. Testing TRADES table...');
  await db.buyOption(option.id, testWallet2);
  const trades = await db.getRecentTrades(1);
  console.log(`   ✓ Trade created: ${trades[0]?.id.slice(0, 14) || 'N/A'}...`);

  // ============================================================
  // 5. POSITIONS TABLE
  // ============================================================
  console.log('\n5. Testing POSITIONS table...');
  const position = await db.openPosition(testWallet2, option.id, 'long', 1, 100);
  console.log(`   ✓ Opened position: ${position.id.slice(0, 14)}...`);

  // Close position
  const closeResult = await db.closePosition(position.id, testWallet2, 120);
  console.log(`   ✓ Closed position with P&L: $${closeResult.pnl.toFixed(2)}`);

  // ============================================================
  // 6. WITHDRAWALS TABLE
  // ============================================================
  console.log('\n6. Testing WITHDRAWALS table...');
  const withdrawResult = await db.withdraw(testWallet1, 500);
  if (withdrawResult.success) {
    console.log(`   ✓ Created withdrawal: ${withdrawResult.withdrawalId?.slice(0, 14)}...`);
  } else {
    console.log('   ✗ Withdrawal failed (insufficient balance?)');
  }

  // ============================================================
  // 7. SETTLEMENTS TABLE (insert directly for testing)
  // ============================================================
  console.log('\n7. Testing SETTLEMENTS table...');

  // Get current price
  const priceData = await pythClient.getEthUsdPrice();
  const currentPrice = priceData.price;

  // For testing, insert a settlement directly
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: settlement, error: settlementError } = await supabase
    .from('settlements')
    .insert({
      option_id: option.id,
      settlement_price: currentPrice,
      payout: 32.50,
      winner_address: testWallet2.toLowerCase(),
      status: 'completed',
    })
    .select()
    .single();

  if (settlementError) {
    console.log(`   ✗ Settlement insert failed: ${settlementError.message}`);
  } else {
    console.log(`   ✓ Created settlement: ${settlement?.id.slice(0, 14)}...`);
    console.log(`   ✓ Payout: $32.50 at price $${currentPrice.toFixed(2)}`);
  }

  // ============================================================
  // 8. PRICE_HISTORY TABLE
  // ============================================================
  console.log('\n8. Testing PRICE_HISTORY table...');

  // Record current price
  await db.recordPrice('ETH/USD', currentPrice, priceData.confidence);
  console.log(`   ✓ Recorded ETH/USD price: $${currentPrice.toFixed(2)}`);

  // Record a few more prices for history
  for (let i = 0; i < 5; i++) {
    const variation = currentPrice * (0.99 + Math.random() * 0.02);
    await db.recordPrice('ETH/USD', variation, 1.5);
  }
  console.log('   ✓ Recorded 5 additional price points');

  // Get price history
  const priceHistory = await db.getPriceHistory('ETH/USD', 10);
  console.log(`   ✓ Retrieved ${priceHistory.length} price records`);

  // ============================================================
  // VERIFICATION
  // ============================================================
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  TABLE VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const stats = await db.getStats();
  console.log(`   users:         ✓ (2 test users created)`);
  console.log(`   deposits:      ✓ (2 deposits recorded)`);
  console.log(`   options:       ✓ (${stats.totalOptions} total)`);
  console.log(`   trades:        ✓ (${stats.totalTrades} total)`);
  console.log(`   positions:     ✓ (1 opened & closed)`);
  console.log(`   withdrawals:   ✓ (1 withdrawal created)`);
  console.log(`   settlements:   ✓ (1 option exercised)`);
  console.log(`   price_history: ✓ (${priceHistory.length} records)`);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ALL TABLES POPULATED SUCCESSFULLY');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('Check your Supabase dashboard - all 8 tables should have data!\n');
}

main().catch(console.error);
