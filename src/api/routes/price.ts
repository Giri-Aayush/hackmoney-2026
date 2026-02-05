import { Router, Request, Response } from 'express';
import { state } from '../state.js';
import { ApiResponse, PriceResponse } from '../types.js';

const router = Router();

/**
 * GET /api/price
 * Get current ETH/USD price from Pyth
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    console.log('   [Price] Fetching ETH/USD from Pyth Hermes...');
    const priceData = await state.pythClient.getEthUsdPrice();

    console.log(`   [Price] ✓ ETH/USD: $${priceData.price.toFixed(2)} (±$${priceData.confidence.toFixed(2)})`);

    const response: ApiResponse<PriceResponse> = {
      success: true,
      data: {
        symbol: 'ETH/USD',
        price: priceData.price,
        confidence: priceData.confidence,
        publishTime: priceData.publishTime.toISOString(),
      },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    console.log(`   [Price] ✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch price',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/price/history
 * Get price with additional metadata
 */
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const priceData = await state.pythClient.getEthUsdPrice();

    // In production, this would return historical data
    const response: ApiResponse<{ current: PriceResponse; history: PriceResponse[] }> = {
      success: true,
      data: {
        current: {
          symbol: 'ETH/USD',
          price: priceData.price,
          confidence: priceData.confidence,
          publishTime: priceData.publishTime.toISOString(),
        },
        history: [], // Would be populated from database
      },
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch price history',
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

export default router;
