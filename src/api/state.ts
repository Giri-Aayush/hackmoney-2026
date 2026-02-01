/**
 * Global API State
 *
 * Manages shared state across API routes.
 * In production, this would be backed by a database.
 */

import { PythClient } from '../lib/pyth/index.js';
import { OptionsOrderBook } from '../lib/options/index.js';
import { PositionManager } from '../lib/portfolio/index.js';
import { StrategyBuilder } from '../lib/strategies/index.js';
import { Address } from 'viem';

class ApiState {
  private static instance: ApiState;

  public pythClient: PythClient;
  public orderBook: OptionsOrderBook;
  public positionManagers: Map<Address, PositionManager> = new Map();
  public strategyBuilder: StrategyBuilder;

  private cachedPrice: { price: number; confidence: number; timestamp: number } | null = null;
  private priceCacheTTL = 5000; // 5 seconds

  private constructor() {
    this.pythClient = new PythClient();
    this.orderBook = new OptionsOrderBook(this.pythClient);
    this.strategyBuilder = new StrategyBuilder();
  }

  static getInstance(): ApiState {
    if (!ApiState.instance) {
      ApiState.instance = new ApiState();
    }
    return ApiState.instance;
  }

  /**
   * Get or create a position manager for a user
   */
  getPositionManager(address: Address, initialBalance = 10000): PositionManager {
    let manager = this.positionManagers.get(address);
    if (!manager) {
      manager = new PositionManager(initialBalance);
      this.positionManagers.set(address, manager);
    }
    return manager;
  }

  /**
   * Get cached price or fetch new one
   */
  async getPrice(): Promise<{ price: number; confidence: number }> {
    const now = Date.now();

    if (this.cachedPrice && (now - this.cachedPrice.timestamp) < this.priceCacheTTL) {
      return { price: this.cachedPrice.price, confidence: this.cachedPrice.confidence };
    }

    const priceData = await this.pythClient.getEthUsdPrice();
    this.cachedPrice = {
      price: priceData.price,
      confidence: priceData.confidence,
      timestamp: now,
    };

    return { price: priceData.price, confidence: priceData.confidence };
  }
}

export const state = ApiState.getInstance();
