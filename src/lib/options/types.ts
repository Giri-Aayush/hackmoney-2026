import { Address, Hex } from 'viem';

export type OptionType = 'call' | 'put';
export type OptionStatus = 'open' | 'exercised' | 'expired' | 'cancelled';

export interface Option {
  id: Hex;
  writer: Address;          // Option seller
  holder: Address | null;   // Option buyer (null if not sold yet)
  underlying: string;       // e.g., "ETH"
  strikePrice: bigint;      // Strike price in USD (scaled by 1e8)
  premium: bigint;          // Premium in USD (scaled by 1e8)
  expiry: number;           // Unix timestamp in seconds
  optionType: OptionType;   // 'call' or 'put'
  amount: bigint;           // Amount of underlying (scaled by 1e18)
  status: OptionStatus;
  createdAt: number;        // Unix timestamp
  exercisedAt?: number;     // Unix timestamp if exercised
  settlementPrice?: bigint; // Price at settlement (scaled by 1e8)
}

export interface CreateOptionParams {
  underlying: string;
  strikePrice: number;      // Human-readable USD price
  premium: number;          // Human-readable USD premium
  expiryMinutes: number;    // Minutes until expiry
  optionType: OptionType;
  amount: number;           // Human-readable amount (e.g., 0.1 ETH)
}

export interface OptionQuote {
  option: Option;
  currentPrice: number;     // Current underlying price
  intrinsicValue: number;   // Current intrinsic value
  timeValue: number;        // Time value component
  breakeven: number;        // Breakeven price
  maxProfit: number | 'unlimited';
  maxLoss: number;
}

// App session message types for options
export interface OptionsAppMessage {
  action: 'create_option' | 'buy_option' | 'exercise_option' | 'cancel_option';
  data: unknown;
}

export interface CreateOptionMessage {
  action: 'create_option';
  data: CreateOptionParams;
}

export interface BuyOptionMessage {
  action: 'buy_option';
  data: {
    optionId: Hex;
  };
}

export interface ExerciseOptionMessage {
  action: 'exercise_option';
  data: {
    optionId: Hex;
    settlementPrice: number;
  };
}
