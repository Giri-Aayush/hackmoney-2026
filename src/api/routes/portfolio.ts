import { Router, Request, Response } from 'express';
import { Address, Hex } from 'viem';
import { state } from '../state.js';
import { ApiResponse, PortfolioResponse, PositionResponse, OpenPositionRequest, ClosePositionRequest } from '../types.js';
import { BalanceEntry } from '../../lib/balance/index.js';

const router = Router();

// Helper to convert position to response
function positionToResponse(pos: ReturnType<typeof state.getPositionManager>['getPortfolio'] extends (p: number) => infer R ? R extends { positions: (infer P)[] } ? P : never : never): PositionResponse {
  return {
    id: pos.id,
    optionId: pos.optionId,
    side: pos.side,
    size: pos.size,
    entryPrice: pos.entryPrice,
    currentPrice: pos.currentPrice,
    pnl: pos.pnl,
    pnlPercent: pos.pnlPercent,
    marketValue: pos.marketValue,
    greeks: pos.greeks,
    option: {
      id: pos.option.id,
      underlying: pos.option.underlying,
      strikePrice: Number(pos.option.strikePrice) / 1e8,
      premium: Number(pos.option.premium) / 1e8,
      expiry: pos.option.expiry,
      expiryDate: new Date(pos.option.expiry * 1000).toISOString(),
      optionType: pos.option.optionType,
      amount: Number(pos.option.amount) / 1e18,
      writer: pos.option.writer,
      holder: pos.option.holder,
      status: pos.option.status,
      createdAt: pos.option.createdAt,
    },
  };
}

/**
 * GET /api/portfolio
 * Get user's portfolio summary
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const { price } = await state.getPrice();
    const manager = state.getPositionManager(wallet);
    const portfolio = manager.getPortfolio(price);

    const response: ApiResponse<PortfolioResponse> = {
      success: true,
      data: {
        balance: manager.getBalance(),
        totalValue: portfolio.totalValue,
        totalPnl: portfolio.totalPnl,
        totalPnlPercent: portfolio.totalPnlPercent,
        buyingPower: portfolio.buyingPower,
        marginRequired: portfolio.marginRequired,
        positions: portfolio.positions.map(positionToResponse),
        aggregateGreeks: portfolio.aggregateGreeks,
      },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch portfolio',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/portfolio/positions
 * Get all open positions
 */
router.get('/positions', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const { price } = await state.getPrice();
    const manager = state.getPositionManager(wallet);
    const portfolio = manager.getPortfolio(price);

    const response: ApiResponse<PositionResponse[]> = {
      success: true,
      data: portfolio.positions.map(positionToResponse),
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch positions',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/portfolio/positions
 * Open a new position
 */
router.post('/positions', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;
    const body: OpenPositionRequest = req.body;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const option = state.orderBook.getOptionById(body.optionId);
    if (!option) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Option not found',
        timestamp: Date.now(),
      };
      return res.status(404).json(response);
    }

    const { price } = await state.getPrice();
    const manager = state.getPositionManager(wallet);
    const position = manager.openPosition(option, body.side, body.size, price);

    // Get updated position with Greeks
    const updated = manager.updatePositionPrice(position.id, price);

    const response: ApiResponse<PositionResponse> = {
      success: true,
      data: updated ? positionToResponse(updated) : {
        id: position.id,
        optionId: position.optionId,
        side: position.side,
        size: position.size,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        pnl: 0,
        pnlPercent: 0,
        marketValue: position.currentPrice * position.size,
        greeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
        option: {
          id: option.id,
          underlying: option.underlying,
          strikePrice: Number(option.strikePrice) / 1e8,
          premium: Number(option.premium) / 1e8,
          expiry: option.expiry,
          expiryDate: new Date(option.expiry * 1000).toISOString(),
          optionType: option.optionType,
          amount: Number(option.amount) / 1e18,
          writer: option.writer,
          holder: option.holder,
          status: option.status,
          createdAt: option.createdAt,
        },
      },
      timestamp: Date.now(),
    };

    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open position',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * DELETE /api/portfolio/positions/:id
 * Close a position
 */
router.delete('/positions/:id', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;
    const { id } = req.params;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const { price } = await state.getPrice();
    const manager = state.getPositionManager(wallet);
    const result = manager.closePosition(id as Hex, price);

    if (!result) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Position not found or already closed',
        timestamp: Date.now(),
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<{ pnl: number; closedAt: number }> = {
      success: true,
      data: {
        pnl: result.pnl,
        closedAt: result.position.closedAt!,
      },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close position',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/portfolio/deposit
 * Deposit funds to portfolio
 */
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;
    const { amount } = req.body;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    if (!amount || amount <= 0) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid amount',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const manager = state.getPositionManager(wallet);
    manager.deposit(amount);

    const response: ApiResponse<{ balance: number }> = {
      success: true,
      data: { balance: manager.getBalance() },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to deposit',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/portfolio/withdraw
 * Withdraw funds from portfolio
 */
router.post('/withdraw', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;
    const { amount } = req.body;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    if (!amount || amount <= 0) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid amount',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const manager = state.getPositionManager(wallet);
    const success = manager.withdraw(amount);

    if (!success) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Insufficient balance',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse<{ balance: number }> = {
      success: true,
      data: { balance: manager.getBalance() },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to withdraw',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

// ============================================================================
// TRADING BALANCE ENDPOINTS (Virtual Balance Tracker)
// ============================================================================

/**
 * GET /api/portfolio/trading-balance
 * Get user's trading balance (virtual balance for gasless trading)
 */
router.get('/trading-balance', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    // Use async version to load from DB if not cached
    const balance = await state.balanceTracker.getBalanceAsync(wallet);

    const response: ApiResponse<BalanceEntry> = {
      success: true,
      data: balance,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get trading balance',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/portfolio/trading-balance/sync
 * Sync trading balance from on-chain deposit
 * Called after a successful on-chain deposit to update virtual balance
 */
router.post('/trading-balance/sync', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;
    const { amount, txHash } = req.body;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    if (!amount || amount <= 0) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid amount',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    console.log(`[Portfolio] Syncing deposit for ${wallet.slice(0, 10)}...`);
    console.log(`[Portfolio]   Amount: $${amount}`);
    if (txHash) {
      console.log(`[Portfolio]   TxHash: ${txHash.slice(0, 20)}...`);
    }

    // Add to trading balance
    const balance = state.balanceTracker.deposit(wallet, amount);

    const response: ApiResponse<BalanceEntry> = {
      success: true,
      data: balance,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync trading balance',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/portfolio/trading-balance/reset
 * Reset trading balance (for testing/debugging)
 * This clears the virtual balance back to 0
 */
router.post('/trading-balance/reset', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    console.log(`[Portfolio] Resetting balance for ${wallet.slice(0, 10)}...`);

    // Reset the balance
    state.balanceTracker.resetBalance(wallet);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Balance reset successfully' },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset trading balance',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/portfolio/trading-balance/set
 * Set trading balance to a specific amount (for syncing with on-chain state)
 */
router.post('/trading-balance/set', async (req: Request, res: Response) => {
  try {
    const wallet = req.headers['x-wallet-address'] as Address;
    const { amount } = req.body;

    if (!wallet) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Missing x-wallet-address header',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    if (amount === undefined || amount < 0) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid amount',
        timestamp: Date.now(),
      };
      return res.status(400).json(response);
    }

    console.log(`[Portfolio] Setting balance for ${wallet.slice(0, 10)}... to $${amount}`);

    // Set the balance to exact amount
    const balance = state.balanceTracker.setBalance(wallet, amount);

    const response: ApiResponse<BalanceEntry> = {
      success: true,
      data: balance,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set trading balance',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

export default router;
