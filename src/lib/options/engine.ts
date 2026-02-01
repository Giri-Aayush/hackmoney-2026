import { keccak256, toHex, Address, Hex } from 'viem';
import { PythClient } from '../pyth/index.js';
import {
  Option,
  OptionType,
  OptionStatus,
  CreateOptionParams,
  OptionQuote,
} from './types.js';

// Scaling factors
const PRICE_SCALE = 10n ** 8n;  // 8 decimals for USD prices
const AMOUNT_SCALE = 10n ** 18n; // 18 decimals for amounts

export class OptionsEngine {
  private options: Map<Hex, Option> = new Map();
  private pythClient: PythClient;
  private writerAddress: Address;

  constructor(writerAddress: Address, pythClient?: PythClient) {
    this.writerAddress = writerAddress;
    this.pythClient = pythClient || new PythClient();
  }

  /**
   * Generates a unique option ID based on parameters.
   */
  private generateOptionId(params: CreateOptionParams, timestamp: number): Hex {
    const data = `${this.writerAddress}-${params.underlying}-${params.strikePrice}-${params.expiryMinutes}-${timestamp}-${Math.random()}`;
    return keccak256(toHex(data));
  }

  /**
   * Converts human-readable price to scaled bigint.
   */
  private toScaledPrice(price: number): bigint {
    return BigInt(Math.round(price * Number(PRICE_SCALE)));
  }

  /**
   * Converts scaled bigint to human-readable price.
   */
  private fromScaledPrice(scaled: bigint): number {
    return Number(scaled) / Number(PRICE_SCALE);
  }

  /**
   * Converts human-readable amount to scaled bigint.
   */
  private toScaledAmount(amount: number): bigint {
    return BigInt(Math.round(amount * Number(AMOUNT_SCALE)));
  }

  /**
   * Converts scaled bigint to human-readable amount.
   */
  private fromScaledAmount(scaled: bigint): number {
    return Number(scaled) / Number(AMOUNT_SCALE);
  }

  /**
   * Creates a new option.
   */
  async createOption(params: CreateOptionParams): Promise<Option> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + params.expiryMinutes * 60;

    const option: Option = {
      id: this.generateOptionId(params, now),
      writer: this.writerAddress,
      holder: null,
      underlying: params.underlying,
      strikePrice: this.toScaledPrice(params.strikePrice),
      premium: this.toScaledPrice(params.premium),
      expiry,
      optionType: params.optionType,
      amount: this.toScaledAmount(params.amount),
      status: 'open',
      createdAt: now,
    };

    this.options.set(option.id, option);

    console.log(`[Options] Created ${params.optionType.toUpperCase()} option:`);
    console.log(`  ID: ${option.id.slice(0, 10)}...`);
    console.log(`  Strike: $${params.strikePrice}`);
    console.log(`  Premium: $${params.premium}`);
    console.log(`  Amount: ${params.amount} ${params.underlying}`);
    console.log(`  Expiry: ${new Date(expiry * 1000).toISOString()}`);

    return option;
  }

  /**
   * Buys an option (marks it as sold to a holder).
   */
  async buyOption(optionId: Hex, buyer: Address): Promise<Option> {
    const option = this.options.get(optionId);

    if (!option) {
      throw new Error(`Option ${optionId} not found`);
    }

    if (option.status !== 'open') {
      throw new Error(`Option ${optionId} is not available (status: ${option.status})`);
    }

    if (option.holder !== null) {
      throw new Error(`Option ${optionId} already has a holder`);
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= option.expiry) {
      option.status = 'expired';
      throw new Error(`Option ${optionId} has expired`);
    }

    option.holder = buyer;

    console.log(`[Options] Option ${optionId.slice(0, 10)}... bought by ${buyer}`);

    return option;
  }

  /**
   * Exercises an option at the current market price.
   */
  async exerciseOption(optionId: Hex, exerciser: Address): Promise<{ option: Option; payout: number }> {
    const option = this.options.get(optionId);

    if (!option) {
      throw new Error(`Option ${optionId} not found`);
    }

    if (option.holder !== exerciser) {
      throw new Error(`Only the option holder can exercise`);
    }

    if (option.status !== 'open') {
      throw new Error(`Option ${optionId} cannot be exercised (status: ${option.status})`);
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= option.expiry) {
      option.status = 'expired';
      throw new Error(`Option ${optionId} has expired`);
    }

    // Get current price from Pyth
    const priceData = await this.pythClient.getEthUsdPrice();
    const currentPrice = this.toScaledPrice(priceData.price);

    // Calculate payout
    let payout = 0n;
    const strikePrice = option.strikePrice;
    const amount = option.amount;

    if (option.optionType === 'call') {
      // Call: payout if current price > strike price
      if (currentPrice > strikePrice) {
        // Payout = (currentPrice - strikePrice) * amount / AMOUNT_SCALE
        payout = ((currentPrice - strikePrice) * amount) / AMOUNT_SCALE;
      }
    } else {
      // Put: payout if current price < strike price
      if (currentPrice < strikePrice) {
        // Payout = (strikePrice - currentPrice) * amount / AMOUNT_SCALE
        payout = ((strikePrice - currentPrice) * amount) / AMOUNT_SCALE;
      }
    }

    option.status = 'exercised';
    option.exercisedAt = now;
    option.settlementPrice = currentPrice;

    const payoutNum = this.fromScaledPrice(payout);

    console.log(`[Options] Option ${optionId.slice(0, 10)}... exercised:`);
    console.log(`  Settlement price: $${priceData.price.toFixed(2)}`);
    console.log(`  Payout: $${payoutNum.toFixed(2)}`);

    return { option, payout: payoutNum };
  }

  /**
   * Gets a quote for an option showing current value.
   */
  async getOptionQuote(optionId: Hex): Promise<OptionQuote> {
    const option = this.options.get(optionId);

    if (!option) {
      throw new Error(`Option ${optionId} not found`);
    }

    const priceData = await this.pythClient.getEthUsdPrice();
    const currentPrice = priceData.price;
    const strikePrice = this.fromScaledPrice(option.strikePrice);
    const premium = this.fromScaledPrice(option.premium);
    const amount = this.fromScaledAmount(option.amount);

    let intrinsicValue = 0;
    let breakeven: number;
    let maxProfit: number | 'unlimited';
    let maxLoss: number;

    if (option.optionType === 'call') {
      // Call option
      intrinsicValue = Math.max(0, (currentPrice - strikePrice) * amount);
      breakeven = strikePrice + premium / amount;
      maxProfit = 'unlimited';
      maxLoss = premium;
    } else {
      // Put option
      intrinsicValue = Math.max(0, (strikePrice - currentPrice) * amount);
      breakeven = strikePrice - premium / amount;
      maxProfit = (strikePrice * amount) - premium; // Max if price goes to 0
      maxLoss = premium;
    }

    // Time value = total value - intrinsic value (simplified)
    const timeValue = Math.max(0, premium - intrinsicValue);

    return {
      option,
      currentPrice,
      intrinsicValue,
      timeValue,
      breakeven,
      maxProfit,
      maxLoss,
    };
  }

  /**
   * Gets all options.
   */
  getAllOptions(): Option[] {
    return Array.from(this.options.values());
  }

  /**
   * Gets options by status.
   */
  getOptionsByStatus(status: OptionStatus): Option[] {
    return this.getAllOptions().filter(o => o.status === status);
  }

  /**
   * Gets options by writer.
   */
  getOptionsByWriter(writer: Address): Option[] {
    return this.getAllOptions().filter(o => o.writer === writer);
  }

  /**
   * Gets options by holder.
   */
  getOptionsByHolder(holder: Address): Option[] {
    return this.getAllOptions().filter(o => o.holder === holder);
  }

  /**
   * Checks and expires options that have passed their expiry.
   */
  expireOptions(): Option[] {
    const now = Math.floor(Date.now() / 1000);
    const expired: Option[] = [];

    for (const option of this.options.values()) {
      if (option.status === 'open' && now >= option.expiry) {
        option.status = 'expired';
        expired.push(option);
      }
    }

    if (expired.length > 0) {
      console.log(`[Options] Expired ${expired.length} options`);
    }

    return expired;
  }
}
