import { Address, Hex } from 'viem';
import { Option, OptionType } from '../options/types.js';
import { blackScholes, Greeks } from '../pricing/index.js';

export type PositionSide = 'long' | 'short';

export interface Position {
  id: Hex;
  optionId: Hex;
  owner: Address;
  side: PositionSide;
  size: number;
  entryPrice: number;
  currentPrice: number;
  option: Option;
  openedAt: number;
  closedAt?: number;
}

export interface PositionWithGreeks extends Position {
  greeks: Greeks;
  pnl: number;
  pnlPercent: number;
  marketValue: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  positions: PositionWithGreeks[];
  aggregateGreeks: Greeks;
  marginRequired: number;
  buyingPower: number;
}

export class PositionManager {
  private positions: Map<Hex, Position> = new Map();
  private balance: number;
  private riskFreeRate: number = 0.05; // 5% default
  private defaultVolatility: number = 0.6; // 60% default for crypto

  constructor(initialBalance: number = 10000) {
    this.balance = initialBalance;
  }

  setRiskFreeRate(rate: number): void {
    this.riskFreeRate = rate;
  }

  setDefaultVolatility(vol: number): void {
    this.defaultVolatility = vol;
  }

  getBalance(): number {
    return this.balance;
  }

  deposit(amount: number): void {
    this.balance += amount;
  }

  withdraw(amount: number): boolean {
    if (amount > this.balance) return false;
    this.balance -= amount;
    return true;
  }

  openPosition(
    option: Option,
    side: PositionSide,
    size: number,
    spotPrice: number
  ): Position {
    const premium = Number(option.premium) / 1e8;
    const strike = Number(option.strikePrice) / 1e8;
    const timeToExpiry = Math.max(0, (option.expiry - Date.now() / 1000) / (365 * 24 * 3600));

    const bsResult = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      volatility: this.defaultVolatility,
      riskFreeRate: this.riskFreeRate,
      optionType: option.optionType,
    });

    const entryPrice = bsResult.price;
    const cost = entryPrice * size;

    if (side === 'long') {
      // Buying options - pay premium
      if (cost > this.balance) {
        throw new Error(`Insufficient balance. Need $${cost.toFixed(2)}, have $${this.balance.toFixed(2)}`);
      }
      this.balance -= cost;
    } else {
      // Writing options - receive premium but need collateral
      const collateralRequired = this.calculateCollateral(option, size, spotPrice);
      if (collateralRequired > this.balance) {
        throw new Error(`Insufficient collateral. Need $${collateralRequired.toFixed(2)}, have $${this.balance.toFixed(2)}`);
      }
      this.balance += cost; // Receive premium
      this.balance -= collateralRequired; // Lock collateral
    }

    const positionId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(66, '0').slice(0, 66) as Hex;

    const position: Position = {
      id: positionId,
      optionId: option.id,
      owner: option.writer,
      side,
      size,
      entryPrice,
      currentPrice: entryPrice,
      option,
      openedAt: Math.floor(Date.now() / 1000),
    };

    this.positions.set(positionId, position);
    return position;
  }

  private calculateCollateral(option: Option, size: number, spotPrice: number): number {
    // Simplified collateral: 20% of notional for calls, strike for puts
    const notional = spotPrice * size * (Number(option.amount) / 1e18);
    if (option.optionType === 'call') {
      return notional * 0.2; // 20% collateral for calls
    } else {
      const strike = Number(option.strikePrice) / 1e8;
      return strike * size * (Number(option.amount) / 1e18);
    }
  }

  updatePositionPrice(positionId: Hex, spotPrice: number): PositionWithGreeks | null {
    const position = this.positions.get(positionId);
    if (!position || position.closedAt) return null;

    const strike = Number(position.option.strikePrice) / 1e8;
    const timeToExpiry = Math.max(0, (position.option.expiry - Date.now() / 1000) / (365 * 24 * 3600));

    const bsResult = blackScholes({
      spot: spotPrice,
      strike,
      timeToExpiry,
      volatility: this.defaultVolatility,
      riskFreeRate: this.riskFreeRate,
      optionType: position.option.optionType,
    });

    position.currentPrice = bsResult.price;

    const pnl = position.side === 'long'
      ? (position.currentPrice - position.entryPrice) * position.size
      : (position.entryPrice - position.currentPrice) * position.size;

    const pnlPercent = (pnl / (position.entryPrice * position.size)) * 100;
    const marketValue = position.currentPrice * position.size;

    // Scale Greeks by position size and side
    const sideMultiplier = position.side === 'long' ? 1 : -1;
    const scaledGreeks: Greeks = {
      delta: bsResult.greeks.delta * position.size * sideMultiplier,
      gamma: bsResult.greeks.gamma * position.size,
      theta: bsResult.greeks.theta * position.size * sideMultiplier,
      vega: bsResult.greeks.vega * position.size,
      rho: bsResult.greeks.rho * position.size * sideMultiplier,
    };

    return {
      ...position,
      greeks: scaledGreeks,
      pnl,
      pnlPercent,
      marketValue,
    };
  }

  closePosition(positionId: Hex, spotPrice: number): { pnl: number; position: Position } | null {
    const updated = this.updatePositionPrice(positionId, spotPrice);
    if (!updated) return null;

    const position = this.positions.get(positionId)!;
    position.closedAt = Math.floor(Date.now() / 1000);

    // Return funds
    if (position.side === 'long') {
      this.balance += updated.marketValue;
    } else {
      // Return collateral and pay out any losses
      const collateral = this.calculateCollateral(position.option, position.size, spotPrice);
      this.balance += collateral - (updated.pnl < 0 ? Math.abs(updated.pnl) : 0);
    }

    return { pnl: updated.pnl, position };
  }

  getPortfolio(spotPrice: number): PortfolioSummary {
    const openPositions = Array.from(this.positions.values()).filter(p => !p.closedAt);
    const positionsWithGreeks: PositionWithGreeks[] = [];

    const aggregateGreeks: Greeks = {
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };

    let totalValue = 0;
    let totalCost = 0;

    for (const pos of openPositions) {
      const updated = this.updatePositionPrice(pos.id, spotPrice);
      if (updated) {
        positionsWithGreeks.push(updated);
        totalValue += updated.marketValue;
        totalCost += pos.entryPrice * pos.size;

        aggregateGreeks.delta += updated.greeks.delta;
        aggregateGreeks.gamma += updated.greeks.gamma;
        aggregateGreeks.theta += updated.greeks.theta;
        aggregateGreeks.vega += updated.greeks.vega;
        aggregateGreeks.rho += updated.greeks.rho;
      }
    }

    const totalPnl = totalValue - totalCost;
    const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    // Calculate margin required for short positions
    const marginRequired = openPositions
      .filter(p => p.side === 'short')
      .reduce((sum, p) => sum + this.calculateCollateral(p.option, p.size, spotPrice), 0);

    return {
      totalValue,
      totalPnl,
      totalPnlPercent,
      positions: positionsWithGreeks,
      aggregateGreeks,
      marginRequired,
      buyingPower: this.balance,
    };
  }

  getPosition(positionId: Hex): Position | undefined {
    return this.positions.get(positionId);
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getOpenPositions(): Position[] {
    return this.getAllPositions().filter(p => !p.closedAt);
  }
}
