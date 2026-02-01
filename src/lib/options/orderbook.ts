import { Address, Hex } from 'viem';
import { Option, OptionType, CreateOptionParams } from './types.js';
import { OptionsEngine } from './engine.js';
import { PythClient } from '../pyth/index.js';

export interface ListedOption {
  option: Option;
  listedAt: number;
  isActive: boolean;
}

export interface OrderBookStats {
  totalListings: number;
  activeListings: number;
  totalVolume: number;
  calls: number;
  puts: number;
}

export class OptionsOrderBook {
  private listings: Map<Hex, ListedOption> = new Map();
  private enginesByWriter: Map<Address, OptionsEngine> = new Map();
  private pythClient: PythClient;

  constructor(pythClient?: PythClient) {
    this.pythClient = pythClient || new PythClient();
  }

  private getOrCreateEngine(writer: Address): OptionsEngine {
    let engine = this.enginesByWriter.get(writer);
    if (!engine) {
      engine = new OptionsEngine(writer, this.pythClient);
      this.enginesByWriter.set(writer, engine);
    }
    return engine;
  }

  async listOption(writer: Address, params: CreateOptionParams): Promise<Option> {
    const engine = this.getOrCreateEngine(writer);
    const option = await engine.createOption(params);

    this.listings.set(option.id, {
      option,
      listedAt: Math.floor(Date.now() / 1000),
      isActive: true,
    });

    console.log(`[OrderBook] Option listed: ${option.id.slice(0, 10)}... by ${writer.slice(0, 10)}...`);
    return option;
  }

  async buyOption(optionId: Hex, buyer: Address): Promise<Option> {
    const listing = this.listings.get(optionId);
    if (!listing) {
      throw new Error(`Option ${optionId} not found in order book`);
    }

    if (!listing.isActive) {
      throw new Error(`Option ${optionId} is no longer available`);
    }

    if (listing.option.holder !== null) {
      throw new Error(`Option ${optionId} already sold`);
    }

    const engine = this.enginesByWriter.get(listing.option.writer);
    if (!engine) {
      throw new Error(`Engine not found for writer ${listing.option.writer}`);
    }

    const option = await engine.buyOption(optionId, buyer);
    listing.isActive = false;

    console.log(`[OrderBook] Option ${optionId.slice(0, 10)}... bought by ${buyer.slice(0, 10)}...`);
    return option;
  }

  getAvailableOptions(filters?: {
    optionType?: OptionType;
    underlying?: string;
    minStrike?: number;
    maxStrike?: number;
    minExpiry?: number;
    maxExpiry?: number;
  }): Option[] {
    const now = Math.floor(Date.now() / 1000);
    let options = Array.from(this.listings.values())
      .filter(l => l.isActive && l.option.holder === null && l.option.expiry > now)
      .map(l => l.option);

    if (filters) {
      if (filters.optionType) {
        options = options.filter(o => o.optionType === filters.optionType);
      }
      if (filters.underlying) {
        options = options.filter(o => o.underlying === filters.underlying);
      }
      if (filters.minStrike !== undefined) {
        const minScaled = BigInt(Math.round(filters.minStrike * 1e8));
        options = options.filter(o => o.strikePrice >= minScaled);
      }
      if (filters.maxStrike !== undefined) {
        const maxScaled = BigInt(Math.round(filters.maxStrike * 1e8));
        options = options.filter(o => o.strikePrice <= maxScaled);
      }
      if (filters.minExpiry !== undefined) {
        options = options.filter(o => o.expiry >= filters.minExpiry!);
      }
      if (filters.maxExpiry !== undefined) {
        options = options.filter(o => o.expiry <= filters.maxExpiry!);
      }
    }

    return options.sort((a, b) => Number(a.premium - b.premium));
  }

  getCallOptions(): Option[] {
    return this.getAvailableOptions({ optionType: 'call' });
  }

  getPutOptions(): Option[] {
    return this.getAvailableOptions({ optionType: 'put' });
  }

  getOptionById(optionId: Hex): Option | undefined {
    return this.listings.get(optionId)?.option;
  }

  getOptionsByWriter(writer: Address): Option[] {
    return Array.from(this.listings.values())
      .filter(l => l.option.writer === writer)
      .map(l => l.option);
  }

  getOptionsByHolder(holder: Address): Option[] {
    return Array.from(this.listings.values())
      .filter(l => l.option.holder === holder)
      .map(l => l.option);
  }

  getStats(): OrderBookStats {
    const all = Array.from(this.listings.values());
    const active = all.filter(l => l.isActive && l.option.holder === null);

    return {
      totalListings: all.length,
      activeListings: active.length,
      totalVolume: all.filter(l => l.option.holder !== null).length,
      calls: active.filter(l => l.option.optionType === 'call').length,
      puts: active.filter(l => l.option.optionType === 'put').length,
    };
  }

  async exerciseOption(optionId: Hex, holder: Address): Promise<{ payout: number }> {
    const listing = this.listings.get(optionId);
    if (!listing) {
      throw new Error(`Option ${optionId} not found`);
    }

    const engine = this.enginesByWriter.get(listing.option.writer);
    if (!engine) {
      throw new Error(`Engine not found for writer ${listing.option.writer}`);
    }

    return engine.exerciseOption(optionId, holder);
  }

  cancelListing(optionId: Hex, writer: Address): void {
    const listing = this.listings.get(optionId);
    if (!listing) {
      throw new Error(`Option ${optionId} not found`);
    }

    if (listing.option.writer !== writer) {
      throw new Error(`Only the writer can cancel this listing`);
    }

    if (listing.option.holder !== null) {
      throw new Error(`Cannot cancel - option already sold`);
    }

    listing.isActive = false;
    console.log(`[OrderBook] Listing ${optionId.slice(0, 10)}... cancelled`);
  }
}
