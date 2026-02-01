import { Hex } from 'viem';
import { PositionSide } from '../portfolio/position.js';
import { Greeks } from '../pricing/index.js';

export type StrategyType =
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'straddle'
  | 'strangle'
  | 'iron_condor'
  | 'butterfly'
  | 'covered_call'
  | 'protective_put'
  | 'collar'
  | 'custom';

export interface StrategyLeg {
  optionType: 'call' | 'put';
  strike: number;
  side: PositionSide;
  quantity: number;
  premium: number;
}

export interface Strategy {
  id: Hex;
  name: string;
  type: StrategyType;
  underlying: string;
  legs: StrategyLeg[];
  expiry: number;
  netDebit: number;  // Positive = debit (pay), negative = credit (receive)
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakevens: number[];
  createdAt: number;
}

export interface StrategyPnL {
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  greeks: Greeks;
  legValues: {
    leg: StrategyLeg;
    currentPrice: number;
    pnl: number;
  }[];
}

export interface PayoffPoint {
  price: number;
  profit: number;
}

export interface StrategyPayoff {
  points: PayoffPoint[];
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
}
