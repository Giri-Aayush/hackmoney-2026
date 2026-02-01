/**
 * OptiChannel Multi-Leg Strategy Test
 *
 * Demonstrates option strategies like a real CEX:
 * - Bull/Bear Spreads
 * - Straddles & Strangles
 * - Iron Condors
 * - Butterfly Spreads
 * - Payoff diagrams
 */

import { PythClient } from './lib/pyth/index.js';
import { StrategyBuilder } from './lib/strategies/index.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL - MULTI-LEG STRATEGY DEMO');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Get live price
  const pyth = new PythClient();
  const priceData = await pyth.getEthUsdPrice();
  const spotPrice = priceData.price;
  const roundedSpot = Math.round(spotPrice / 100) * 100;

  console.log(`Live ETH/USD: $${spotPrice.toFixed(2)} (rounded: $${roundedSpot})\n`);

  const builder = new StrategyBuilder();
  builder.setVolatility(0.65); // 65% IV
  const expiryDays = 7;

  // ============================================================================
  // STRATEGY 1: Bull Call Spread
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  1. BULL CALL SPREAD                                            │');
  console.log('│  Bullish: Buy lower call, sell higher call                      │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const bullSpread = builder.bullCallSpread(
    'ETH/USD',
    roundedSpot,
    roundedSpot + 200,
    spotPrice,
    expiryDays
  );

  console.log(`Strategy: ${bullSpread.name}`);
  console.log(`Net Debit: $${bullSpread.netDebit.toFixed(2)}`);
  console.log(`Max Profit: $${typeof bullSpread.maxProfit === 'number' ? bullSpread.maxProfit.toFixed(2) : bullSpread.maxProfit}`);
  console.log(`Max Loss: $${typeof bullSpread.maxLoss === 'number' ? bullSpread.maxLoss.toFixed(2) : bullSpread.maxLoss}`);
  console.log(`Breakeven: $${bullSpread.breakevens[0].toFixed(2)}`);
  console.log('\nLegs:');
  for (const leg of bullSpread.legs) {
    console.log(`  ${leg.side.toUpperCase()} ${leg.quantity}x ${leg.optionType.toUpperCase()} @ $${leg.strike} (premium: $${leg.premium.toFixed(2)})`);
  }

  // Show P&L at different prices
  const bullPnL = builder.getStrategyPnL(bullSpread, spotPrice);
  console.log(`\nCurrent P&L: $${bullPnL.pnl.toFixed(2)}`);
  console.log(`Greeks: Δ=${bullPnL.greeks.delta.toFixed(3)} Γ=${bullPnL.greeks.gamma.toFixed(5)} θ=${bullPnL.greeks.theta.toFixed(2)}\n`);

  // ============================================================================
  // STRATEGY 2: Bear Put Spread
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  2. BEAR PUT SPREAD                                             │');
  console.log('│  Bearish: Buy higher put, sell lower put                        │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const bearSpread = builder.bearPutSpread(
    'ETH/USD',
    roundedSpot - 200,
    roundedSpot,
    spotPrice,
    expiryDays
  );

  console.log(`Strategy: ${bearSpread.name}`);
  console.log(`Net Debit: $${bearSpread.netDebit.toFixed(2)}`);
  console.log(`Max Profit: $${typeof bearSpread.maxProfit === 'number' ? bearSpread.maxProfit.toFixed(2) : bearSpread.maxProfit}`);
  console.log(`Max Loss: $${typeof bearSpread.maxLoss === 'number' ? bearSpread.maxLoss.toFixed(2) : bearSpread.maxLoss}`);
  console.log(`Breakeven: $${bearSpread.breakevens[0].toFixed(2)}\n`);

  // ============================================================================
  // STRATEGY 3: Straddle
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  3. LONG STRADDLE                                               │');
  console.log('│  Volatility play: Buy ATM call + ATM put                        │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const straddle = builder.straddle('ETH/USD', roundedSpot, spotPrice, expiryDays);

  console.log(`Strategy: ${straddle.name}`);
  console.log(`Net Debit: $${straddle.netDebit.toFixed(2)}`);
  console.log(`Max Profit: ${straddle.maxProfit}`);
  console.log(`Max Loss: $${typeof straddle.maxLoss === 'number' ? straddle.maxLoss.toFixed(2) : straddle.maxLoss}`);
  console.log(`Breakevens: $${straddle.breakevens[0].toFixed(2)} / $${straddle.breakevens[1].toFixed(2)}`);
  console.log('\nLegs:');
  for (const leg of straddle.legs) {
    console.log(`  ${leg.side.toUpperCase()} ${leg.quantity}x ${leg.optionType.toUpperCase()} @ $${leg.strike} (premium: $${leg.premium.toFixed(2)})`);
  }

  const straddlePnL = builder.getStrategyPnL(straddle, spotPrice);
  console.log(`\nCurrent Greeks: Δ=${straddlePnL.greeks.delta.toFixed(3)} (near zero = delta neutral)\n`);

  // ============================================================================
  // STRATEGY 4: Iron Condor
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  4. IRON CONDOR                                                 │');
  console.log('│  Range-bound: Sell put spread + sell call spread                │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const ironCondor = builder.ironCondor(
    'ETH/USD',
    roundedSpot - 300, // Buy put
    roundedSpot - 100, // Sell put
    roundedSpot + 100, // Sell call
    roundedSpot + 300, // Buy call
    spotPrice,
    expiryDays
  );

  console.log(`Strategy: ${ironCondor.name}`);
  console.log(`Net Credit: $${(-ironCondor.netDebit).toFixed(2)} (you receive)`);
  console.log(`Max Profit: $${typeof ironCondor.maxProfit === 'number' ? ironCondor.maxProfit.toFixed(2) : ironCondor.maxProfit}`);
  console.log(`Max Loss: $${typeof ironCondor.maxLoss === 'number' ? ironCondor.maxLoss.toFixed(2) : ironCondor.maxLoss}`);
  console.log(`Profit Zone: $${ironCondor.breakevens[0].toFixed(2)} - $${ironCondor.breakevens[1].toFixed(2)}`);
  console.log('\nLegs:');
  for (const leg of ironCondor.legs) {
    console.log(`  ${leg.side.toUpperCase()} ${leg.quantity}x ${leg.optionType.toUpperCase()} @ $${leg.strike} (premium: $${leg.premium.toFixed(2)})`);
  }

  const condorPnL = builder.getStrategyPnL(ironCondor, spotPrice);
  console.log(`\nCurrent P&L: $${condorPnL.pnl.toFixed(2)}`);
  console.log(`Greeks: Δ=${condorPnL.greeks.delta.toFixed(3)} θ=${condorPnL.greeks.theta.toFixed(2)}/day (positive = time decay helps)\n`);

  // ============================================================================
  // STRATEGY 5: Butterfly Spread
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  5. BUTTERFLY SPREAD                                            │');
  console.log('│  Low cost bet: Buy 1, sell 2 middle, buy 1                      │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const butterfly = builder.butterflySpread(
    'ETH/USD',
    roundedSpot - 100,
    roundedSpot,
    roundedSpot + 100,
    spotPrice,
    expiryDays,
    'call'
  );

  console.log(`Strategy: ${butterfly.name}`);
  console.log(`Net Debit: $${butterfly.netDebit.toFixed(2)}`);
  console.log(`Max Profit: $${typeof butterfly.maxProfit === 'number' ? butterfly.maxProfit.toFixed(2) : butterfly.maxProfit} (if price at $${roundedSpot} at expiry)`);
  console.log(`Max Loss: $${typeof butterfly.maxLoss === 'number' ? butterfly.maxLoss.toFixed(2) : butterfly.maxLoss}`);
  console.log(`Breakevens: $${butterfly.breakevens[0].toFixed(2)} - $${butterfly.breakevens[1].toFixed(2)}\n`);

  // ============================================================================
  // PAYOFF COMPARISON TABLE
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  STRATEGY P&L COMPARISON AT EXPIRY                              │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const scenarios = [
    { label: '-10%', price: spotPrice * 0.9 },
    { label: '-5%', price: spotPrice * 0.95 },
    { label: 'ATM', price: spotPrice },
    { label: '+5%', price: spotPrice * 1.05 },
    { label: '+10%', price: spotPrice * 1.1 },
  ];

  console.log('Price       | Bull Spread | Bear Spread | Straddle   | Iron Condor | Butterfly');
  console.log('------------|-------------|-------------|------------|-------------|------------');

  for (const scenario of scenarios) {
    const bullP = builder.calculatePayoff(bullSpread, scenario.price).points.find(p => Math.abs(p.price - scenario.price) < 10)?.profit || 0;
    const bearP = builder.calculatePayoff(bearSpread, scenario.price).points.find(p => Math.abs(p.price - scenario.price) < 10)?.profit || 0;
    const stradP = builder.calculatePayoff(straddle, scenario.price).points.find(p => Math.abs(p.price - scenario.price) < 10)?.profit || 0;
    const condorP = builder.calculatePayoff(ironCondor, scenario.price).points.find(p => Math.abs(p.price - scenario.price) < 10)?.profit || 0;
    const buttP = builder.calculatePayoff(butterfly, scenario.price).points.find(p => Math.abs(p.price - scenario.price) < 10)?.profit || 0;

    const formatPnL = (p: number) => (p >= 0 ? '+' : '') + p.toFixed(0);

    console.log(
      `${scenario.label.padEnd(11)} | ` +
      `$${formatPnL(bullP).padStart(10)} | ` +
      `$${formatPnL(bearP).padStart(10)} | ` +
      `$${formatPnL(stradP).padStart(9)} | ` +
      `$${formatPnL(condorP).padStart(10)} | ` +
      `$${formatPnL(buttP).padStart(9)}`
    );
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  STRATEGY DEMO COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
