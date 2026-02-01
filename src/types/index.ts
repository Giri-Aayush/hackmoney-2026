// ============================================
// Yellow Network Types
// ============================================

export interface ChannelState {
  channelId: string;
  participants: string[];
  balances: Record<string, bigint>;
  nonce: number;
  isFinal: boolean;
}

export interface SignedMessage {
  message: string;
  signature: string;
  signer: string;
}

// ============================================
// Options Types
// ============================================

export type OptionType = 'call' | 'put';
export type OptionStatus = 'open' | 'active' | 'exercised' | 'expired' | 'cancelled';

export interface Option {
  id: string;
  type: OptionType;
  underlying: 'ETH';
  strike: bigint;          // Strike price in USD (scaled by 1e8)
  expiry: number;          // Unix timestamp
  amount: bigint;          // Amount of underlying (in wei)
  premium: bigint;         // Premium in USD (scaled by 1e8)
  collateral: bigint;      // Collateral locked (in wei for calls, USD for puts)
  writer: string;          // Address of option writer
  holder: string | null;   // Address of option holder (null if open)
  status: OptionStatus;
  createdAt: number;
  settledAt?: number;
  settlementPrice?: bigint;
  payout?: bigint;
}

export interface CreateOptionParams {
  type: OptionType;
  strike: bigint;
  expiry: number;
  amount: bigint;
  premium: bigint;
}

export interface OptionOrder {
  optionId: string;
  price: bigint;
  maker: string;
  side: 'buy' | 'sell';
  createdAt: number;
}

// ============================================
// Price Types
// ============================================

export interface PriceData {
  price: bigint;
  expo: number;
  confidence: bigint;
  publishTime: number;
}

export interface PriceUpdate {
  priceId: string;
  price: PriceData;
  updateData: string;
}

// ============================================
// Event Types
// ============================================

export type YellowEventType =
  | 'connected'
  | 'disconnected'
  | 'state_update'
  | 'message'
  | 'error';

export interface YellowEvent<T = unknown> {
  type: YellowEventType;
  data: T;
  timestamp: number;
}

// ============================================
// Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BalanceResponse {
  address: string;
  balances: Record<string, bigint>;
}
