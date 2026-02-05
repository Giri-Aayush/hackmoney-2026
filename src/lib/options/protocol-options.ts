/**
 * Protocol Options Generator
 *
 * Creates standardized options contracts like Binance/Deribit:
 * - Standardized strike prices around current spot price
 * - Standard expiries (daily, weekly, monthly)
 * - Protocol acts as market maker (writer)
 * - Black-Scholes pricing with competitive spreads
 */

import { Address, Hex, keccak256, toHex, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { OptionsOrderBook } from './orderbook.js';
import { OptionType, CreateOptionParams } from './types.js';
import { PythClient } from '../pyth/index.js';
import { config } from '../../config/index.js';

export interface ProtocolOptionsConfig {
  // Strike price intervals
  strikeIntervals: number[]; // e.g., [-10, -5, 0, 5, 10] for ATM ±%
  // Expiry options in seconds from now
  expiries: {
    label: string;
    seconds: number;
  }[];
  // Amount per contract (in ETH)
  contractSize: number;
  // Spread around theoretical price (as percentage)
  bidAskSpread: number;
  // Implied volatility for pricing
  baseIV: number;
}

// Default configuration similar to Binance
const DEFAULT_CONFIG: ProtocolOptionsConfig = {
  strikeIntervals: [-10, -5, -2.5, 0, 2.5, 5, 10], // ATM and ±2.5%, ±5%, ±10%
  expiries: [
    { label: '1 Day', seconds: 24 * 60 * 60 },
    { label: '3 Days', seconds: 3 * 24 * 60 * 60 },
    { label: '1 Week', seconds: 7 * 24 * 60 * 60 },
    { label: '2 Weeks', seconds: 14 * 24 * 60 * 60 },
    { label: '1 Month', seconds: 30 * 24 * 60 * 60 },
  ],
  contractSize: 0.1, // 0.1 ETH per contract
  bidAskSpread: 0.02, // 2% spread
  baseIV: 0.65, // 65% implied volatility
};

export interface OptionsChainEntry {
  strike: number;
  expiry: number;
  expiryLabel: string;
  call: {
    optionId: Hex;
    bid: number;
    ask: number;
    premium: number;
    delta: number;
    iv: number;
  } | null;
  put: {
    optionId: Hex;
    bid: number;
    ask: number;
    premium: number;
    delta: number;
    iv: number;
  } | null;
}

export interface OptionsChain {
  underlying: string;
  spotPrice: number;
  timestamp: number;
  expiries: string[];
  chain: OptionsChainEntry[];
}

export class ProtocolOptionsGenerator {
  private orderBook: OptionsOrderBook;
  private pythClient: PythClient;
  private protocolAddress: Address;
  private config: ProtocolOptionsConfig;
  private initialized = false;
  private generatedOptions: Map<string, Hex> = new Map(); // key -> optionId

  constructor(
    orderBook: OptionsOrderBook,
    pythClient: PythClient,
    protocolPrivateKey?: string,
    customConfig?: Partial<ProtocolOptionsConfig>
  ) {
    this.orderBook = orderBook;
    this.pythClient = pythClient;
    this.config = { ...DEFAULT_CONFIG, ...customConfig };

    // Derive protocol address from private key
    const privateKey = protocolPrivateKey || config.wallet.privateKey;
    if (privateKey) {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      this.protocolAddress = account.address;
    } else {
      // Fallback to a deterministic "protocol" address for demo
      this.protocolAddress = getAddress('0x1234567890123456789012345678901234567890');
    }

    console.log(`[Protocol] Options generator initialized for ${this.protocolAddress.slice(0, 10)}...`);
  }

  /**
   * Get protocol wallet address
   */
  getProtocolAddress(): Address {
    return this.protocolAddress;
  }

  /**
   * Generate all protocol options for current market conditions
   */
  async generateOptions(): Promise<number> {
    const priceData = await this.pythClient.getEthUsdPrice();
    const spotPrice = priceData.price;
    const now = Math.floor(Date.now() / 1000);

    console.log(`[Protocol] Generating options at spot price $${spotPrice.toFixed(2)}`);

    let count = 0;

    for (const expiry of this.config.expiries) {
      const expiryTime = now + expiry.seconds;

      for (const interval of this.config.strikeIntervals) {
        // Calculate strike based on interval percentage
        const strike = Math.round(spotPrice * (1 + interval / 100) / 50) * 50; // Round to $50

        // Create call option
        const callKey = `call-${strike}-${expiryTime}`;
        if (!this.generatedOptions.has(callKey)) {
          try {
            const callOption = await this.createProtocolOption(
              'call',
              strike,
              expiry.seconds, // seconds from now until expiry
              spotPrice,
              expiry.seconds / (365 * 24 * 60 * 60) // time to expiry in years
            );
            this.generatedOptions.set(callKey, callOption.id);
            count++;
          } catch (e) {
            console.error(`[Protocol] Failed to create call option at $${strike}:`, e);
          }
        }

        // Create put option
        const putKey = `put-${strike}-${expiryTime}`;
        if (!this.generatedOptions.has(putKey)) {
          try {
            const putOption = await this.createProtocolOption(
              'put',
              strike,
              expiry.seconds, // seconds from now until expiry
              spotPrice,
              expiry.seconds / (365 * 24 * 60 * 60)
            );
            this.generatedOptions.set(putKey, putOption.id);
            count++;
          } catch (e) {
            console.error(`[Protocol] Failed to create put option at $${strike}:`, e);
          }
        }
      }
    }

    this.initialized = true;
    console.log(`[Protocol] Generated ${count} new options`);
    return count;
  }

  /**
   * Create a single protocol option
   */
  private async createProtocolOption(
    type: OptionType,
    strike: number,
    expirySeconds: number, // seconds from now until expiry
    spotPrice: number,
    timeToExpiry: number
  ) {
    // Calculate Black-Scholes premium
    const premium = this.calculatePremium(type, strike, spotPrice, timeToExpiry);

    // Convert seconds to minutes for CreateOptionParams
    const expiryMinutes = Math.ceil(expirySeconds / 60);

    const params: CreateOptionParams = {
      optionType: type,
      underlying: 'ETH/USD',
      strikePrice: strike,
      expiryMinutes,
      premium,
      amount: this.config.contractSize,
    };

    return this.orderBook.listOption(this.protocolAddress, params);
  }

  /**
   * Calculate option premium using Black-Scholes approximation
   */
  private calculatePremium(
    type: OptionType,
    strike: number,
    spot: number,
    timeToExpiry: number
  ): number {
    const iv = this.config.baseIV;
    const r = 0.05; // Risk-free rate (5%)

    // Simplified Black-Scholes
    const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * timeToExpiry) /
      (iv * Math.sqrt(timeToExpiry));
    const d2 = d1 - iv * Math.sqrt(timeToExpiry);

    const nd1 = this.normalCDF(d1);
    const nd2 = this.normalCDF(d2);

    let premium: number;
    if (type === 'call') {
      premium = spot * nd1 - strike * Math.exp(-r * timeToExpiry) * nd2;
    } else {
      premium = strike * Math.exp(-r * timeToExpiry) * this.normalCDF(-d2) -
        spot * this.normalCDF(-d1);
    }

    // Ensure minimum premium
    const minPremium = spot * 0.005; // 0.5% of spot minimum
    return Math.max(premium, minPremium) * this.config.contractSize;
  }

  /**
   * Get bid/ask prices for an option (with spread)
   */
  getBidAsk(theoreticalPrice: number): { bid: number; ask: number } {
    const halfSpread = this.config.bidAskSpread / 2;
    return {
      bid: theoreticalPrice * (1 - halfSpread),
      ask: theoreticalPrice * (1 + halfSpread),
    };
  }

  /**
   * Calculate option delta
   */
  calculateDelta(
    type: OptionType,
    strike: number,
    spot: number,
    timeToExpiry: number
  ): number {
    const iv = this.config.baseIV;
    const r = 0.05;

    const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * timeToExpiry) /
      (iv * Math.sqrt(timeToExpiry));

    if (type === 'call') {
      return this.normalCDF(d1);
    } else {
      return this.normalCDF(d1) - 1;
    }
  }

  /**
   * Get the full options chain like Binance
   */
  async getOptionsChain(expiryFilter?: string): Promise<OptionsChain> {
    const priceData = await this.pythClient.getEthUsdPrice();
    const spotPrice = priceData.price;
    const now = Math.floor(Date.now() / 1000);

    const options = this.orderBook.getAvailableOptions();
    const chain: OptionsChainEntry[] = [];

    // Group options by strike and expiry
    const groupedOptions = new Map<string, { call?: typeof options[0]; put?: typeof options[0] }>();

    for (const option of options) {
      // Only include protocol options
      if (option.writer !== this.protocolAddress) continue;

      const strike = Number(option.strikePrice) / 1e8;
      const key = `${strike}-${option.expiry}`;

      if (!groupedOptions.has(key)) {
        groupedOptions.set(key, {});
      }

      const group = groupedOptions.get(key)!;
      if (option.optionType === 'call') {
        group.call = option;
      } else {
        group.put = option;
      }
    }

    // Build chain entries
    const expiryLabels = new Set<string>();

    for (const [key, group] of groupedOptions) {
      const [strikeStr, expiryStr] = key.split('-');
      const strike = parseFloat(strikeStr);
      const expiry = parseInt(expiryStr);

      // Find expiry label
      const timeToExpiry = expiry - now;
      let expiryLabel = 'Custom';
      for (const exp of this.config.expiries) {
        if (Math.abs(timeToExpiry - exp.seconds) < 3600) { // Within 1 hour
          expiryLabel = exp.label;
          break;
        }
      }

      // Filter by expiry if specified
      if (expiryFilter && expiryLabel !== expiryFilter) continue;

      expiryLabels.add(expiryLabel);

      const timeToExpiryYears = timeToExpiry / (365 * 24 * 60 * 60);

      const entry: OptionsChainEntry = {
        strike,
        expiry,
        expiryLabel,
        call: null,
        put: null,
      };

      if (group.call) {
        const premium = Number(group.call.premium) / 1e8;
        const { bid, ask } = this.getBidAsk(premium);
        const delta = this.calculateDelta('call', strike, spotPrice, timeToExpiryYears);

        entry.call = {
          optionId: group.call.id,
          bid,
          ask,
          premium,
          delta,
          iv: this.config.baseIV * 100,
        };
      }

      if (group.put) {
        const premium = Number(group.put.premium) / 1e8;
        const { bid, ask } = this.getBidAsk(premium);
        const delta = this.calculateDelta('put', strike, spotPrice, timeToExpiryYears);

        entry.put = {
          optionId: group.put.id,
          bid,
          ask,
          premium,
          delta,
          iv: this.config.baseIV * 100,
        };
      }

      chain.push(entry);
    }

    // Sort by strike price
    chain.sort((a, b) => a.strike - b.strike);

    return {
      underlying: 'ETH/USD',
      spotPrice,
      timestamp: Date.now(),
      expiries: Array.from(expiryLabels),
      chain,
    };
  }

  /**
   * Check if options need refreshing (new expiries, price moved significantly)
   */
  async needsRefresh(): Promise<boolean> {
    if (!this.initialized) return true;

    const priceData = await this.pythClient.getEthUsdPrice();
    const spotPrice = priceData.price;

    // Check if spot price has moved more than 5% from initial strikes
    const options = this.orderBook.getAvailableOptions();
    const protocolOptions = options.filter(o => o.writer === this.protocolAddress);

    if (protocolOptions.length === 0) return true;

    // Get average strike
    const avgStrike = protocolOptions.reduce((sum, o) =>
      sum + Number(o.strikePrice) / 1e8, 0) / protocolOptions.length;

    const priceDiff = Math.abs(spotPrice - avgStrike) / avgStrike;
    return priceDiff > 0.1; // Refresh if price moved more than 10%
  }

  /**
   * Standard normal CDF (Cumulative Distribution Function)
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }
}

// Export for easy access
export { DEFAULT_CONFIG as PROTOCOL_OPTIONS_CONFIG };
