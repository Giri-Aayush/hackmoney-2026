/**
 * Liquidation Engine
 *
 * Monitors positions and triggers liquidations when margin is insufficient.
 * Similar to Binance's liquidation system for options.
 */

import { Address, Hex } from 'viem';

export interface MarginRequirement {
  initialMargin: number;      // Required to open position
  maintenanceMargin: number;  // Required to keep position open
  currentMargin: number;      // Current margin level
  marginRatio: number;        // currentMargin / maintenanceMargin
}

export interface LiquidationRisk {
  positionId: Hex;
  owner: Address;
  marginRatio: number;
  status: 'safe' | 'warning' | 'danger' | 'liquidating';
  liquidationPrice?: number;  // Price at which liquidation triggers
  estimatedLoss?: number;
}

export interface LiquidationEvent {
  id: Hex;
  positionId: Hex;
  owner: Address;
  timestamp: number;
  reason: 'margin_call' | 'expiry' | 'manual';
  liquidationPrice: number;
  pnl: number;
  insuranceFundContribution: number;
}

export interface RiskConfig {
  initialMarginPercent: number;      // e.g., 0.20 = 20%
  maintenanceMarginPercent: number;  // e.g., 0.10 = 10%
  warningMarginRatio: number;        // e.g., 1.5 = 150% of maintenance
  liquidationFeePercent: number;     // e.g., 0.01 = 1%
  maxLeverage: number;               // e.g., 10x
}

const DEFAULT_CONFIG: RiskConfig = {
  initialMarginPercent: 0.20,       // 20% initial margin
  maintenanceMarginPercent: 0.10,   // 10% maintenance margin
  warningMarginRatio: 1.5,          // Warning at 150% of maintenance
  liquidationFeePercent: 0.01,      // 1% liquidation fee
  maxLeverage: 10,
};

/**
 * Liquidation Engine for Options Positions
 */
export class LiquidationEngine {
  private config: RiskConfig;
  private insuranceFund: number = 0;
  private liquidationHistory: LiquidationEvent[] = [];
  private positions: Map<Hex, { owner: Address; notional: number; margin: number; pnl: number }> = new Map();

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a position for monitoring
   */
  registerPosition(positionId: Hex, owner: Address, notional: number, margin: number): void {
    this.positions.set(positionId, { owner, notional, margin, pnl: 0 });
    console.log(`[Liquidation] Position ${positionId.slice(0, 10)}... registered with $${margin} margin`);
  }

  /**
   * Update position margin and PnL
   */
  updatePosition(positionId: Hex, currentValue: number, pnl: number): void {
    const position = this.positions.get(positionId);
    if (!position) return;

    position.pnl = pnl;
    position.margin = position.margin + pnl;  // Effective margin changes with PnL
  }

  /**
   * Remove position from monitoring
   */
  removePosition(positionId: Hex): void {
    this.positions.delete(positionId);
  }

  /**
   * Calculate margin requirements for a position
   */
  calculateMarginRequirement(notional: number, currentMargin: number): MarginRequirement {
    const initialMargin = notional * this.config.initialMarginPercent;
    const maintenanceMargin = notional * this.config.maintenanceMarginPercent;
    const marginRatio = maintenanceMargin > 0 ? currentMargin / maintenanceMargin : Infinity;

    return {
      initialMargin,
      maintenanceMargin,
      currentMargin,
      marginRatio,
    };
  }

  /**
   * Get liquidation risk for a position
   */
  getLiquidationRisk(positionId: Hex): LiquidationRisk | null {
    const position = this.positions.get(positionId);
    if (!position) return null;

    const margin = this.calculateMarginRequirement(position.notional, position.margin);
    let status: LiquidationRisk['status'] = 'safe';

    if (margin.marginRatio <= 1.0) {
      status = 'liquidating';
    } else if (margin.marginRatio <= this.config.warningMarginRatio) {
      status = 'danger';
    } else if (margin.marginRatio <= this.config.warningMarginRatio * 1.5) {
      status = 'warning';
    }

    // Calculate liquidation price (simplified)
    const pnlToLiquidation = position.margin - (position.notional * this.config.maintenanceMarginPercent);
    const liquidationPrice = pnlToLiquidation < 0 ? undefined : pnlToLiquidation;

    return {
      positionId,
      owner: position.owner,
      marginRatio: margin.marginRatio,
      status,
      liquidationPrice,
      estimatedLoss: status === 'liquidating' ? Math.abs(position.pnl) : undefined,
    };
  }

  /**
   * Check all positions and trigger liquidations
   */
  checkLiquidations(): LiquidationEvent[] {
    const events: LiquidationEvent[] = [];

    for (const [positionId, position] of this.positions) {
      const risk = this.getLiquidationRisk(positionId);
      if (!risk || risk.status !== 'liquidating') continue;

      // Execute liquidation
      const event = this.executeLiquidation(positionId, position, 'margin_call');
      events.push(event);
    }

    return events;
  }

  /**
   * Execute a liquidation
   */
  private executeLiquidation(
    positionId: Hex,
    position: { owner: Address; notional: number; margin: number; pnl: number },
    reason: LiquidationEvent['reason']
  ): LiquidationEvent {
    // Calculate liquidation fee
    const liquidationFee = position.notional * this.config.liquidationFeePercent;

    // Add to insurance fund (capped at remaining margin)
    const insuranceContribution = Math.min(liquidationFee, position.margin);
    this.insuranceFund += insuranceContribution;

    const event: LiquidationEvent = {
      id: `0x${Date.now().toString(16).padStart(64, '0')}` as Hex,
      positionId,
      owner: position.owner,
      timestamp: Date.now(),
      reason,
      liquidationPrice: 0, // Would be current price
      pnl: position.pnl,
      insuranceFundContribution: insuranceContribution,
    };

    this.liquidationHistory.push(event);
    this.positions.delete(positionId);

    console.log(`[Liquidation] Position ${positionId.slice(0, 10)}... liquidated. PnL: $${position.pnl.toFixed(2)}`);

    return event;
  }

  /**
   * Get positions at risk of liquidation
   */
  getPositionsAtRisk(): LiquidationRisk[] {
    const risks: LiquidationRisk[] = [];

    for (const positionId of this.positions.keys()) {
      const risk = this.getLiquidationRisk(positionId);
      if (risk && risk.status !== 'safe') {
        risks.push(risk);
      }
    }

    return risks.sort((a, b) => a.marginRatio - b.marginRatio);
  }

  /**
   * Get insurance fund balance
   */
  getInsuranceFundBalance(): number {
    return this.insuranceFund;
  }

  /**
   * Get liquidation history
   */
  getLiquidationHistory(limit: number = 50): LiquidationEvent[] {
    return [...this.liquidationHistory].reverse().slice(0, limit);
  }

  /**
   * Get risk configuration
   */
  getConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Calculate maximum position size given margin
   */
  getMaxPositionSize(availableMargin: number): number {
    return availableMargin / this.config.initialMarginPercent;
  }

  /**
   * Check if margin is sufficient for a new position
   */
  hassufficientMargin(notional: number, availableMargin: number): boolean {
    const required = notional * this.config.initialMarginPercent;
    return availableMargin >= required;
  }
}

// Singleton instance
export const liquidationEngine = new LiquidationEngine();
