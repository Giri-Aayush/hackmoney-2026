import { supabase, DbOption, DbPosition, DbTrade, DbUser } from './client.js';
import { Option, OptionType, OptionStatus, CreateOptionParams } from '../options/types.js';
import { Hex, Address } from 'viem';

/**
 * Database Service
 * Handles all database operations for OptiChannel
 */
export class DatabaseService {
  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  async getOrCreateUser(walletAddress: string): Promise<DbUser> {
    const normalized = walletAddress.toLowerCase();

    // Try to get existing user
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', normalized)
      .single();

    if (existing) return existing;

    // Create new user with default balance
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ wallet_address: normalized, balance: 10000 })
      .select()
      .single();

    if (error) throw new Error(`Failed to create user: ${error.message}`);
    return newUser!;
  }

  async getUserBalance(walletAddress: string): Promise<number> {
    const user = await this.getOrCreateUser(walletAddress);
    return user.balance;
  }

  async updateUserBalance(walletAddress: string, amount: number): Promise<number> {
    const normalized = walletAddress.toLowerCase();

    const { data, error } = await supabase
      .from('users')
      .update({ balance: amount })
      .eq('wallet_address', normalized)
      .select('balance')
      .single();

    if (error) throw new Error(`Failed to update balance: ${error.message}`);
    return data!.balance;
  }

  async deposit(walletAddress: string, amount: number, txHash: string): Promise<number> {
    const normalized = walletAddress.toLowerCase();
    const user = await this.getOrCreateUser(walletAddress);
    const newBalance = user.balance + amount;

    // Record deposit
    await supabase.from('deposits').insert({
      user_address: normalized,
      amount,
      token: 'USDC',
      tx_hash: txHash,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    });

    // Update balance
    await supabase
      .from('users')
      .update({
        balance: newBalance,
        total_deposited: user.total_deposited + amount,
      })
      .eq('wallet_address', normalized);

    return newBalance;
  }

  async withdraw(walletAddress: string, amount: number): Promise<{ success: boolean; withdrawalId?: string }> {
    const normalized = walletAddress.toLowerCase();
    const user = await this.getOrCreateUser(walletAddress);

    if (user.balance < amount) {
      return { success: false };
    }

    // Create withdrawal request
    const { data: withdrawal, error } = await supabase
      .from('withdrawals')
      .insert({
        user_address: normalized,
        amount,
        token: 'USDC',
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create withdrawal: ${error.message}`);

    // Deduct balance
    await supabase
      .from('users')
      .update({
        balance: user.balance - amount,
        total_withdrawn: user.total_withdrawn + amount,
      })
      .eq('wallet_address', normalized);

    return { success: true, withdrawalId: withdrawal!.id };
  }

  // ============================================================================
  // OPTIONS OPERATIONS
  // ============================================================================

  async createOption(writerAddress: string, params: CreateOptionParams): Promise<DbOption> {
    const expiry = new Date(Date.now() + params.expiryMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('options')
      .insert({
        writer_address: writerAddress.toLowerCase(),
        underlying: params.underlying,
        strike_price: params.strikePrice,
        premium: params.premium,
        amount: params.amount,
        option_type: params.optionType,
        expiry,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create option: ${error.message}`);
    return data!;
  }

  async getOption(optionId: string): Promise<DbOption | null> {
    const { data } = await supabase
      .from('options')
      .select('*')
      .eq('id', optionId)
      .single();

    return data;
  }

  async getOpenOptions(filters?: {
    optionType?: OptionType;
    minStrike?: number;
    maxStrike?: number;
  }): Promise<DbOption[]> {
    let query = supabase
      .from('options')
      .select('*')
      .eq('status', 'open')
      .is('holder_address', null);

    if (filters?.optionType) {
      query = query.eq('option_type', filters.optionType);
    }
    if (filters?.minStrike) {
      query = query.gte('strike_price', filters.minStrike);
    }
    if (filters?.maxStrike) {
      query = query.lte('strike_price', filters.maxStrike);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch options: ${error.message}`);
    return data || [];
  }

  async getCallOptions(): Promise<DbOption[]> {
    return this.getOpenOptions({ optionType: 'call' });
  }

  async getPutOptions(): Promise<DbOption[]> {
    return this.getOpenOptions({ optionType: 'put' });
  }

  async buyOption(optionId: string, buyerAddress: string): Promise<DbOption> {
    const normalized = buyerAddress.toLowerCase();
    const option = await this.getOption(optionId);

    if (!option) throw new Error('Option not found');
    if (option.holder_address) throw new Error('Option already sold');
    if (option.status !== 'open') throw new Error('Option not available');

    // Check buyer balance
    const buyer = await this.getOrCreateUser(buyerAddress);
    if (buyer.balance < option.premium) {
      throw new Error('Insufficient balance');
    }

    // Update option
    const { data: updatedOption, error } = await supabase
      .from('options')
      .update({ holder_address: normalized })
      .eq('id', optionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to buy option: ${error.message}`);

    // Record trade
    await supabase.from('trades').insert({
      option_id: optionId,
      buyer_address: normalized,
      seller_address: option.writer_address,
      premium: option.premium,
      size: option.amount,
    });

    // Transfer premium: buyer -> writer
    await supabase
      .from('users')
      .update({ balance: buyer.balance - option.premium })
      .eq('wallet_address', normalized);

    const writer = await this.getOrCreateUser(option.writer_address);
    await supabase
      .from('users')
      .update({ balance: writer.balance + option.premium })
      .eq('wallet_address', option.writer_address);

    return updatedOption!;
  }

  async exerciseOption(
    optionId: string,
    holderAddress: string,
    settlementPrice: number
  ): Promise<{ payout: number; settlementId: string }> {
    const normalized = holderAddress.toLowerCase();
    const option = await this.getOption(optionId);

    if (!option) throw new Error('Option not found');
    if (option.holder_address !== normalized) throw new Error('Not option holder');
    if (option.status !== 'open') throw new Error('Option not exercisable');

    const expiry = new Date(option.expiry);
    if (expiry > new Date()) throw new Error('Option not yet expired');

    // Calculate payout
    let payout = 0;
    if (option.option_type === 'call') {
      payout = Math.max(0, (settlementPrice - option.strike_price) * option.amount);
    } else {
      payout = Math.max(0, (option.strike_price - settlementPrice) * option.amount);
    }

    // Update option
    await supabase
      .from('options')
      .update({
        status: 'exercised',
        settlement_price: settlementPrice,
        exercised_at: new Date().toISOString(),
      })
      .eq('id', optionId);

    // Record settlement
    const { data: settlement, error } = await supabase
      .from('settlements')
      .insert({
        option_id: optionId,
        settlement_price: settlementPrice,
        payout,
        winner_address: payout > 0 ? normalized : option.writer_address,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create settlement: ${error.message}`);

    // Transfer payout
    if (payout > 0) {
      const holder = await this.getOrCreateUser(holderAddress);
      await supabase
        .from('users')
        .update({ balance: holder.balance + payout })
        .eq('wallet_address', normalized);
    }

    return { payout, settlementId: settlement!.id };
  }

  // ============================================================================
  // POSITIONS OPERATIONS
  // ============================================================================

  async openPosition(
    userAddress: string,
    optionId: string,
    side: 'long' | 'short',
    size: number,
    entryPrice: number
  ): Promise<DbPosition> {
    const normalized = userAddress.toLowerCase();

    const { data, error } = await supabase
      .from('positions')
      .insert({
        user_address: normalized,
        option_id: optionId,
        side,
        size,
        entry_price: entryPrice,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to open position: ${error.message}`);
    return data!;
  }

  async closePosition(
    positionId: string,
    userAddress: string,
    exitPrice: number
  ): Promise<{ pnl: number }> {
    const normalized = userAddress.toLowerCase();

    const { data: position } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .eq('user_address', normalized)
      .single();

    if (!position) throw new Error('Position not found');
    if (position.status !== 'open') throw new Error('Position already closed');

    const pnl = (exitPrice - position.entry_price) * position.size *
      (position.side === 'long' ? 1 : -1);

    await supabase
      .from('positions')
      .update({
        status: 'closed',
        exit_price: exitPrice,
        realized_pnl: pnl,
        closed_at: new Date().toISOString(),
      })
      .eq('id', positionId);

    // Update user balance with P&L
    const user = await this.getOrCreateUser(userAddress);
    await supabase
      .from('users')
      .update({ balance: user.balance + pnl })
      .eq('wallet_address', normalized);

    return { pnl };
  }

  async getOpenPositions(userAddress: string): Promise<DbPosition[]> {
    const normalized = userAddress.toLowerCase();

    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('user_address', normalized)
      .eq('status', 'open');

    if (error) throw new Error(`Failed to fetch positions: ${error.message}`);
    return data || [];
  }

  // ============================================================================
  // TRADES / HISTORY
  // ============================================================================

  async getRecentTrades(limit = 50): Promise<DbTrade[]> {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch trades: ${error.message}`);
    return data || [];
  }

  async getUserTrades(userAddress: string): Promise<DbTrade[]> {
    const normalized = userAddress.toLowerCase();

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .or(`buyer_address.eq.${normalized},seller_address.eq.${normalized}`)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch user trades: ${error.message}`);
    return data || [];
  }

  // ============================================================================
  // PRICE HISTORY
  // ============================================================================

  async recordPrice(symbol: string, price: number, confidence?: number): Promise<void> {
    const { error } = await supabase
      .from('price_history')
      .insert({
        symbol,
        price,
        confidence,
      });

    if (error) {
      console.error('Failed to record price:', error.message);
    }
  }

  async getPriceHistory(symbol: string, limit = 100): Promise<{ price: number; timestamp: string }[]> {
    const { data, error } = await supabase
      .from('price_history')
      .select('price, timestamp')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to get price history:', error.message);
      return [];
    }

    return (data || []).map((row: { price: number; timestamp: string }) => ({
      price: row.price,
      timestamp: row.timestamp,
    }));
  }

  // ============================================================================
  // STATS
  // ============================================================================

  async getStats(): Promise<{
    totalOptions: number;
    openOptions: number;
    totalTrades: number;
    totalVolume: number;
  }> {
    const [optionsResult, tradesResult] = await Promise.all([
      supabase.from('options').select('id, status', { count: 'exact' }),
      supabase.from('trades').select('premium', { count: 'exact' }),
    ]);

    const totalOptions = optionsResult.count || 0;
    const openOptions = optionsResult.data?.filter((o: { status: string }) => o.status === 'open').length || 0;
    const totalTrades = tradesResult.count || 0;
    const totalVolume = tradesResult.data?.reduce((sum: number, t: { premium?: number }) => sum + (t.premium || 0), 0) || 0;

    return { totalOptions, openOptions, totalTrades, totalVolume };
  }
}

// Singleton instance
export const db = new DatabaseService();
