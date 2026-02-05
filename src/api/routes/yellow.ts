/**
 * Yellow Network API Routes
 *
 * Endpoints for state channel trading and indexer management.
 */

import { Router, Request, Response } from 'express';
import { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { StateChannelTradingService, createTradingService } from '../../lib/yellow/trading.js';
import { EventIndexerService, createIndexer } from '../../lib/indexer/index.js';
import { state } from '../state.js';
import { config } from '../../config/index.js';

const router = Router();

// Trading service instance (lazily initialized)
let tradingService: StateChannelTradingService | null = null;

// Indexer instance (lazily initialized)
let indexer: EventIndexerService | null = null;

// ============================================================================
// STATE CHANNEL TRADING ENDPOINTS
// ============================================================================

/**
 * POST /api/yellow/connect
 * Connect to Yellow Network
 */
router.post('/connect', async (req: Request, res: Response) => {
  try {
    if (!config.wallet.privateKey) {
      return res.status(400).json({
        success: false,
        error: 'Private key not configured',
      });
    }

    if (tradingService?.isReady) {
      return res.json({
        success: true,
        message: 'Already connected',
        state: tradingService.connectionState,
      });
    }

    // Derive address from private key
    const account = privateKeyToAccount(config.wallet.privateKey as Hex);

    // Create trading service
    tradingService = createTradingService({
      privateKey: config.wallet.privateKey as Hex,
      address: account.address,
      orderBook: state.orderBook,
      market: state.market,
      onStateChange: (connectionState) => {
        console.log(`[Yellow API] Connection state: ${connectionState}`);
      },
      onTradeExecuted: (trade) => {
        console.log(`[Yellow API] Trade executed: ${trade.type}`);
      },
    });

    await tradingService.connect();

    res.json({
      success: true,
      message: 'Connected to Yellow Network',
      state: tradingService.connectionState,
    });
  } catch (error) {
    console.error('[Yellow API] Connect error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  }
});

/**
 * POST /api/yellow/disconnect
 * Disconnect from Yellow Network
 */
router.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    if (!tradingService) {
      return res.json({
        success: true,
        message: 'Not connected',
      });
    }

    await tradingService.disconnect();
    tradingService = null;

    res.json({
      success: true,
      message: 'Disconnected from Yellow Network',
    });
  } catch (error) {
    console.error('[Yellow API] Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Disconnect failed',
    });
  }
});

/**
 * GET /api/yellow/status
 * Get Yellow Network connection status
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    connected: tradingService?.isReady || false,
    state: tradingService?.connectionState || 'disconnected',
    activeSessions: tradingService?.getActiveSessions().length || 0,
  });
});

/**
 * POST /api/yellow/session/init
 * Initialize a trading session for a wallet
 */
router.post('/session/init', async (req: Request, res: Response) => {
  try {
    if (!tradingService?.isReady) {
      return res.status(400).json({
        success: false,
        error: 'Not connected to Yellow Network. Call /connect first.',
      });
    }

    const walletAddress = req.headers['x-wallet-address'] as Address;
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header',
      });
    }

    const { initialBalance = 1000 } = req.body;

    const session = await tradingService.initTraderSession(walletAddress, initialBalance);

    res.json({
      success: true,
      sessionId: session.sessionId,
      status: session.status,
      createdAt: session.createdAt,
    });
  } catch (error) {
    console.error('[Yellow API] Session init error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Session init failed',
    });
  }
});

/**
 * POST /api/yellow/session/close
 * Close a trading session
 */
router.post('/session/close', async (req: Request, res: Response) => {
  try {
    if (!tradingService?.isReady) {
      return res.status(400).json({
        success: false,
        error: 'Not connected to Yellow Network',
      });
    }

    const walletAddress = req.headers['x-wallet-address'] as Address;
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing x-wallet-address header',
      });
    }

    await tradingService.closeTraderSession(walletAddress);

    res.json({
      success: true,
      message: 'Session closed',
    });
  } catch (error) {
    console.error('[Yellow API] Session close error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Session close failed',
    });
  }
});

/**
 * GET /api/yellow/sessions
 * List active trading sessions
 */
router.get('/sessions', (_req: Request, res: Response) => {
  if (!tradingService) {
    return res.json({ sessions: [] });
  }

  const sessions = tradingService.getActiveSessions().map((s) => ({
    sessionId: s.sessionId,
    status: s.status,
    createdAt: s.createdAt,
    participants: s.definition.participants,
  }));

  res.json({ sessions });
});

/**
 * GET /api/yellow/balances
 * Get ledger balances from Yellow Network
 */
router.get('/balances', async (_req: Request, res: Response) => {
  try {
    if (!tradingService?.isReady) {
      return res.status(400).json({
        success: false,
        error: 'Not connected to Yellow Network',
      });
    }

    const balances = await tradingService.getLedgerBalances();

    res.json({
      success: true,
      balances,
    });
  } catch (error) {
    console.error('[Yellow API] Get balances error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get balances',
    });
  }
});

/**
 * GET /api/yellow/channels
 * Get state channels from Yellow Network
 */
router.get('/channels', async (_req: Request, res: Response) => {
  try {
    if (!tradingService?.isReady) {
      return res.status(400).json({
        success: false,
        error: 'Not connected to Yellow Network',
      });
    }

    const channels = await tradingService.getChannels();

    res.json({
      success: true,
      channels,
    });
  } catch (error) {
    console.error('[Yellow API] Get channels error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get channels',
    });
  }
});

// ============================================================================
// INDEXER ENDPOINTS
// ============================================================================

/**
 * POST /api/yellow/indexer/start
 * Start the event indexer
 */
router.post('/indexer/start', async (req: Request, res: Response) => {
  try {
    const { fromBlock } = req.body;

    if (!indexer) {
      indexer = createIndexer({
        startBlock: fromBlock ? BigInt(fromBlock) : undefined,
      });
    }

    await indexer.start();

    const stats = indexer.getStats();
    res.json({
      success: true,
      message: 'Indexer started',
      stats: {
        ...stats,
        lastBlockProcessed: stats.lastBlockProcessed.toString(),
      },
    });
  } catch (error) {
    console.error('[Yellow API] Indexer start error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start indexer',
    });
  }
});

/**
 * POST /api/yellow/indexer/stop
 * Stop the event indexer
 */
router.post('/indexer/stop', (_req: Request, res: Response) => {
  try {
    if (!indexer) {
      return res.json({
        success: true,
        message: 'Indexer not running',
      });
    }

    indexer.stop();

    const stats = indexer.getStats();
    res.json({
      success: true,
      message: 'Indexer stopped',
      stats: {
        ...stats,
        lastBlockProcessed: stats.lastBlockProcessed.toString(),
      },
    });
  } catch (error) {
    console.error('[Yellow API] Indexer stop error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop indexer',
    });
  }
});

/**
 * GET /api/yellow/indexer/stats
 * Get indexer statistics
 */
router.get('/indexer/stats', (_req: Request, res: Response) => {
  if (!indexer) {
    return res.json({
      depositsIndexed: 0,
      withdrawalsIndexed: 0,
      settlementsIndexed: 0,
      lastBlockProcessed: '0',
      isRunning: false,
    });
  }

  const stats = indexer.getStats();

  res.json({
    ...stats,
    lastBlockProcessed: stats.lastBlockProcessed.toString(),
  });
});

/**
 * POST /api/yellow/indexer/sync
 * Sync indexer from a specific block
 */
router.post('/indexer/sync', async (req: Request, res: Response) => {
  try {
    const { fromBlock } = req.body;

    if (!fromBlock) {
      return res.status(400).json({
        success: false,
        error: 'fromBlock is required',
      });
    }

    if (!indexer) {
      indexer = createIndexer();
    }

    await indexer.syncFromBlock(BigInt(fromBlock));

    const stats = indexer.getStats();
    res.json({
      success: true,
      message: 'Sync complete',
      stats: {
        ...stats,
        lastBlockProcessed: stats.lastBlockProcessed.toString(),
      },
    });
  } catch (error) {
    console.error('[Yellow API] Indexer sync error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    });
  }
});

export default router;
