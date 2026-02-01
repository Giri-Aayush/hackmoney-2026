import { Router, Request, Response } from 'express';
import { Address, Hex } from 'viem';
import { state } from '../state.js';
import { ApiResponse, OptionResponse, CreateOptionRequest } from '../types.js';
import { blackScholes } from '../../lib/pricing/index.js';
import { Option } from '../../lib/options/types.js';

const router = Router();

// Helper to convert Option to OptionResponse with pricing
async function enrichOption(option: Option): Promise<OptionResponse> {
  const { price } = await state.getPrice();
  const strike = Number(option.strikePrice) / 1e8;
  const premium = Number(option.premium) / 1e8;
  const amount = Number(option.amount) / 1e18;
  const timeToExpiry = Math.max(0, (option.expiry - Date.now() / 1000) / (365 * 24 * 3600));

  let theoreticalPrice: number | undefined;
  let greeks: OptionResponse['greeks'] | undefined;
  let intrinsicValue: number | undefined;
  let timeValue: number | undefined;
  let breakeven: number | undefined;

  if (timeToExpiry > 0) {
    const bs = blackScholes({
      spot: price,
      strike,
      timeToExpiry,
      volatility: 0.65,
      riskFreeRate: 0.05,
      optionType: option.optionType,
    });

    theoreticalPrice = bs.price;
    greeks = bs.greeks;
    intrinsicValue = bs.intrinsicValue;
    timeValue = bs.timeValue;
    breakeven = bs.breakeven;
  }

  return {
    id: option.id,
    underlying: option.underlying,
    strikePrice: strike,
    premium,
    expiry: option.expiry,
    expiryDate: new Date(option.expiry * 1000).toISOString(),
    optionType: option.optionType,
    amount,
    writer: option.writer,
    holder: option.holder,
    status: option.status,
    createdAt: option.createdAt,
    theoreticalPrice,
    greeks,
    intrinsicValue,
    timeValue,
    breakeven,
  };
}

/**
 * GET /api/options
 * List all available options
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, minStrike, maxStrike } = req.query;

    const options = state.orderBook.getAvailableOptions({
      optionType: type as 'call' | 'put' | undefined,
      minStrike: minStrike ? Number(minStrike) : undefined,
      maxStrike: maxStrike ? Number(maxStrike) : undefined,
    });

    const enrichedOptions = await Promise.all(options.map(enrichOption));

    const response: ApiResponse<OptionResponse[]> = {
      success: true,
      data: enrichedOptions,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch options',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/options/calls
 * List all call options
 */
router.get('/calls', async (_req: Request, res: Response) => {
  try {
    const options = state.orderBook.getCallOptions();
    const enrichedOptions = await Promise.all(options.map(enrichOption));

    const response: ApiResponse<OptionResponse[]> = {
      success: true,
      data: enrichedOptions,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch calls',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/options/puts
 * List all put options
 */
router.get('/puts', async (_req: Request, res: Response) => {
  try {
    const options = state.orderBook.getPutOptions();
    const enrichedOptions = await Promise.all(options.map(enrichOption));

    const response: ApiResponse<OptionResponse[]> = {
      success: true,
      data: enrichedOptions,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch puts',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/options/:id
 * Get specific option by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const option = state.orderBook.getOptionById(id as Hex);

    if (!option) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Option not found',
        timestamp: Date.now(),
      };
      return res.status(404).json(response);
    }

    const enrichedOption = await enrichOption(option);

    const response: ApiResponse<OptionResponse> = {
      success: true,
      data: enrichedOption,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch option',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/options
 * Write/create a new option
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: CreateOptionRequest = req.body;
    const writer = req.headers['x-wallet-address'] as Address;

    if (!writer) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const option = await state.orderBook.listOption(writer, {
      underlying: body.underlying,
      strikePrice: body.strikePrice,
      premium: body.premium,
      expiryMinutes: body.expiryMinutes,
      optionType: body.optionType,
      amount: body.amount,
    });

    const enrichedOption = await enrichOption(option);

    const response: ApiResponse<OptionResponse> = {
      success: true,
      data: enrichedOption,
      timestamp: Date.now(),
    };

    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create option',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/options/:id/buy
 * Buy an option
 */
router.post('/:id/buy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const buyer = req.headers['x-wallet-address'] as Address;

    if (!buyer) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const option = await state.orderBook.buyOption(id as Hex, buyer);
    const enrichedOption = await enrichOption(option);

    const response: ApiResponse<OptionResponse> = {
      success: true,
      data: enrichedOption,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to buy option',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/options/:id/exercise
 * Exercise an option
 */
router.post('/:id/exercise', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const holder = req.headers['x-wallet-address'] as Address;

    if (!holder) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const result = await state.orderBook.exerciseOption(id as Hex, holder);

    const response: ApiResponse<{ payout: number }> = {
      success: true,
      data: result,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to exercise option',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/options/stats
 * Get order book statistics
 */
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const stats = state.orderBook.getStats();

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/options/chain
 * Create an option chain around current price
 */
router.post('/chain', async (req: Request, res: Response) => {
  try {
    const { strikeInterval = 100, numStrikes = 5, premium = 50, expiryMinutes = 60 } = req.body;
    const writer = req.headers['x-wallet-address'] as Address;

    if (!writer) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const { price } = await state.getPrice();
    const baseStrike = Math.round(price / 100) * 100;

    const options: OptionResponse[] = [];

    for (let i = -Math.floor(numStrikes / 2); i <= Math.floor(numStrikes / 2); i++) {
      const strike = baseStrike + i * strikeInterval;
      if (strike <= 0) continue;

      // Create call
      const call = await state.orderBook.listOption(writer, {
        underlying: 'ETH',
        strikePrice: strike,
        premium,
        expiryMinutes,
        optionType: 'call',
        amount: 0.1,
      });
      options.push(await enrichOption(call));

      // Create put
      const put = await state.orderBook.listOption(writer, {
        underlying: 'ETH',
        strikePrice: strike,
        premium,
        expiryMinutes,
        optionType: 'put',
        amount: 0.1,
      });
      options.push(await enrichOption(put));
    }

    const response: ApiResponse<OptionResponse[]> = {
      success: true,
      data: options,
      timestamp: Date.now(),
    };

    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create option chain',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

export default router;
