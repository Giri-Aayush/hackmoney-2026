/**
 * State Channel Trading Service
 *
 * Connects options trading to Yellow Network state channels.
 * Handles off-chain trading with on-chain settlement capability.
 */

import { Address, Hex } from 'viem';
import { YellowClient, YellowClientConfig, ConnectionState } from './client.js';
import {
  SessionManager,
  AppSession,
  createUsdcAllocation,
  OPTICHANNEL_PROTOCOL,
} from './session.js';
import { RPCAppSessionAllocation } from '@erc7824/nitrolite';
import { Option, OptionType } from '../options/types.js';
import { OptionsOrderBook } from '../options/orderbook.js';
import { OptionsMarket } from '../options/market.js';
import { db } from '../db/service.js';

// Trading message types for state channel communication
export type TradeMessageType =
  | 'create_option'
  | 'buy_option'
  | 'exercise_option'
  | 'cancel_option'
  | 'price_update'
  | 'balance_update'
  | 'ack';

export interface TradeMessage {
  type: TradeMessageType;
  timestamp: number;
  nonce: number;
  data: unknown;
}

export interface CreateOptionData {
  optionId: Hex;
  writer: Address;
  optionType: OptionType;
  strike: number;
  expiry: number;
  premium: number;
  amount: number;
}

export interface BuyOptionData {
  optionId: Hex;
  buyer: Address;
  premium: number;
}

export interface ExerciseOptionData {
  optionId: Hex;
  holder: Address;
  settlementPrice: number;
  payout: number;
}

export interface TradingServiceConfig {
  privateKey: Hex;
  address: Address;
  clearNodeUrl?: string;
  orderBook: OptionsOrderBook;
  market: OptionsMarket;
  onTradeExecuted?: (trade: TradeMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
}

/**
 * StateChannelTradingService
 *
 * Manages options trading over Yellow Network state channels.
 * All trades happen off-chain in state channels, with on-chain
 * settlement only when positions are closed.
 */
export class StateChannelTradingService {
  private client: YellowClient;
  private sessionManager: SessionManager;
  private config: TradingServiceConfig;
  private tradingSessions: Map<Address, AppSession> = new Map();
  private messageNonce: number = 0;

  // ClearNode address (counterparty for all trades)
  private clearNodeAddress: Address = '0x0000000000000000000000000000000000000000';

  constructor(config: TradingServiceConfig) {
    this.config = config;

    const clientConfig: YellowClientConfig = {
      privateKey: config.privateKey,
      address: config.address,
      clearNodeUrl: config.clearNodeUrl,
      onStateChange: (state) => {
        console.log(`[Trading] Connection state: ${state}`);
        config.onStateChange?.(state);
      },
      onMessage: (method, data) => {
        this.handleIncomingMessage(method, data);
      },
      onError: (error) => {
        console.error('[Trading] Error:', error.message);
      },
    };

    this.client = new YellowClient(clientConfig);
    this.sessionManager = new SessionManager(this.client);
  }

  /**
   * Connect to Yellow Network and authenticate
   */
  async connect(): Promise<void> {
    console.log('[Trading] Connecting to Yellow Network...');
    await this.client.connectAndAuthenticate();

    // Get ClearNode config to find counterparty address
    const configResponse = await this.client.getConfig();
    if (configResponse.data && typeof configResponse.data === 'object') {
      const nodeConfig = configResponse.data as { clearnode_address?: string };
      if (nodeConfig.clearnode_address) {
        this.clearNodeAddress = nodeConfig.clearnode_address as Address;
        console.log(`[Trading] ClearNode address: ${this.clearNodeAddress}`);
      }
    }

    console.log('[Trading] Connected and ready for trading');
  }

  /**
   * Disconnect from Yellow Network
   */
  async disconnect(): Promise<void> {
    // Close all active sessions
    for (const [trader, session] of this.tradingSessions) {
      try {
        await this.closeTraderSession(trader);
      } catch (error) {
        console.error(`[Trading] Error closing session for ${trader}:`, error);
      }
    }

    await this.client.disconnect();
    console.log('[Trading] Disconnected');
  }

  /**
   * Initialize a trading session for a trader
   * Creates an app session with ClearNode for gasless trading
   */
  async initTraderSession(
    trader: Address,
    initialBalance: number = 1000
  ): Promise<AppSession> {
    // Check if session already exists
    const existing = this.tradingSessions.get(trader);
    if (existing && existing.status === 'active') {
      console.log(`[Trading] Session already exists for ${trader.slice(0, 10)}...`);
      return existing;
    }

    console.log(`[Trading] Creating trading session for ${trader.slice(0, 10)}...`);

    // Create allocations - trader deposits USDC for trading
    const initialAllocations: RPCAppSessionAllocation[] = [
      createUsdcAllocation(trader, initialBalance),
      createUsdcAllocation(this.clearNodeAddress, initialBalance), // ClearNode matches
    ];

    const session = await this.sessionManager.createOptionsSession({
      participants: [trader, this.clearNodeAddress],
      initialAllocations,
    });

    this.tradingSessions.set(trader, session);
    console.log(`[Trading] Session created: ${session.sessionId.slice(0, 10)}...`);

    return session;
  }

  /**
   * Close a trader's session with final settlement
   */
  async closeTraderSession(trader: Address): Promise<void> {
    const session = this.tradingSessions.get(trader);
    if (!session) {
      throw new Error(`No session found for ${trader}`);
    }

    // Calculate final balances from database
    const balance = await db.getUserBalance(trader);

    const finalAllocations: RPCAppSessionAllocation[] = [
      createUsdcAllocation(trader, balance),
      createUsdcAllocation(this.clearNodeAddress, 0),
    ];

    await this.sessionManager.closeSession(session.sessionId, finalAllocations);
    this.tradingSessions.delete(trader);

    console.log(`[Trading] Session closed for ${trader.slice(0, 10)}...`);
  }

  /**
   * Create an option in the state channel
   */
  async createOption(params: {
    writer: Address;
    optionType: OptionType;
    strikePrice: number;
    premium: number;
    amount: number;
    expiryMinutes: number;
  }): Promise<Option> {
    const session = this.tradingSessions.get(params.writer);
    if (!session) {
      throw new Error('No trading session. Call initTraderSession first.');
    }

    // Create option in local order book
    const option = await this.config.orderBook.listOption(params.writer, {
      underlying: 'ETH/USD',
      strikePrice: params.strikePrice,
      premium: params.premium,
      amount: params.amount,
      expiryMinutes: params.expiryMinutes,
      optionType: params.optionType,
    });

    // Broadcast to state channel
    const message: TradeMessage = {
      type: 'create_option',
      timestamp: Date.now(),
      nonce: this.getNextNonce(),
      data: {
        optionId: option.id,
        writer: params.writer,
        optionType: params.optionType,
        strike: params.strikePrice,
        expiry: option.expiry,
        premium: params.premium,
        amount: params.amount,
      } as CreateOptionData,
    };

    await this.sessionManager.sendMessage(session.sessionId, 'trade', message);

    // Record in database
    await db.createOption(params.writer, {
      underlying: 'ETH/USD',
      strikePrice: params.strikePrice,
      premium: params.premium,
      amount: params.amount,
      expiryMinutes: params.expiryMinutes,
      optionType: params.optionType,
    });

    console.log(`[Trading] Option created: ${option.id.slice(0, 10)}... ${params.optionType.toUpperCase()} @ $${params.strikePrice}`);

    this.config.onTradeExecuted?.(message);
    return option;
  }

  /**
   * Buy an option through state channel
   */
  async buyOption(optionId: Hex, buyer: Address): Promise<Option> {
    const session = this.tradingSessions.get(buyer);
    if (!session) {
      throw new Error('No trading session. Call initTraderSession first.');
    }

    // Execute in local order book
    const option = await this.config.orderBook.buyOption(optionId, buyer);
    const premium = Number(option.premium) / 1e8;

    // Update state channel allocations
    const buyerCurrentAlloc = session.allocations.find(a => a.participant === buyer);
    const writerCurrentAlloc = session.allocations.find(a => a.participant === this.clearNodeAddress);

    if (buyerCurrentAlloc && writerCurrentAlloc) {
      const newBuyerBalance = Number(buyerCurrentAlloc.amount) / 1e6 - premium;
      const newWriterBalance = Number(writerCurrentAlloc.amount) / 1e6 + premium;

      const newAllocations: RPCAppSessionAllocation[] = [
        createUsdcAllocation(buyer, newBuyerBalance),
        createUsdcAllocation(this.clearNodeAddress, newWriterBalance),
      ];

      this.sessionManager.updateSessionAllocations(session.sessionId, newAllocations);
    }

    // Broadcast to state channel
    const message: TradeMessage = {
      type: 'buy_option',
      timestamp: Date.now(),
      nonce: this.getNextNonce(),
      data: {
        optionId,
        buyer,
        premium,
      } as BuyOptionData,
    };

    await this.sessionManager.sendMessage(session.sessionId, 'trade', message);

    // Record in database
    await db.buyOption(optionId, buyer);

    console.log(`[Trading] Option bought: ${optionId.slice(0, 10)}... by ${buyer.slice(0, 10)}...`);

    this.config.onTradeExecuted?.(message);
    return option;
  }

  /**
   * Exercise an option through state channel
   */
  async exerciseOption(
    optionId: Hex,
    holder: Address,
    settlementPrice: number
  ): Promise<{ payout: number }> {
    const session = this.tradingSessions.get(holder);
    if (!session) {
      throw new Error('No trading session. Call initTraderSession first.');
    }

    // Execute in local order book
    const result = await this.config.orderBook.exerciseOption(optionId, holder);

    // Update state channel allocations for payout
    if (result.payout > 0) {
      const holderCurrentAlloc = session.allocations.find(a => a.participant === holder);
      const writerCurrentAlloc = session.allocations.find(a => a.participant === this.clearNodeAddress);

      if (holderCurrentAlloc && writerCurrentAlloc) {
        const newHolderBalance = Number(holderCurrentAlloc.amount) / 1e6 + result.payout;
        const newWriterBalance = Math.max(0, Number(writerCurrentAlloc.amount) / 1e6 - result.payout);

        const newAllocations: RPCAppSessionAllocation[] = [
          createUsdcAllocation(holder, newHolderBalance),
          createUsdcAllocation(this.clearNodeAddress, newWriterBalance),
        ];

        this.sessionManager.updateSessionAllocations(session.sessionId, newAllocations);
      }
    }

    // Broadcast to state channel
    const message: TradeMessage = {
      type: 'exercise_option',
      timestamp: Date.now(),
      nonce: this.getNextNonce(),
      data: {
        optionId,
        holder,
        settlementPrice,
        payout: result.payout,
      } as ExerciseOptionData,
    };

    await this.sessionManager.sendMessage(session.sessionId, 'trade', message);

    // Record in database
    await db.exerciseOption(optionId, holder, settlementPrice);

    console.log(`[Trading] Option exercised: ${optionId.slice(0, 10)}... payout: $${result.payout.toFixed(2)}`);

    this.config.onTradeExecuted?.(message);
    return result;
  }

  /**
   * Get current ledger balances from Yellow Network
   */
  async getLedgerBalances(): Promise<unknown> {
    return this.client.getLedgerBalances();
  }

  /**
   * Get all channels
   */
  async getChannels(): Promise<unknown> {
    return this.client.getChannels();
  }

  /**
   * Get active trading sessions
   */
  getActiveSessions(): AppSession[] {
    return this.sessionManager.getActiveSessions();
  }

  /**
   * Check if connected and authenticated
   */
  get isReady(): boolean {
    return this.client.isAuthenticated;
  }

  /**
   * Get connection state
   */
  get connectionState(): ConnectionState {
    return this.client.connectionState;
  }

  /**
   * Handle incoming messages from state channel
   */
  private handleIncomingMessage(method: string, data: unknown): void {
    console.log(`[Trading] Received: ${method}`);

    // Handle different message types
    switch (method) {
      case 'app_session_message':
        this.handleAppSessionMessage(data);
        break;

      case 'balance_update':
        console.log('[Trading] Balance update:', data);
        break;

      case 'state_update':
        console.log('[Trading] State update received');
        break;

      default:
        // Log unknown message types for debugging
        if (method !== 'pong') {
          console.log(`[Trading] Unhandled message: ${method}`);
        }
    }
  }

  /**
   * Handle app session messages (trade confirmations, etc.)
   */
  private handleAppSessionMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;

    const msg = data as { type?: string; data?: unknown };
    if (msg.type === 'trade') {
      const trade = msg.data as TradeMessage;
      console.log(`[Trading] Trade confirmed: ${trade.type} (nonce: ${trade.nonce})`);

      // Send acknowledgment
      // In production, would verify signatures and update local state
    }
  }

  private getNextNonce(): number {
    return ++this.messageNonce;
  }
}

// Factory function for creating trading service
export function createTradingService(config: TradingServiceConfig): StateChannelTradingService {
  return new StateChannelTradingService(config);
}
