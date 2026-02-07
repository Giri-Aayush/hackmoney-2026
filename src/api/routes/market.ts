/**
 * Market Data API Routes
 *
 * CEX-style endpoints for:
 * - Order book depth (L2)
 * - Market prices (mark/index/last)
 * - Open interest
 * - 24h volume stats
 * - Limit orders
 * - Liquidation data
 */

import { Router, Request, Response } from 'express';
import { Hex, Address } from 'viem';
import { liquidationEngine } from '../../lib/portfolio/index.js';
import { state } from '../state.js';
import { blackScholes } from '../../lib/pricing/index.js';

const router = Router();

/**
 * GET /api/market/depth/:optionId
 * Get order book depth (L2 data)
 */
router.get('/depth/:optionId', (req: Request, res: Response) => {
  try {
    const optionId = req.params.optionId as Hex;
    const levels = parseInt(req.query.levels as string) || 10;

    const depth = state.market.getOrderBookDepth(optionId, levels);

    res.json({
      success: true,
      data: {
        optionId,
        ...depth,
        spread: depth.asks[0] && depth.bids[0]
          ? depth.asks[0].price - depth.bids[0].price
          : null,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get order book depth',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/prices/:optionId
 * Get mark price, index price, last price
 */
router.get('/prices/:optionId', async (req: Request, res: Response) => {
  try {
    const optionId = req.params.optionId as Hex;

    // Get option from order book
    const option = state.orderBook.getOptionById(optionId);
    if (!option) {
      res.status(404).json({ success: false, error: 'Option not found' });
      return;
    }

    // Get spot price
    const priceData = await state.pythClient.getEthUsdPrice();
    const spotPrice = priceData.price;

    // Calculate theoretical price
    const strike = Number(option.strikePrice) / 1e8;
    const expiry = option.expiry;
    const timeToExpiry = Math.max(0, (expiry - Date.now() / 1000) / (365 * 24 * 60 * 60));
    const bsResult = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      riskFreeRate: 0.05,
      volatility: 0.6,
      optionType: option.optionType,
    });
    const theoreticalPrice = bsResult.price;

    const prices = state.market.getMarketPrices(optionId, theoreticalPrice, spotPrice);

    res.json({
      success: true,
      data: {
        optionId,
        symbol: `ETH-${strike}-${option.optionType === 'call' ? 'C' : 'P'}`,
        ...prices,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get market prices',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/ticker/:optionId
 * Get full ticker data (like Binance ticker)
 */
router.get('/ticker/:optionId', async (req: Request, res: Response) => {
  try {
    const optionId = req.params.optionId as Hex;

    const option = state.orderBook.getOptionById(optionId);
    if (!option) {
      res.status(404).json({ success: false, error: 'Option not found' });
      return;
    }

    const priceData = await state.pythClient.getEthUsdPrice();
    const spotPrice = priceData.price;
    const strike = Number(option.strikePrice) / 1e8;
    const timeToExpiry = Math.max(0, (option.expiry - Date.now() / 1000) / (365 * 24 * 60 * 60));

    const bsResult = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      riskFreeRate: 0.05,
      volatility: 0.6,
      optionType: option.optionType,
    });

    const ticker = state.market.getTicker(
      option,
      bsResult.price,
      spotPrice,
      0.6,  // Default IV
      bsResult.greeks.delta
    );

    res.json({
      success: true,
      data: ticker,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get ticker',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/open-interest
 * Get open interest data
 */
router.get('/open-interest', (_req: Request, res: Response) => {
  try {
    const openInterest = state.market.getAllOpenInterest();

    const totalCallOI = openInterest.reduce((sum, oi) => sum + oi.callOI, 0);
    const totalPutOI = openInterest.reduce((sum, oi) => sum + oi.putOI, 0);

    res.json({
      success: true,
      data: {
        byStrike: openInterest,
        totals: {
          callOI: totalCallOI,
          putOI: totalPutOI,
          totalOI: totalCallOI + totalPutOI,
          putCallRatio: totalCallOI > 0 ? totalPutOI / totalCallOI : 0,
        },
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get open interest',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/volume
 * Get 24h volume statistics
 */
router.get('/volume', (req: Request, res: Response) => {
  try {
    const optionId = req.query.optionId as Hex | undefined;
    const stats = state.market.getVolumeStats(optionId);

    res.json({
      success: true,
      data: stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get volume stats',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/trades
 * Get recent trades
 */
router.get('/trades', (req: Request, res: Response) => {
  try {
    const optionId = req.query.optionId as Hex | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const trades = state.market.getRecentTrades(optionId, limit);

    res.json({
      success: true,
      data: {
        trades,
        count: trades.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get trades',
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/market/orders/limit
 * Place a limit order
 */
router.post('/orders/limit', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as Address;
    if (!walletAddress) {
      res.status(400).json({ success: false, error: 'x-wallet-address header required' });
      return;
    }

    const { optionId, side, price, size, timeInForce } = req.body;

    if (!optionId || !side || !price || !size) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const order = state.market.placeLimitOrder({
      optionId,
      trader: walletAddress,
      side,
      price: parseFloat(price),
      size: parseFloat(size),
      timeInForce: timeInForce || 'GTC',
    });

    res.json({
      success: true,
      data: order,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place limit order',
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/market/orders/market
 * Place a market order
 */
router.post('/orders/market', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as Address;
    if (!walletAddress) {
      res.status(400).json({ success: false, error: 'x-wallet-address header required' });
      return;
    }

    const { optionId, side, size } = req.body;

    if (!optionId || !side || !size) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const result = state.market.placeMarketOrder({
      optionId,
      trader: walletAddress,
      side,
      size: parseFloat(size),
    });

    res.json({
      success: true,
      data: {
        order: result.order,
        fills: result.fills,
        avgPrice: result.order.price,
        filledSize: result.order.filledSize,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place market order',
      timestamp: Date.now(),
    });
  }
});

/**
 * DELETE /api/market/orders/:orderId
 * Cancel an order
 */
router.delete('/orders/:orderId', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as Address;
    if (!walletAddress) {
      res.status(400).json({ success: false, error: 'x-wallet-address header required' });
      return;
    }

    const orderId = req.params.orderId as Hex;
    const success = state.market.cancelOrder(orderId, walletAddress);

    if (!success) {
      res.status(400).json({ success: false, error: 'Cannot cancel order' });
      return;
    }

    res.json({
      success: true,
      data: { orderId, status: 'cancelled' },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/orders
 * Get trader's orders
 */
router.get('/orders', (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as Address;
    if (!walletAddress) {
      res.status(400).json({ success: false, error: 'x-wallet-address header required' });
      return;
    }

    const status = req.query.status as string | undefined;
    const orders = state.market.getTraderOrders(
      walletAddress,
      status as 'open' | 'filled' | undefined
    );

    res.json({
      success: true,
      data: {
        orders,
        count: orders.length,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get orders',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/risk
 * Get liquidation risk for positions
 */
router.get('/risk', (req: Request, res: Response) => {
  try {
    const positionsAtRisk = liquidationEngine.getPositionsAtRisk();

    res.json({
      success: true,
      data: {
        positionsAtRisk,
        insuranceFund: liquidationEngine.getInsuranceFundBalance(),
        config: liquidationEngine.getConfig(),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get risk data',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/market/liquidations
 * Get liquidation history
 */
router.get('/liquidations', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = liquidationEngine.getLiquidationHistory(limit);

    res.json({
      success: true,
      data: {
        liquidations: history,
        count: history.length,
        insuranceFund: liquidationEngine.getInsuranceFundBalance(),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get liquidation history',
      timestamp: Date.now(),
    });
  }
});

export default router;
