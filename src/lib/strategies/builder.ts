import { Hex } from 'viem';
import { Strategy, StrategyLeg, StrategyType, StrategyPayoff, PayoffPoint, StrategyPnL } from './types.js';
import { blackScholes, Greeks } from '../pricing/index.js';

/**
 * StrategyBuilder - Constructs and analyzes multi-leg option strategies
 */
export class StrategyBuilder {
  private volatility: number = 0.6;
  private riskFreeRate: number = 0.05;

  setVolatility(vol: number): void {
    this.volatility = vol;
  }

  setRiskFreeRate(rate: number): void {
    this.riskFreeRate = rate;
  }

  /**
   * Create a Bull Call Spread
   * Buy lower strike call, sell higher strike call
   * Bullish strategy with limited risk and limited profit
   */
  bullCallSpread(
    underlying: string,
    lowerStrike: number,
    upperStrike: number,
    spotPrice: number,
    expiryDays: number
  ): Strategy {
    const timeToExpiry = expiryDays / 365;
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 3600;

    const lowerCall = blackScholes({
      spot: spotPrice,
      strike: lowerStrike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'call',
    });

    const upperCall = blackScholes({
      spot: spotPrice,
      strike: upperStrike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'call',
    });

    const netDebit = lowerCall.price - upperCall.price;
    const maxProfit = upperStrike - lowerStrike - netDebit;
    const maxLoss = netDebit;

    return {
      id: this.generateId(),
      name: `Bull Call Spread ${lowerStrike}/${upperStrike}`,
      type: 'bull_call_spread',
      underlying,
      legs: [
        { optionType: 'call', strike: lowerStrike, side: 'long', quantity: 1, premium: lowerCall.price },
        { optionType: 'call', strike: upperStrike, side: 'short', quantity: 1, premium: upperCall.price },
      ],
      expiry,
      netDebit,
      maxProfit,
      maxLoss,
      breakevens: [lowerStrike + netDebit],
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Create a Bear Put Spread
   * Buy higher strike put, sell lower strike put
   * Bearish strategy with limited risk and limited profit
   */
  bearPutSpread(
    underlying: string,
    lowerStrike: number,
    upperStrike: number,
    spotPrice: number,
    expiryDays: number
  ): Strategy {
    const timeToExpiry = expiryDays / 365;
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 3600;

    const lowerPut = blackScholes({
      spot: spotPrice,
      strike: lowerStrike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'put',
    });

    const upperPut = blackScholes({
      spot: spotPrice,
      strike: upperStrike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'put',
    });

    const netDebit = upperPut.price - lowerPut.price;
    const maxProfit = upperStrike - lowerStrike - netDebit;
    const maxLoss = netDebit;

    return {
      id: this.generateId(),
      name: `Bear Put Spread ${lowerStrike}/${upperStrike}`,
      type: 'bear_put_spread',
      underlying,
      legs: [
        { optionType: 'put', strike: upperStrike, side: 'long', quantity: 1, premium: upperPut.price },
        { optionType: 'put', strike: lowerStrike, side: 'short', quantity: 1, premium: lowerPut.price },
      ],
      expiry,
      netDebit,
      maxProfit,
      maxLoss,
      breakevens: [upperStrike - netDebit],
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Create a Straddle
   * Buy ATM call and ATM put at same strike
   * Profits from large moves in either direction
   */
  straddle(
    underlying: string,
    strike: number,
    spotPrice: number,
    expiryDays: number
  ): Strategy {
    const timeToExpiry = expiryDays / 365;
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 3600;

    const call = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'call',
    });

    const put = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'put',
    });

    const netDebit = call.price + put.price;

    return {
      id: this.generateId(),
      name: `Straddle @ ${strike}`,
      type: 'straddle',
      underlying,
      legs: [
        { optionType: 'call', strike, side: 'long', quantity: 1, premium: call.price },
        { optionType: 'put', strike, side: 'long', quantity: 1, premium: put.price },
      ],
      expiry,
      netDebit,
      maxProfit: 'unlimited',
      maxLoss: netDebit,
      breakevens: [strike - netDebit, strike + netDebit],
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Create a Strangle
   * Buy OTM call and OTM put at different strikes
   * Cheaper than straddle but needs larger moves to profit
   */
  strangle(
    underlying: string,
    putStrike: number,
    callStrike: number,
    spotPrice: number,
    expiryDays: number
  ): Strategy {
    const timeToExpiry = expiryDays / 365;
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 3600;

    const call = blackScholes({
      spot: spotPrice,
      strike: callStrike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'call',
    });

    const put = blackScholes({
      spot: spotPrice,
      strike: putStrike,
      timeToExpiry,
      volatility: this.volatility,
      riskFreeRate: this.riskFreeRate,
      optionType: 'put',
    });

    const netDebit = call.price + put.price;

    return {
      id: this.generateId(),
      name: `Strangle ${putStrike}/${callStrike}`,
      type: 'strangle',
      underlying,
      legs: [
        { optionType: 'put', strike: putStrike, side: 'long', quantity: 1, premium: put.price },
        { optionType: 'call', strike: callStrike, side: 'long', quantity: 1, premium: call.price },
      ],
      expiry,
      netDebit,
      maxProfit: 'unlimited',
      maxLoss: netDebit,
      breakevens: [putStrike - netDebit, callStrike + netDebit],
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Create an Iron Condor
   * Sell OTM put spread + sell OTM call spread
   * Profits from low volatility / range-bound markets
   */
  ironCondor(
    underlying: string,
    putBuyStrike: number,
    putSellStrike: number,
    callSellStrike: number,
    callBuyStrike: number,
    spotPrice: number,
    expiryDays: number
  ): Strategy {
    const timeToExpiry = expiryDays / 365;
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 3600;

    const putBuy = blackScholes({
      spot: spotPrice, strike: putBuyStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType: 'put',
    });
    const putSell = blackScholes({
      spot: spotPrice, strike: putSellStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType: 'put',
    });
    const callSell = blackScholes({
      spot: spotPrice, strike: callSellStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType: 'call',
    });
    const callBuy = blackScholes({
      spot: spotPrice, strike: callBuyStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType: 'call',
    });

    // Net credit = premiums received - premiums paid
    const netCredit = (putSell.price + callSell.price) - (putBuy.price + callBuy.price);
    const maxProfit = netCredit;
    // Max loss is width of wider spread minus credit
    const putSpreadWidth = putSellStrike - putBuyStrike;
    const callSpreadWidth = callBuyStrike - callSellStrike;
    const maxLoss = Math.max(putSpreadWidth, callSpreadWidth) - netCredit;

    return {
      id: this.generateId(),
      name: `Iron Condor ${putBuyStrike}/${putSellStrike}/${callSellStrike}/${callBuyStrike}`,
      type: 'iron_condor',
      underlying,
      legs: [
        { optionType: 'put', strike: putBuyStrike, side: 'long', quantity: 1, premium: putBuy.price },
        { optionType: 'put', strike: putSellStrike, side: 'short', quantity: 1, premium: putSell.price },
        { optionType: 'call', strike: callSellStrike, side: 'short', quantity: 1, premium: callSell.price },
        { optionType: 'call', strike: callBuyStrike, side: 'long', quantity: 1, premium: callBuy.price },
      ],
      expiry,
      netDebit: -netCredit, // Negative because it's a credit
      maxProfit,
      maxLoss,
      breakevens: [putSellStrike - netCredit, callSellStrike + netCredit],
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Create a Butterfly Spread
   * Buy 1 lower, sell 2 middle, buy 1 upper (all calls or all puts)
   * Low cost bet on price staying near middle strike
   */
  butterflySpread(
    underlying: string,
    lowerStrike: number,
    middleStrike: number,
    upperStrike: number,
    spotPrice: number,
    expiryDays: number,
    optionType: 'call' | 'put' = 'call'
  ): Strategy {
    const timeToExpiry = expiryDays / 365;
    const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 3600;

    const lower = blackScholes({
      spot: spotPrice, strike: lowerStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType,
    });
    const middle = blackScholes({
      spot: spotPrice, strike: middleStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType,
    });
    const upper = blackScholes({
      spot: spotPrice, strike: upperStrike, timeToExpiry,
      volatility: this.volatility, riskFreeRate: this.riskFreeRate, optionType,
    });

    const netDebit = lower.price + upper.price - 2 * middle.price;
    const wingWidth = middleStrike - lowerStrike;
    const maxProfit = wingWidth - netDebit;
    const maxLoss = netDebit;

    return {
      id: this.generateId(),
      name: `Butterfly ${lowerStrike}/${middleStrike}/${upperStrike}`,
      type: 'butterfly',
      underlying,
      legs: [
        { optionType, strike: lowerStrike, side: 'long', quantity: 1, premium: lower.price },
        { optionType, strike: middleStrike, side: 'short', quantity: 2, premium: middle.price },
        { optionType, strike: upperStrike, side: 'long', quantity: 1, premium: upper.price },
      ],
      expiry,
      netDebit,
      maxProfit,
      maxLoss,
      breakevens: [lowerStrike + netDebit, upperStrike - netDebit],
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Calculate payoff diagram for a strategy
   */
  calculatePayoff(strategy: Strategy, spotPrice: number, priceRange = 0.3): StrategyPayoff {
    const points: PayoffPoint[] = [];
    const minPrice = spotPrice * (1 - priceRange);
    const maxPrice = spotPrice * (1 + priceRange);
    const step = (maxPrice - minPrice) / 100;

    let minProfit = Infinity;
    let maxProfit = -Infinity;

    for (let price = minPrice; price <= maxPrice; price += step) {
      let profit = -strategy.netDebit;

      for (const leg of strategy.legs) {
        const intrinsic = leg.optionType === 'call'
          ? Math.max(0, price - leg.strike)
          : Math.max(0, leg.strike - price);

        const legValue = intrinsic * leg.quantity;
        profit += leg.side === 'long' ? legValue : -legValue;
      }

      points.push({ price, profit });
      minProfit = Math.min(minProfit, profit);
      maxProfit = Math.max(maxProfit, profit);
    }

    return {
      points,
      maxProfit,
      maxLoss: -minProfit,
      breakevens: strategy.breakevens,
    };
  }

  /**
   * Get current P&L for a strategy given current spot price
   */
  getStrategyPnL(strategy: Strategy, spotPrice: number): StrategyPnL {
    const timeToExpiry = Math.max(0, (strategy.expiry - Date.now() / 1000) / (365 * 24 * 3600));

    const aggregateGreeks: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    const legValues: StrategyPnL['legValues'] = [];
    let currentValue = 0;

    for (const leg of strategy.legs) {
      const bs = blackScholes({
        spot: spotPrice,
        strike: leg.strike,
        timeToExpiry,
        volatility: this.volatility,
        riskFreeRate: this.riskFreeRate,
        optionType: leg.optionType,
      });

      const sideMultiplier = leg.side === 'long' ? 1 : -1;
      const legCurrentValue = bs.price * leg.quantity * sideMultiplier;
      const legCost = leg.premium * leg.quantity * sideMultiplier;
      const legPnL = legCurrentValue - legCost;

      currentValue += legCurrentValue;

      legValues.push({
        leg,
        currentPrice: bs.price,
        pnl: legPnL,
      });

      // Aggregate Greeks
      aggregateGreeks.delta += bs.greeks.delta * leg.quantity * sideMultiplier;
      aggregateGreeks.gamma += bs.greeks.gamma * leg.quantity;
      aggregateGreeks.theta += bs.greeks.theta * leg.quantity * sideMultiplier;
      aggregateGreeks.vega += bs.greeks.vega * leg.quantity;
      aggregateGreeks.rho += bs.greeks.rho * leg.quantity * sideMultiplier;
    }

    const pnl = currentValue + strategy.netDebit; // netDebit is negative for credits
    const pnlPercent = strategy.netDebit !== 0 ? (pnl / Math.abs(strategy.netDebit)) * 100 : 0;

    return {
      currentValue,
      pnl,
      pnlPercent,
      greeks: aggregateGreeks,
      legValues,
    };
  }

  private generateId(): Hex {
    return `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(66, '0').slice(0, 66) as Hex;
  }
}
