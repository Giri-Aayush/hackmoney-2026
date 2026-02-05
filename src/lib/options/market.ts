/**
 * CEX-Style Market Data & Order Management
 *
 * Provides Binance-like trading features:
 * - Limit orders (bid/ask)
 * - Order book depth (L2)
 * - Mark price, index price, last price
 * - Open interest tracking
 * - 24h volume and stats
 * - Order types: market, limit, IOC, FOK
 */

import { Address, Hex, keccak256, toHex } from 'viem';
import { Option, OptionType } from './types.js';

// Order types like Binance
export type OrderType = 'market' | 'limit' | 'stop_limit' | 'take_profit';
export type OrderSide = 'buy' | 'sell';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK'; // Good-til-Cancel, Immediate-or-Cancel, Fill-or-Kill
export type OrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'expired';

export interface LimitOrder {
  id: Hex;
  optionId: Hex;
  trader: Address;
  side: OrderSide;
  orderType: OrderType;
  price: number;        // Limit price (premium)
  size: number;         // Number of contracts
  filledSize: number;
  status: OrderStatus;
  timeInForce: TimeInForce;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;   // For GTC orders
}

export interface OrderBookLevel {
  price: number;
  size: number;
  orders: number;       // Number of orders at this level
}

export interface OrderBookDepth {
  bids: OrderBookLevel[];  // Buy orders (highest first)
  asks: OrderBookLevel[];  // Sell orders (lowest first)
  lastUpdateTime: number;
}

export interface MarketPrices {
  markPrice: number;     // Fair value (theoretical price)
  indexPrice: number;    // Underlying spot price
  lastPrice: number;     // Last traded price
  bidPrice: number;      // Best bid
  askPrice: number;      // Best ask
  spread: number;        // Bid-ask spread
  spreadPercent: number;
}

export interface OpenInterestData {
  strike: number;
  expiry: number;
  callOI: number;        // Call open interest (contracts)
  putOI: number;         // Put open interest (contracts)
  callNotional: number;  // Call notional value (USD)
  putNotional: number;   // Put notional value (USD)
}

export interface VolumeStats {
  volume24h: number;           // 24h trading volume (contracts)
  volumeUsd24h: number;        // 24h volume in USD
  trades24h: number;           // Number of trades
  high24h: number;             // Highest premium
  low24h: number;              // Lowest premium
  priceChange24h: number;      // Price change
  priceChangePercent24h: number;
}

export interface MarketTicker {
  symbol: string;              // e.g., "ETH-2400-C"
  optionType: OptionType;
  strike: number;
  expiry: number;
  prices: MarketPrices;
  volume: VolumeStats;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  updatedAt: number;
}

export interface Trade {
  id: Hex;
  optionId: Hex;
  buyer: Address;
  seller: Address;
  price: number;
  size: number;
  side: OrderSide;       // Taker side
  timestamp: number;
}

/**
 * CEX-style Market Manager
 */
export class OptionsMarket {
  private orders: Map<Hex, LimitOrder> = new Map();
  private trades: Trade[] = [];
  private openInterest: Map<string, OpenInterestData> = new Map();
  private lastPrices: Map<Hex, number> = new Map();

  // Track 24h stats
  private volumeWindow: Trade[] = [];
  private readonly VOLUME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Place a limit order
   */
  placeLimitOrder(params: {
    optionId: Hex;
    trader: Address;
    side: OrderSide;
    price: number;
    size: number;
    timeInForce?: TimeInForce;
    expiresAt?: number;
  }): LimitOrder {
    const order: LimitOrder = {
      id: this.generateOrderId(params.trader, params.optionId),
      optionId: params.optionId,
      trader: params.trader,
      side: params.side,
      orderType: 'limit',
      price: params.price,
      size: params.size,
      filledSize: 0,
      status: 'open',
      timeInForce: params.timeInForce || 'GTC',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: params.expiresAt,
    };

    this.orders.set(order.id, order);
    console.log(`[Market] Limit order placed: ${order.side.toUpperCase()} ${order.size}x @ $${order.price}`);

    // Try to match immediately
    this.matchOrders(params.optionId);

    return order;
  }

  /**
   * Place a market order (fills at best available price)
   */
  placeMarketOrder(params: {
    optionId: Hex;
    trader: Address;
    side: OrderSide;
    size: number;
  }): { order: LimitOrder; fills: Trade[] } {
    const fills: Trade[] = [];
    const depth = this.getOrderBookDepth(params.optionId);

    // Market buy fills against asks, market sell fills against bids
    const levels = params.side === 'buy' ? depth.asks : depth.bids;

    let remainingSize = params.size;
    let totalCost = 0;

    for (const level of levels) {
      if (remainingSize <= 0) break;

      const fillSize = Math.min(remainingSize, level.size);
      const fillCost = fillSize * level.price;

      totalCost += fillCost;
      remainingSize -= fillSize;

      // Create trade
      const trade = this.executeTrade({
        optionId: params.optionId,
        buyer: params.side === 'buy' ? params.trader : '0x0' as Address,
        seller: params.side === 'sell' ? params.trader : '0x0' as Address,
        price: level.price,
        size: fillSize,
        side: params.side,
      });

      fills.push(trade);
    }

    const avgPrice = fills.length > 0 ? totalCost / (params.size - remainingSize) : 0;

    const order: LimitOrder = {
      id: this.generateOrderId(params.trader, params.optionId),
      optionId: params.optionId,
      trader: params.trader,
      side: params.side,
      orderType: 'market',
      price: avgPrice,
      size: params.size,
      filledSize: params.size - remainingSize,
      status: remainingSize === 0 ? 'filled' : 'partially_filled',
      timeInForce: 'IOC',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(order.id, order);
    return { order, fills };
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId: Hex, trader: Address): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;
    if (order.trader !== trader) return false;
    if (order.status !== 'open' && order.status !== 'partially_filled') return false;

    order.status = 'cancelled';
    order.updatedAt = Date.now();
    console.log(`[Market] Order ${orderId.slice(0, 10)}... cancelled`);
    return true;
  }

  /**
   * Get order book depth (L2 data)
   */
  getOrderBookDepth(optionId: Hex, levels: number = 10): OrderBookDepth {
    const openOrders = Array.from(this.orders.values())
      .filter(o => o.optionId === optionId && (o.status === 'open' || o.status === 'partially_filled'));

    const bids = openOrders.filter(o => o.side === 'buy');
    const asks = openOrders.filter(o => o.side === 'sell');

    // Aggregate by price level
    const bidLevels = this.aggregateOrders(bids, 'desc');
    const askLevels = this.aggregateOrders(asks, 'asc');

    return {
      bids: bidLevels.slice(0, levels),
      asks: askLevels.slice(0, levels),
      lastUpdateTime: Date.now(),
    };
  }

  /**
   * Get market prices for an option
   */
  getMarketPrices(optionId: Hex, theoreticalPrice: number, spotPrice: number): MarketPrices {
    const depth = this.getOrderBookDepth(optionId, 1);

    const bidPrice = depth.bids[0]?.price || 0;
    const askPrice = depth.asks[0]?.price || theoreticalPrice;
    const lastPrice = this.lastPrices.get(optionId) || theoreticalPrice;

    const spread = askPrice - bidPrice;
    const midPrice = (bidPrice + askPrice) / 2 || theoreticalPrice;

    return {
      markPrice: theoreticalPrice,  // Fair value from Black-Scholes
      indexPrice: spotPrice,         // Underlying ETH price
      lastPrice,
      bidPrice,
      askPrice,
      spread,
      spreadPercent: midPrice > 0 ? (spread / midPrice) * 100 : 0,
    };
  }

  /**
   * Get open interest for a strike/expiry
   */
  getOpenInterest(strike: number, expiry: number): OpenInterestData {
    const key = `${strike}-${expiry}`;
    return this.openInterest.get(key) || {
      strike,
      expiry,
      callOI: 0,
      putOI: 0,
      callNotional: 0,
      putNotional: 0,
    };
  }

  /**
   * Update open interest when position opens/closes
   */
  updateOpenInterest(
    strike: number,
    expiry: number,
    optionType: OptionType,
    delta: number,  // positive = open, negative = close
    notional: number
  ): void {
    const key = `${strike}-${expiry}`;
    const current = this.getOpenInterest(strike, expiry);

    if (optionType === 'call') {
      current.callOI += delta;
      current.callNotional += delta * notional;
    } else {
      current.putOI += delta;
      current.putNotional += delta * notional;
    }

    this.openInterest.set(key, current);
  }

  /**
   * Get 24h volume statistics
   */
  getVolumeStats(optionId?: Hex): VolumeStats {
    const cutoff = Date.now() - this.VOLUME_WINDOW_MS;

    // Clean old trades
    this.volumeWindow = this.volumeWindow.filter(t => t.timestamp > cutoff);

    // Filter by option if specified
    const relevantTrades = optionId
      ? this.volumeWindow.filter(t => t.optionId === optionId)
      : this.volumeWindow;

    if (relevantTrades.length === 0) {
      return {
        volume24h: 0,
        volumeUsd24h: 0,
        trades24h: 0,
        high24h: 0,
        low24h: 0,
        priceChange24h: 0,
        priceChangePercent24h: 0,
      };
    }

    const volume24h = relevantTrades.reduce((sum, t) => sum + t.size, 0);
    const volumeUsd24h = relevantTrades.reduce((sum, t) => sum + t.size * t.price, 0);
    const prices = relevantTrades.map(t => t.price);

    const high24h = Math.max(...prices);
    const low24h = Math.min(...prices);

    // Price change from first to last trade
    const firstPrice = relevantTrades[0].price;
    const lastPrice = relevantTrades[relevantTrades.length - 1].price;
    const priceChange24h = lastPrice - firstPrice;
    const priceChangePercent24h = firstPrice > 0 ? (priceChange24h / firstPrice) * 100 : 0;

    return {
      volume24h,
      volumeUsd24h,
      trades24h: relevantTrades.length,
      high24h,
      low24h,
      priceChange24h,
      priceChangePercent24h,
    };
  }

  /**
   * Get market ticker (combined market data)
   */
  getTicker(
    option: Option,
    theoreticalPrice: number,
    spotPrice: number,
    iv: number,
    delta: number
  ): MarketTicker {
    const strike = Number(option.strikePrice) / 1e8;
    const symbol = `ETH-${strike}-${option.optionType === 'call' ? 'C' : 'P'}`;

    return {
      symbol,
      optionType: option.optionType,
      strike,
      expiry: option.expiry,
      prices: this.getMarketPrices(option.id, theoreticalPrice, spotPrice),
      volume: this.getVolumeStats(option.id),
      openInterest: this.getOpenInterest(strike, option.expiry)[
        option.optionType === 'call' ? 'callOI' : 'putOI'
      ],
      impliedVolatility: iv * 100,  // As percentage
      delta,
      updatedAt: Date.now(),
    };
  }

  /**
   * Get all open interest data
   */
  getAllOpenInterest(): OpenInterestData[] {
    return Array.from(this.openInterest.values());
  }

  /**
   * Get recent trades
   */
  getRecentTrades(optionId?: Hex, limit: number = 50): Trade[] {
    let trades = [...this.trades].reverse();

    if (optionId) {
      trades = trades.filter(t => t.optionId === optionId);
    }

    return trades.slice(0, limit);
  }

  /**
   * Get trader's open orders
   */
  getTraderOrders(trader: Address, status?: OrderStatus): LimitOrder[] {
    return Array.from(this.orders.values())
      .filter(o => o.trader === trader && (!status || o.status === status));
  }

  /**
   * Match orders in the order book
   */
  private matchOrders(optionId: Hex): Trade[] {
    const fills: Trade[] = [];
    const depth = this.getOrderBookDepth(optionId);

    // Match best bid with best ask
    while (depth.bids.length > 0 && depth.asks.length > 0) {
      const bestBid = depth.bids[0];
      const bestAsk = depth.asks[0];

      // Check if orders cross
      if (bestBid.price < bestAsk.price) break;

      // Execute at the earlier order's price (price-time priority)
      const fillPrice = (bestBid.price + bestAsk.price) / 2;
      const fillSize = Math.min(bestBid.size, bestAsk.size);

      const trade = this.executeTrade({
        optionId,
        buyer: '0x0' as Address,  // Simplified
        seller: '0x0' as Address,
        price: fillPrice,
        size: fillSize,
        side: 'buy',
      });

      fills.push(trade);

      // Update levels
      bestBid.size -= fillSize;
      bestAsk.size -= fillSize;

      if (bestBid.size <= 0) depth.bids.shift();
      if (bestAsk.size <= 0) depth.asks.shift();
    }

    return fills;
  }

  /**
   * Record a trade (public method for external trade recording)
   */
  recordTrade(params: Omit<Trade, 'id' | 'timestamp'>): Trade {
    return this.executeTrade(params);
  }

  /**
   * Execute a trade
   */
  private executeTrade(params: Omit<Trade, 'id' | 'timestamp'>): Trade {
    const trade: Trade = {
      ...params,
      id: this.generateTradeId(),
      timestamp: Date.now(),
    };

    this.trades.push(trade);
    this.volumeWindow.push(trade);
    this.lastPrices.set(params.optionId, params.price);

    console.log(`[Market] Trade executed: ${params.size}x @ $${params.price.toFixed(2)}`);
    return trade;
  }

  /**
   * Aggregate orders by price level
   */
  private aggregateOrders(orders: LimitOrder[], sort: 'asc' | 'desc'): OrderBookLevel[] {
    const levels = new Map<number, OrderBookLevel>();

    for (const order of orders) {
      const remaining = order.size - order.filledSize;
      if (remaining <= 0) continue;

      const existing = levels.get(order.price);
      if (existing) {
        existing.size += remaining;
        existing.orders += 1;
      } else {
        levels.set(order.price, {
          price: order.price,
          size: remaining,
          orders: 1,
        });
      }
    }

    const sorted = Array.from(levels.values());
    sorted.sort((a, b) => sort === 'asc' ? a.price - b.price : b.price - a.price);
    return sorted;
  }

  private generateOrderId(trader: Address, optionId: Hex): Hex {
    return keccak256(toHex(`order:${trader}:${optionId}:${Date.now()}:${Math.random()}`));
  }

  private generateTradeId(): Hex {
    return keccak256(toHex(`trade:${Date.now()}:${Math.random()}`));
  }
}

// Singleton instance
export const optionsMarket = new OptionsMarket();
