import { Address, Hex } from 'viem';
import { Option, OptionType, CreateOptionParams, OptionStatus } from './types.js';
import { OptionsEngine } from './engine.js';
import { PythClient } from '../pyth/index.js';
import { OptionsMarket } from './market.js';
import { supabase } from '../db/client.js';

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
  private market: OptionsMarket | null;
  private loadedFromDb = false;

  constructor(pythClient?: PythClient, market?: OptionsMarket) {
    this.pythClient = pythClient || new PythClient();
    this.market = market || null;
  }

  /**
   * Load all options from database (call on startup)
   */
  async loadFromDb(): Promise<number> {
    if (this.loadedFromDb) return 0;

    try {
      const { data, error } = await supabase
        .from('options')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[OrderBook] Error loading options from DB:', error);
        return 0;
      }

      if (data) {
        for (const row of data) {
          const option: Option = {
            id: row.id as Hex,
            underlying: row.underlying,
            strikePrice: BigInt(Math.round(Number(row.strike_price) * 1e8)),
            premium: BigInt(Math.round(Number(row.premium) * 1e8)),
            expiry: Math.floor(new Date(row.expiry).getTime() / 1000),
            optionType: row.option_type as OptionType,
            amount: BigInt(Math.round(Number(row.amount) * 1e18)),
            writer: row.writer_address as Address,
            holder: row.holder_address as Address | null,
            status: row.status as OptionStatus,
            createdAt: Math.floor(new Date(row.created_at).getTime() / 1000),
          };

          const isActive = option.status === 'open' && option.holder === null;
          this.listings.set(option.id, {
            option,
            listedAt: option.createdAt,
            isActive,
          });
        }
        console.log(`[OrderBook] Loaded ${data.length} options from database`);
      }

      this.loadedFromDb = true;
      return data?.length || 0;
    } catch (err) {
      console.error('[OrderBook] Error loading options from DB:', err);
      return 0;
    }
  }

  /**
   * Persist option to database
   */
  private async persistOption(option: Option): Promise<void> {
    try {
      const { error } = await supabase
        .from('options')
        .upsert({
          id: option.id,
          writer_address: option.writer.toLowerCase(),
          holder_address: option.holder?.toLowerCase() || null,
          underlying: option.underlying,
          strike_price: Number(option.strikePrice) / 1e8,
          premium: Number(option.premium) / 1e8,
          amount: Number(option.amount) / 1e18,
          option_type: option.optionType,
          expiry: new Date(option.expiry * 1000).toISOString(),
          status: option.status,
          created_at: new Date(option.createdAt * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (error) {
        console.error('[OrderBook] Error persisting option:', error);
      } else {
        console.log(`[OrderBook] Persisted option ${option.id.slice(0, 10)}... to DB`);
      }
    } catch (err) {
      console.error('[OrderBook] Error persisting option:', err);
    }
  }

  /**
   * Record trade in database
   */
  private async recordTrade(option: Option, buyer: Address): Promise<void> {
    try {
      const { error } = await supabase
        .from('trades')
        .insert({
          option_id: option.id,
          buyer_address: buyer.toLowerCase(),
          seller_address: option.writer.toLowerCase(),
          premium: Number(option.premium) / 1e8,
          size: Number(option.amount) / 1e18,
        });

      if (error) {
        console.error('[OrderBook] Error recording trade:', error);
      }
    } catch (err) {
      console.error('[OrderBook] Error recording trade:', err);
    }
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

    // Track open interest when option is listed
    if (this.market) {
      const strike = Number(option.strikePrice) / 1e8;
      const premium = Number(option.premium) / 1e8;
      this.market.updateOpenInterest(strike, option.expiry, option.optionType, 1, premium);
    }

    // Persist to database asynchronously
    this.persistOption(option).catch(console.error);

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
    listing.option = option; // Update the listing with the bought option

    // Record trade in market tracker
    if (this.market) {
      const premium = Number(option.premium) / 1e8;
      const amount = Number(option.amount) / 1e18;
      this.market.recordTrade({
        optionId,
        buyer,
        seller: option.writer,
        price: premium,
        size: amount,
        side: 'buy',
      });
    }

    // Persist option update and record trade in database
    this.persistOption(option).catch(console.error);
    this.recordTrade(option, buyer).catch(console.error);

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

    const result = await engine.exerciseOption(optionId, holder);

    // Update option status in listing
    listing.option.status = 'exercised';
    listing.isActive = false;

    // Persist exercised option to database
    this.persistOption(listing.option).catch(console.error);

    return result;
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
