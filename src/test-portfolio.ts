/**
 * OptiChannel Portfolio & Pricing Test
 *
 * Demonstrates CEX-like features:
 * - Real-time option pricing with Black-Scholes
 * - Greeks calculation (Delta, Gamma, Theta, Vega, Rho)
 * - Position management with P&L tracking
 * - Portfolio analytics with aggregate Greeks
 */

import { PythClient } from './lib/pyth/index.js';
import { blackScholes, impliedVolatility, probabilityOfProfit } from './lib/pricing/index.js';
import { PositionManager } from './lib/portfolio/index.js';
import { Option } from './lib/options/types.js';
import { Hex } from 'viem';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL - CEX-LIKE OPTIONS TRADING DEMO');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Initialize Pyth for live prices
  const pyth = new PythClient();
  const priceData = await pyth.getEthUsdPrice();
  const spotPrice = priceData.price;

  console.log(`📊 Live ETH/USD Price: $${spotPrice.toFixed(2)}`);
  console.log(`   Confidence: ±$${priceData.confidence.toFixed(2)}`);
  console.log('');

  // ============================================================================
  // SECTION 1: Black-Scholes Pricing Demo
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  BLACK-SCHOLES OPTION PRICING                                   │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const strikes = [
    spotPrice * 0.9,   // 10% OTM put / 10% ITM call
    spotPrice * 0.95,  // 5% OTM put / 5% ITM call
    spotPrice,         // ATM
    spotPrice * 1.05,  // 5% OTM call / 5% ITM put
    spotPrice * 1.1,   // 10% OTM call / 10% ITM put
  ];

  const timeToExpiry = 7 / 365; // 7 days
  const volatility = 0.65;      // 65% IV (typical for crypto)
  const riskFreeRate = 0.05;    // 5%

  console.log(`Parameters: 7-day expiry, 65% IV, 5% risk-free rate\n`);
  console.log('Strike      | Call Price |  Delta  |  Gamma  |  Theta  |  Vega   | Put Price |  Delta  ');
  console.log('------------|------------|---------|---------|---------|---------|-----------|----------');

  for (const strike of strikes) {
    const call = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      volatility,
      riskFreeRate,
      optionType: 'call',
    });

    const put = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      volatility,
      riskFreeRate,
      optionType: 'put',
    });

    const moneyness = strike < spotPrice ? 'ITM' : strike > spotPrice ? 'OTM' : 'ATM';

    console.log(
      `$${strike.toFixed(0).padEnd(9)} | ` +
      `$${call.price.toFixed(2).padStart(9)} | ` +
      `${call.greeks.delta.toFixed(3).padStart(7)} | ` +
      `${call.greeks.gamma.toFixed(5).padStart(7)} | ` +
      `${call.greeks.theta.toFixed(2).padStart(7)} | ` +
      `${call.greeks.vega.toFixed(2).padStart(7)} | ` +
      `$${put.price.toFixed(2).padStart(8)} | ` +
      `${put.greeks.delta.toFixed(3).padStart(8)}`
    );
  }
  console.log('');

  // ============================================================================
  // SECTION 2: Implied Volatility Calculation
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  IMPLIED VOLATILITY SOLVER                                      │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const atmStrike = Math.round(spotPrice / 100) * 100;
  const marketPremium = 150; // Example market price

  const iv = impliedVolatility(
    marketPremium,
    spotPrice,
    atmStrike,
    timeToExpiry,
    riskFreeRate,
    'call'
  );

  console.log(`Given: ATM Call @ $${atmStrike} trading at $${marketPremium}`);
  console.log(`Implied Volatility: ${(iv * 100).toFixed(2)}%\n`);

  // Verify by repricing
  const verifyPrice = blackScholes({
    spot: spotPrice,
    strike: atmStrike,
    timeToExpiry,
    volatility: iv,
    riskFreeRate,
    optionType: 'call',
  });
  console.log(`Verification: BS price with ${(iv * 100).toFixed(2)}% IV = $${verifyPrice.price.toFixed(2)}\n`);

  // ============================================================================
  // SECTION 3: Probability of Profit
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  PROBABILITY OF PROFIT ANALYSIS                                 │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const otmCallStrike = spotPrice * 1.1;
  const otmCallPrice = blackScholes({
    spot: spotPrice,
    strike: otmCallStrike,
    timeToExpiry,
    volatility,
    riskFreeRate,
    optionType: 'call',
  });

  const pop = probabilityOfProfit(
    spotPrice,
    otmCallStrike,
    timeToExpiry,
    volatility,
    riskFreeRate,
    otmCallPrice.price,
    'call'
  );

  console.log(`10% OTM Call Analysis:`);
  console.log(`  Strike: $${otmCallStrike.toFixed(2)}`);
  console.log(`  Premium: $${otmCallPrice.price.toFixed(2)}`);
  console.log(`  Breakeven: $${otmCallPrice.breakeven.toFixed(2)}`);
  console.log(`  Probability of Profit: ${(pop * 100).toFixed(1)}%`);
  console.log(`  Intrinsic Value: $${otmCallPrice.intrinsicValue.toFixed(2)}`);
  console.log(`  Time Value: $${otmCallPrice.timeValue.toFixed(2)}\n`);

  // ============================================================================
  // SECTION 4: Position Management Demo
  // ============================================================================
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  POSITION & PORTFOLIO MANAGEMENT                                │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const portfolio = new PositionManager(10000); // $10k starting balance
  console.log(`Initial Balance: $${portfolio.getBalance().toFixed(2)}\n`);

  // Create mock options
  const mockCallOption: Option = {
    id: '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
    underlying: 'ETH/USD',
    strikePrice: BigInt(Math.round(atmStrike * 1e8)),
    expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    premium: BigInt(Math.round(100 * 1e8)),
    optionType: 'call',
    amount: BigInt(1e18),
    writer: '0x0000000000000000000000000000000000000001' as Hex,
    holder: null,
    status: 'open',
    createdAt: Math.floor(Date.now() / 1000),
  };

  const mockPutOption: Option = {
    id: '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex,
    underlying: 'ETH/USD',
    strikePrice: BigInt(Math.round(atmStrike * 1e8)),
    expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    premium: BigInt(Math.round(100 * 1e8)),
    optionType: 'put',
    amount: BigInt(1e18),
    writer: '0x0000000000000000000000000000000000000001' as Hex,
    holder: null,
    status: 'open',
    createdAt: Math.floor(Date.now() / 1000),
  };

  // Open positions
  console.log('Opening Positions:');

  const pos1 = portfolio.openPosition(mockCallOption, 'long', 2, spotPrice);
  console.log(`  ✓ Long 2x ATM Call @ $${pos1.entryPrice.toFixed(2)}`);

  const pos2 = portfolio.openPosition(mockPutOption, 'long', 1, spotPrice);
  console.log(`  ✓ Long 1x ATM Put @ $${pos2.entryPrice.toFixed(2)}`);

  console.log(`\nBalance after opening: $${portfolio.getBalance().toFixed(2)}\n`);

  // Simulate price movement
  const priceScenarios = [
    { price: spotPrice * 1.05, label: '+5% move' },
    { price: spotPrice * 0.95, label: '-5% move' },
    { price: spotPrice * 1.10, label: '+10% move' },
  ];

  console.log('P&L Scenarios:');
  console.log('─────────────────────────────────────────────────────────────────────');

  for (const scenario of priceScenarios) {
    const summary = portfolio.getPortfolio(scenario.price);
    console.log(`\n${scenario.label} (ETH @ $${scenario.price.toFixed(2)}):`);
    console.log(`  Portfolio Value: $${summary.totalValue.toFixed(2)}`);
    console.log(`  Total P&L: $${summary.totalPnl.toFixed(2)} (${summary.totalPnlPercent.toFixed(2)}%)`);
    console.log(`  Aggregate Greeks:`);
    console.log(`    Delta: ${summary.aggregateGreeks.delta.toFixed(3)}`);
    console.log(`    Gamma: ${summary.aggregateGreeks.gamma.toFixed(5)}`);
    console.log(`    Theta: $${summary.aggregateGreeks.theta.toFixed(2)}/day`);
    console.log(`    Vega: $${summary.aggregateGreeks.vega.toFixed(2)}/1% IV`);
  }

  // Final portfolio summary
  console.log('\n');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  PORTFOLIO SUMMARY (Current Price)                              │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  const finalSummary = portfolio.getPortfolio(spotPrice);

  console.log('Open Positions:');
  console.log('────────────────────────────────────────────────────────────────');
  for (const pos of finalSummary.positions) {
    const type = pos.option.optionType.toUpperCase();
    const strike = Number(pos.option.strikePrice) / 1e8;
    console.log(`  ${pos.side.toUpperCase()} ${pos.size}x ${type} @ $${strike.toFixed(0)}`);
    console.log(`    Entry: $${pos.entryPrice.toFixed(2)} → Current: $${pos.currentPrice.toFixed(2)}`);
    console.log(`    P&L: $${pos.pnl.toFixed(2)} (${pos.pnlPercent.toFixed(2)}%)`);
    console.log(`    Greeks: Δ=${pos.greeks.delta.toFixed(3)} Γ=${pos.greeks.gamma.toFixed(5)} θ=${pos.greeks.theta.toFixed(2)} ν=${pos.greeks.vega.toFixed(2)}`);
  }

  console.log('\nPortfolio Totals:');
  console.log('────────────────────────────────────────────────────────────────');
  console.log(`  Market Value:    $${finalSummary.totalValue.toFixed(2)}`);
  console.log(`  Total P&L:       $${finalSummary.totalPnl.toFixed(2)} (${finalSummary.totalPnlPercent.toFixed(2)}%)`);
  console.log(`  Buying Power:    $${finalSummary.buyingPower.toFixed(2)}`);
  console.log(`  Margin Required: $${finalSummary.marginRequired.toFixed(2)}`);
  console.log('\nAggregate Greeks:');
  console.log(`  Net Delta: ${finalSummary.aggregateGreeks.delta.toFixed(3)}`);
  console.log(`  Net Gamma: ${finalSummary.aggregateGreeks.gamma.toFixed(5)}`);
  console.log(`  Net Theta: $${finalSummary.aggregateGreeks.theta.toFixed(2)}/day`);
  console.log(`  Net Vega:  $${finalSummary.aggregateGreeks.vega.toFixed(2)}/1% IV`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  CEX-LIKE FEATURES DEMO COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
