import { Router, Request, Response } from 'express';
import { state } from '../state.js';
import { ApiResponse, StrategyResponse, BuildStrategyRequest } from '../types.js';
import { Strategy } from '../../lib/strategies/types.js';

const router = Router();

// Helper to convert Strategy to StrategyResponse
function strategyToResponse(strategy: Strategy, spotPrice: number): StrategyResponse {
  const pnl = state.strategyBuilder.getStrategyPnL(strategy, spotPrice);

  return {
    id: strategy.id,
    name: strategy.name,
    type: strategy.type,
    underlying: strategy.underlying,
    legs: strategy.legs.map(leg => ({
      optionType: leg.optionType,
      strike: leg.strike,
      side: leg.side,
      quantity: leg.quantity,
      premium: leg.premium,
    })),
    expiry: strategy.expiry,
    netDebit: strategy.netDebit,
    maxProfit: strategy.maxProfit,
    maxLoss: strategy.maxLoss,
    breakevens: strategy.breakevens,
    currentPnl: pnl.pnl,
    greeks: pnl.greeks,
  };
}

/**
 * GET /api/strategies/templates
 * List available strategy templates
 */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = [
      {
        type: 'bull_call_spread',
        name: 'Bull Call Spread',
        description: 'Bullish strategy with limited risk and reward. Buy lower strike call, sell higher strike call.',
        requiredParams: ['lowerStrike', 'upperStrike', 'expiryDays'],
      },
      {
        type: 'bear_put_spread',
        name: 'Bear Put Spread',
        description: 'Bearish strategy with limited risk and reward. Buy higher strike put, sell lower strike put.',
        requiredParams: ['lowerStrike', 'upperStrike', 'expiryDays'],
      },
      {
        type: 'straddle',
        name: 'Long Straddle',
        description: 'Volatility play. Buy ATM call and put at same strike. Profits from large moves.',
        requiredParams: ['strike', 'expiryDays'],
      },
      {
        type: 'strangle',
        name: 'Long Strangle',
        description: 'Cheaper volatility play. Buy OTM call and put. Needs larger moves to profit.',
        requiredParams: ['putStrike', 'callStrike', 'expiryDays'],
      },
      {
        type: 'iron_condor',
        name: 'Iron Condor',
        description: 'Range-bound strategy. Sell OTM put spread + call spread. Profits from low volatility.',
        requiredParams: ['putBuyStrike', 'putSellStrike', 'callSellStrike', 'callBuyStrike', 'expiryDays'],
      },
      {
        type: 'butterfly',
        name: 'Butterfly Spread',
        description: 'Low cost bet on price staying near middle strike. Buy 1, sell 2, buy 1.',
        requiredParams: ['lowerStrike', 'middleStrike', 'upperStrike', 'expiryDays'],
      },
    ];

    const response: ApiResponse<typeof templates> = {
      success: true,
      data: templates,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch templates',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/strategies/build
 * Build a strategy from template
 */
router.post('/build', async (req: Request, res: Response) => {
  try {
    const body: BuildStrategyRequest = req.body;
    const { price } = await state.getPrice();

    let strategy: Strategy;

    switch (body.type) {
      case 'bull_call_spread':
        if (!body.lowerStrike || !body.upperStrike) {
          throw new Error('Bull call spread requires lowerStrike and upperStrike');
        }
        strategy = state.strategyBuilder.bullCallSpread(
          body.underlying,
          body.lowerStrike,
          body.upperStrike,
          price,
          body.expiryDays
        );
        break;

      case 'bear_put_spread':
        if (!body.lowerStrike || !body.upperStrike) {
          throw new Error('Bear put spread requires lowerStrike and upperStrike');
        }
        strategy = state.strategyBuilder.bearPutSpread(
          body.underlying,
          body.lowerStrike,
          body.upperStrike,
          price,
          body.expiryDays
        );
        break;

      case 'straddle':
        if (!body.strike) {
          throw new Error('Straddle requires strike');
        }
        strategy = state.strategyBuilder.straddle(
          body.underlying,
          body.strike,
          price,
          body.expiryDays
        );
        break;

      case 'strangle':
        if (!body.putStrike || !body.callStrike) {
          throw new Error('Strangle requires putStrike and callStrike');
        }
        strategy = state.strategyBuilder.strangle(
          body.underlying,
          body.putStrike,
          body.callStrike,
          price,
          body.expiryDays
        );
        break;

      case 'iron_condor':
        if (!body.putBuyStrike || !body.putSellStrike || !body.callSellStrike || !body.callBuyStrike) {
          throw new Error('Iron condor requires putBuyStrike, putSellStrike, callSellStrike, callBuyStrike');
        }
        strategy = state.strategyBuilder.ironCondor(
          body.underlying,
          body.putBuyStrike,
          body.putSellStrike,
          body.callSellStrike,
          body.callBuyStrike,
          price,
          body.expiryDays
        );
        break;

      case 'butterfly':
        if (!body.lowerStrike || !body.middleStrike || !body.upperStrike) {
          throw new Error('Butterfly requires lowerStrike, middleStrike, upperStrike');
        }
        strategy = state.strategyBuilder.butterflySpread(
          body.underlying,
          body.lowerStrike,
          body.middleStrike,
          body.upperStrike,
          price,
          body.expiryDays,
          body.optionType || 'call'
        );
        break;

      default:
        throw new Error(`Unknown strategy type: ${body.type}`);
    }

    const response: ApiResponse<StrategyResponse> = {
      success: true,
      data: strategyToResponse(strategy, price),
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build strategy',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/strategies/payoff
 * Calculate payoff diagram for a strategy
 */
router.post('/payoff', async (req: Request, res: Response) => {
  try {
    const body: BuildStrategyRequest = req.body;
    const { priceRange = 0.3 } = req.body;
    const { price } = await state.getPrice();

    let strategy: Strategy;

    // Build strategy (same logic as /build)
    switch (body.type) {
      case 'bull_call_spread':
        strategy = state.strategyBuilder.bullCallSpread(
          body.underlying,
          body.lowerStrike!,
          body.upperStrike!,
          price,
          body.expiryDays
        );
        break;
      case 'bear_put_spread':
        strategy = state.strategyBuilder.bearPutSpread(
          body.underlying,
          body.lowerStrike!,
          body.upperStrike!,
          price,
          body.expiryDays
        );
        break;
      case 'straddle':
        strategy = state.strategyBuilder.straddle(
          body.underlying,
          body.strike!,
          price,
          body.expiryDays
        );
        break;
      case 'strangle':
        strategy = state.strategyBuilder.strangle(
          body.underlying,
          body.putStrike!,
          body.callStrike!,
          price,
          body.expiryDays
        );
        break;
      case 'iron_condor':
        strategy = state.strategyBuilder.ironCondor(
          body.underlying,
          body.putBuyStrike!,
          body.putSellStrike!,
          body.callSellStrike!,
          body.callBuyStrike!,
          price,
          body.expiryDays
        );
        break;
      case 'butterfly':
        strategy = state.strategyBuilder.butterflySpread(
          body.underlying,
          body.lowerStrike!,
          body.middleStrike!,
          body.upperStrike!,
          price,
          body.expiryDays,
          body.optionType || 'call'
        );
        break;
      default:
        throw new Error(`Unknown strategy type: ${body.type}`);
    }

    const payoff = state.strategyBuilder.calculatePayoff(strategy, price, priceRange);

    const response: ApiResponse<typeof payoff> = {
      success: true,
      data: payoff,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate payoff',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

export default router;
