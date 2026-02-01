/**
 * OptiChannel Database Test
 *
 * Tests Supabase connection and all database operations.
 */

import { db } from './lib/db/index.js';
import { config } from './config/index.js';

const TEST_WALLET = '0xTestWallet1234567890123456789012345678901';
const TEST_WALLET_2 = '0xTestWallet2345678901234567890123456789012';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL DATABASE TEST');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Check config
  console.log('1. Checking Supabase configuration...');
  if (!config.supabase.url || !config.supabase.anonKey) {
    console.log('   ✗ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }
  console.log(`   URL: ${config.supabase.url}`);
  console.log('   ✓ Configuration found\n');

  // Test user creation
  console.log('2. Testing user creation...');
  try {
    const user = await db.getOrCreateUser(TEST_WALLET);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Wallet: ${user.wallet_address}`);
    console.log(`   Balance: $${user.balance}`);
    console.log('   ✓ User created/retrieved\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Test balance update
  console.log('3. Testing balance operations...');
  try {
    const balance = await db.getUserBalance(TEST_WALLET);
    console.log(`   Current balance: $${balance}`);

    const newBalance = await db.updateUserBalance(TEST_WALLET, balance + 1000);
    console.log(`   After +$1000: $${newBalance}`);
    console.log('   ✓ Balance updated\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}`);
  }

  // Test option creation
  console.log('4. Testing option creation...');
  let optionId: string | null = null;
  try {
    const option = await db.createOption(TEST_WALLET, {
      underlying: 'ETH',
      strikePrice: 2500,
      premium: 100,
      expiryMinutes: 60,
      optionType: 'call',
      amount: 0.1,
    });
    optionId = option.id;
    console.log(`   Option ID: ${option.id}`);
    console.log(`   Type: ${option.option_type.toUpperCase()}`);
    console.log(`   Strike: $${option.strike_price}`);
    console.log(`   Premium: $${option.premium}`);
    console.log(`   Status: ${option.status}`);
    console.log('   ✓ Option created\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}`);
  }

  // Test fetching options
  console.log('5. Testing option queries...');
  try {
    const allOptions = await db.getOpenOptions();
    console.log(`   Total open options: ${allOptions.length}`);

    const calls = await db.getCallOptions();
    console.log(`   Call options: ${calls.length}`);

    const puts = await db.getPutOptions();
    console.log(`   Put options: ${puts.length}`);

    if (optionId) {
      const option = await db.getOption(optionId);
      console.log(`   Fetched option by ID: ${option?.id ? 'Yes' : 'No'}`);
    }
    console.log('   ✓ Option queries working\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}`);
  }

  // Test buying option
  console.log('6. Testing option purchase...');
  if (optionId) {
    try {
      // First create buyer with balance
      await db.getOrCreateUser(TEST_WALLET_2);
      await db.updateUserBalance(TEST_WALLET_2, 10000);

      const boughtOption = await db.buyOption(optionId, TEST_WALLET_2);
      console.log(`   Holder: ${boughtOption.holder_address}`);
      console.log(`   Status: ${boughtOption.status}`);
      console.log('   ✓ Option purchased\n');
    } catch (error) {
      console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  // Test position opening
  console.log('7. Testing position management...');
  try {
    // Create a new option for position testing
    const option = await db.createOption(TEST_WALLET, {
      underlying: 'ETH',
      strikePrice: 2400,
      premium: 80,
      expiryMinutes: 120,
      optionType: 'put',
      amount: 0.2,
    });

    const position = await db.openPosition(
      TEST_WALLET_2,
      option.id,
      'long',
      1,
      80
    );
    console.log(`   Position ID: ${position.id}`);
    console.log(`   Side: ${position.side}`);
    console.log(`   Entry: $${position.entry_price}`);

    const positions = await db.getOpenPositions(TEST_WALLET_2);
    console.log(`   Open positions: ${positions.length}`);
    console.log('   ✓ Position management working\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}\n`);
  }

  // Test trades history
  console.log('8. Testing trade history...');
  try {
    const recentTrades = await db.getRecentTrades(10);
    console.log(`   Recent trades: ${recentTrades.length}`);

    const userTrades = await db.getUserTrades(TEST_WALLET_2);
    console.log(`   User trades: ${userTrades.length}`);
    console.log('   ✓ Trade history working\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}\n`);
  }

  // Test stats
  console.log('9. Testing statistics...');
  try {
    const stats = await db.getStats();
    console.log(`   Total options: ${stats.totalOptions}`);
    console.log(`   Open options: ${stats.openOptions}`);
    console.log(`   Total trades: ${stats.totalTrades}`);
    console.log(`   Total volume: $${stats.totalVolume}`);
    console.log('   ✓ Statistics working\n');
  } catch (error) {
    console.log(`   ✗ Failed: ${error instanceof Error ? error.message : error}\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  DATABASE TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
