import { Address, Hex } from 'viem';
import { OptionType, OptionStatus } from '../lib/options/types.js';
import { PositionSide } from '../lib/portfolio/position.js';
import { StrategyType } from '../lib/strategies/types.js';

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// Price endpoints
export interface PriceResponse {
  symbol: string;
  price: number;
  confidence: number;
  publishTime: string;
}

// Options endpoints
export interface OptionResponse {
  id: Hex;
  underlying: string;
  strikePrice: number;
  premium: number;
  expiry: number;
  expiryDate: string;
  optionType: OptionType;
  amount: number;
  writer: Address;
  holder: Address | null;
  status: OptionStatus;
  createdAt: number;
  // Pricing data
  theoreticalPrice?: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  intrinsicValue?: number;
  timeValue?: number;
  breakeven?: number;
}

export interface CreateOptionRequest {
  underlying: string;
  strikePrice: number;
  premium: number;
  expiryMinutes: number;
  optionType: OptionType;
  amount: number;
}

export interface BuyOptionRequest {
  optionId: Hex;
}

export interface ExerciseOptionRequest {
  optionId: Hex;
}

// Portfolio endpoints
export interface PositionResponse {
  id: Hex;
  optionId: Hex;
  side: PositionSide;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  marketValue: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  option: OptionResponse;
}

export interface PortfolioResponse {
  balance: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  buyingPower: number;
  marginRequired: number;
  positions: PositionResponse[];
  aggregateGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

export interface OpenPositionRequest {
  optionId: Hex;
  side: PositionSide;
  size: number;
}

export interface ClosePositionRequest {
  positionId: Hex;
}

// Strategy endpoints
export interface StrategyResponse {
  id: Hex;
  name: string;
  type: StrategyType;
  underlying: string;
  legs: {
    optionType: OptionType;
    strike: number;
    side: PositionSide;
    quantity: number;
    premium: number;
  }[];
  expiry: number;
  netDebit: number;
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakevens: number[];
  currentPnl?: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

export interface BuildStrategyRequest {
  type: StrategyType;
  underlying: string;
  // For spreads
  lowerStrike?: number;
  upperStrike?: number;
  // For straddle
  strike?: number;
  // For strangle
  putStrike?: number;
  callStrike?: number;
  // For iron condor
  putBuyStrike?: number;
  putSellStrike?: number;
  callSellStrike?: number;
  callBuyStrike?: number;
  // For butterfly
  middleStrike?: number;
  // Common
  expiryDays: number;
  optionType?: OptionType;
}

// WebSocket messages
export interface WsMessage {
  type: 'price_update' | 'position_update' | 'trade_executed' | 'option_created';
  data: unknown;
  timestamp: number;
}

export interface WsPriceUpdate {
  type: 'price_update';
  data: PriceResponse;
  timestamp: number;
}
