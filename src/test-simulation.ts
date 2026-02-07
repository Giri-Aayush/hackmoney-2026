/**
 * Optix Real-World Simulation
 *
 * Simulates realistic trading scenarios:
 * - Multiple concurrent users (market makers, retail, whales)
 * - High-frequency option creation and trading
 * - Position management under various market conditions
 * - Edge cases and error handling
 * - Performance metrics
 */

import { db } from './lib/db/index.js';
import { config } from './config/index.js';
import { PythClient } from './lib/pyth/client.js';

// Simulation configuration
const SIM_CONFIG = {
  numMarketMakers: 3,
  numRetailTraders: 10,
  numWhales: 2,
  optionsPerMarketMaker: 5,
  tradesPerRetailTrader: 3,
  simulationRounds: 3,
};

// Performance tracking
const metrics = {
  usersCreated: 0,
  optionsCreated: 0,
  optionsBought: 0,
  positionsOpened: 0,
  positionsClosed: 0,
  errors: 0,
  totalOperations: 0,
  startTime: 0,
  endTime: 0,
};

// Generate random wallet address
function randomWallet(): string {
  const chars = '0123456789abcdef';
  let addr = '0x';
  for (let i = 0; i < 40; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

// Random number in range
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random choice from array
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface SimUser {
  wallet: string;
  type: 'market_maker' | 'retail' | 'whale';
  balance: number;
}

interface SimOption {
  id: string;
  type: 'call' | 'put';
  strike: number;
  premium: number;
  writer: string;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTIX REAL-WORLD SIMULATION');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!config.supabase.url) {
    console.log('ERROR: Supabase not configured');
    process.exit(1);
  }

  metrics.startTime = Date.now();

  // Get live ETH price
  console.log('📡 Fetching live ETH price...');
  const pyth = new PythClient();
  const ethPriceData = await pyth.getEthUsdPrice();
  const ethPrice = ethPriceData.price;
  console.log(`   ETH/USD: $${ethPrice.toFixed(2)}\n`);

  const users: SimUser[] = [];
  const availableOptions: SimOption[] = [];

  // ============================================================================
  // PHASE 1: USER ONBOARDING (Simulating signups)
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 1: USER ONBOARDING');
  console.log(`Creating ${SIM_CONFIG.numMarketMakers} market makers, ${SIM_CONFIG.numRetailTraders} retail traders, ${SIM_CONFIG.numWhales} whales`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Create market makers (high balance, will write options)
  console.log('Creating market makers...');
  for (let i = 0; i < SIM_CONFIG.numMarketMakers; i++) {
    const wallet = randomWallet();
    try {
      const user = await db.getOrCreateUser(wallet);
      // Give market makers extra capital
      await db.updateUserBalance(wallet, 100000);
      users.push({ wallet, type: 'market_maker', balance: 100000 });
      metrics.usersCreated++;
      process.stdout.write('.');
    } catch (err) {
      metrics.errors++;
    }
  }
  console.log(` ${SIM_CONFIG.numMarketMakers} market makers created`);

  // Create retail traders
  console.log('Creating retail traders...');
  for (let i = 0; i < SIM_CONFIG.numRetailTraders; i++) {
    const wallet = randomWallet();
    try {
      await db.getOrCreateUser(wallet);
      users.push({ wallet, type: 'retail', balance: 10000 });
      metrics.usersCreated++;
      process.stdout.write('.');
    } catch (err) {
      metrics.errors++;
    }
  }
  console.log(` ${SIM_CONFIG.numRetailTraders} retail traders created`);

  // Create whales
  console.log('Creating whales...');
  for (let i = 0; i < SIM_CONFIG.numWhales; i++) {
    const wallet = randomWallet();
    try {
      const user = await db.getOrCreateUser(wallet);
      await db.updateUserBalance(wallet, 500000);
      users.push({ wallet, type: 'whale', balance: 500000 });
      metrics.usersCreated++;
      process.stdout.write('.');
    } catch (err) {
      metrics.errors++;
    }
  }
  console.log(` ${SIM_CONFIG.numWhales} whales created\n`);

  // ============================================================================
  // PHASE 2: MARKET MAKERS CREATE OPTIONS
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 2: MARKET MAKERS CREATE OPTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const marketMakers = users.filter(u => u.type === 'market_maker');
  const strikes = [
    Math.round(ethPrice * 0.9 / 100) * 100,  // 10% OTM put
    Math.round(ethPrice * 0.95 / 100) * 100, // 5% OTM put
    Math.round(ethPrice / 100) * 100,        // ATM
    Math.round(ethPrice * 1.05 / 100) * 100, // 5% OTM call
    Math.round(ethPrice * 1.1 / 100) * 100,  // 10% OTM call
  ];

  for (const mm of marketMakers) {
    console.log(`Market Maker ${mm.wallet.slice(0, 10)}... creating options:`);

    for (let i = 0; i < SIM_CONFIG.optionsPerMarketMaker; i++) {
      const strike = randomChoice(strikes);
      const optionType = strike < ethPrice ? 'put' : 'call';
      const premium = randomInRange(50, 300);
      const amount = randomChoice([0.1, 0.25, 0.5, 1.0]);
      const expiryMinutes = randomChoice([30, 60, 120, 240]);

      try {
        const option = await db.createOption(mm.wallet, {
          underlying: 'ETH',
          strikePrice: strike,
          premium,
          expiryMinutes,
          optionType,
          amount,
        });

        availableOptions.push({
          id: option.id,
          type: optionType,
          strike,
          premium,
          writer: mm.wallet,
        });

        metrics.optionsCreated++;
        metrics.totalOperations++;
        console.log(`   ${optionType.toUpperCase()} Strike=$${strike} Premium=$${premium} Size=${amount}`);
      } catch (err) {
        metrics.errors++;
      }
    }
  }
  console.log(`\nTotal options created: ${metrics.optionsCreated}\n`);

  // ============================================================================
  // PHASE 3: TRADING ACTIVITY
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 3: TRADING ACTIVITY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const traders = users.filter(u => u.type === 'retail' || u.type === 'whale');

  for (let round = 1; round <= SIM_CONFIG.simulationRounds; round++) {
    console.log(`\n--- Round ${round}/${SIM_CONFIG.simulationRounds} ---\n`);

    // Shuffle traders for randomness
    const shuffledTraders = [...traders].sort(() => Math.random() - 0.5);

    for (const trader of shuffledTraders) {
      const numTrades = trader.type === 'whale'
        ? SIM_CONFIG.tradesPerRetailTrader * 2
        : SIM_CONFIG.tradesPerRetailTrader;

      for (let t = 0; t < numTrades; t++) {
        // Try to buy a random available option
        if (availableOptions.length === 0) continue;

        const optionIndex = Math.floor(Math.random() * availableOptions.length);
        const option = availableOptions[optionIndex];

        // Skip if trader is the writer
        if (option.writer === trader.wallet) continue;

        try {
          // Check current balance
          const balance = await db.getUserBalance(trader.wallet);

          if (balance >= option.premium) {
            await db.buyOption(option.id, trader.wallet);

            // Remove from available options
            availableOptions.splice(optionIndex, 1);

            metrics.optionsBought++;
            metrics.totalOperations++;

            console.log(`   ${trader.type === 'whale' ? '🐋' : '👤'} ${trader.wallet.slice(0, 8)}... bought ${option.type.toUpperCase()} @ $${option.premium}`);
          }
        } catch (err) {
          // Option might already be sold - this is expected
          if (err instanceof Error && !err.message.includes('already sold')) {
            metrics.errors++;
          }
        }
      }
    }

    // Small delay between rounds
    await sleep(100);
  }

  // ============================================================================
  // PHASE 4: POSITION TRADING
  // ============================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 4: POSITION TRADING (Derivatives)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get remaining open options for position trading
  const openOptions = await db.getOpenOptions();
  const positionIds: string[] = [];

  for (const trader of traders.slice(0, 5)) {
    for (const option of openOptions.slice(0, 3)) {
      const side = randomChoice(['long', 'short'] as const);
      const size = randomChoice([1, 2, 5]);
      const entryPrice = option.premium + randomInRange(-20, 20);

      try {
        const position = await db.openPosition(
          trader.wallet,
          option.id,
          side,
          size,
          Math.max(10, entryPrice)
        );

        positionIds.push(position.id);
        metrics.positionsOpened++;
        metrics.totalOperations++;

        console.log(`   ${trader.wallet.slice(0, 8)}... opened ${side.toUpperCase()} x${size} @ $${entryPrice}`);
      } catch (err) {
        metrics.errors++;
      }
    }
  }

  // Close some positions with P&L
  console.log('\nClosing positions...');
  for (const posId of positionIds.slice(0, Math.floor(positionIds.length / 2))) {
    const trader = randomChoice(traders);
    const exitPrice = randomInRange(50, 200);

    try {
      const result = await db.closePosition(posId, trader.wallet, exitPrice);
      metrics.positionsClosed++;
      metrics.totalOperations++;
      console.log(`   Position closed: P&L ${result.pnl >= 0 ? '+' : ''}$${result.pnl.toFixed(2)}`);
    } catch (err) {
      // Position might belong to different user - expected
    }
  }

  // ============================================================================
  // PHASE 5: EDGE CASES & ERROR HANDLING
  // ============================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 5: EDGE CASES & ERROR HANDLING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let edgeCasesPassed = 0;
  let edgeCasesFailed = 0;

  // Test 1: Insufficient balance
  console.log('Test 1: Insufficient balance...');
  const poorUser = randomWallet();
  await db.getOrCreateUser(poorUser);
  await db.updateUserBalance(poorUser, 1); // Only $1

  try {
    const expensiveOption = await db.createOption(marketMakers[0].wallet, {
      underlying: 'ETH',
      strikePrice: 3000,
      premium: 1000, // $1000 premium
      expiryMinutes: 60,
      optionType: 'call',
      amount: 1,
    });

    await db.buyOption(expensiveOption.id, poorUser);
    console.log('   ❌ Should have failed (insufficient balance)');
    edgeCasesFailed++;
  } catch (err) {
    console.log('   ✓ Correctly rejected: Insufficient balance');
    edgeCasesPassed++;
  }

  // Test 2: Buy already sold option
  console.log('Test 2: Buy already sold option...');
  try {
    const testOption = await db.createOption(marketMakers[0].wallet, {
      underlying: 'ETH',
      strikePrice: 2500,
      premium: 100,
      expiryMinutes: 60,
      optionType: 'call',
      amount: 0.5,
    });

    // First buy succeeds
    await db.buyOption(testOption.id, traders[0].wallet);

    // Second buy should fail
    await db.buyOption(testOption.id, traders[1].wallet);
    console.log('   ❌ Should have failed (already sold)');
    edgeCasesFailed++;
  } catch (err) {
    console.log('   ✓ Correctly rejected: Option already sold');
    edgeCasesPassed++;
  }

  // Test 3: Non-existent option
  console.log('Test 3: Non-existent option...');
  try {
    await db.buyOption('00000000-0000-0000-0000-000000000000', traders[0].wallet);
    console.log('   ❌ Should have failed (not found)');
    edgeCasesFailed++;
  } catch (err) {
    console.log('   ✓ Correctly rejected: Option not found');
    edgeCasesPassed++;
  }

  // Test 4: Concurrent operations (stress test)
  console.log('Test 4: Concurrent operations (10 simultaneous)...');
  const concurrentPromises = [];
  for (let i = 0; i < 10; i++) {
    concurrentPromises.push(
      db.createOption(marketMakers[0].wallet, {
        underlying: 'ETH',
        strikePrice: 2500 + i * 10,
        premium: 100,
        expiryMinutes: 60,
        optionType: 'call',
        amount: 0.1,
      })
    );
  }

  try {
    await Promise.all(concurrentPromises);
    console.log('   ✓ All 10 concurrent operations succeeded');
    edgeCasesPassed++;
  } catch (err) {
    console.log('   ❌ Concurrent operations failed');
    edgeCasesFailed++;
  }

  console.log(`\nEdge cases: ${edgeCasesPassed}/${edgeCasesPassed + edgeCasesFailed} passed`);

  // ============================================================================
  // FINAL METRICS
  // ============================================================================
  metrics.endTime = Date.now();
  const duration = (metrics.endTime - metrics.startTime) / 1000;

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  SIMULATION COMPLETE - METRICS');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Get final stats from DB
  const stats = await db.getStats();
  const recentTrades = await db.getRecentTrades(100);

  console.log('📊 Operations:');
  console.log(`   Users created:     ${metrics.usersCreated}`);
  console.log(`   Options created:   ${metrics.optionsCreated}`);
  console.log(`   Options bought:    ${metrics.optionsBought}`);
  console.log(`   Positions opened:  ${metrics.positionsOpened}`);
  console.log(`   Positions closed:  ${metrics.positionsClosed}`);
  console.log(`   Total operations:  ${metrics.totalOperations}`);
  console.log(`   Errors:            ${metrics.errors}`);

  console.log('\n⏱️  Performance:');
  console.log(`   Duration:          ${duration.toFixed(2)}s`);
  console.log(`   Ops/second:        ${(metrics.totalOperations / duration).toFixed(2)}`);

  console.log('\n💰 Platform Stats:');
  console.log(`   Total options:     ${stats.totalOptions}`);
  console.log(`   Open options:      ${stats.openOptions}`);
  console.log(`   Total trades:      ${stats.totalTrades}`);
  console.log(`   Total volume:      $${stats.totalVolume.toFixed(2)}`);

  console.log('\n📈 Trade Analysis:');
  const premiums = recentTrades.map((t: { premium: number }) => t.premium);
  if (premiums.length > 0) {
    const avgPremium = premiums.reduce((a: number, b: number) => a + b, 0) / premiums.length;
    const maxPremium = Math.max(...premiums);
    const minPremium = Math.min(...premiums);
    console.log(`   Avg premium:       $${avgPremium.toFixed(2)}`);
    console.log(`   Max premium:       $${maxPremium}`);
    console.log(`   Min premium:       $${minPremium}`);
  }

  // Get top balances
  console.log('\n🏆 Top Balances:');
  const allUsers = users.slice(0, 5);
  for (const u of allUsers) {
    const balance = await db.getUserBalance(u.wallet);
    const emoji = u.type === 'whale' ? '🐋' : u.type === 'market_maker' ? '🏦' : '👤';
    console.log(`   ${emoji} ${u.wallet.slice(0, 12)}... $${balance.toFixed(2)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  SIMULATION SUCCESSFUL');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('Check Supabase to see all the generated data!');
  console.log('Tables affected: users, options, trades, positions\n');
}

main().catch(console.error);
