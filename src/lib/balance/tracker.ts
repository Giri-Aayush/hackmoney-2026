/**
 * Trading Balance Tracker
 *
 * Tracks virtual trading balances per user.
 * Balances are initialized from on-chain deposits and updated during trades.
 * Now persists to Supabase for data durability.
 */

import { Address } from 'viem';
import { supabase } from '../db/client.js';

export interface BalanceEntry {
  available: number;  // Available for trading
  locked: number;     // Locked in options (as writer collateral)
  totalDeposited: number;
  totalWithdrawn: number;
  lastUpdated: number;
}

export class BalanceTracker {
  private balances: Map<string, BalanceEntry> = new Map();
  private defaultBalance = 0; // No fake balance - must deposit first
  private loadedFromDb: Set<string> = new Set(); // Track which addresses we've loaded

  /**
   * Get or create a balance entry for a user (sync version for internal use)
   */
  private getEntrySync(address: Address): BalanceEntry {
    const normalized = address.toLowerCase();
    let entry = this.balances.get(normalized);
    if (!entry) {
      entry = {
        available: this.defaultBalance,
        locked: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        lastUpdated: Date.now(),
      };
      this.balances.set(normalized, entry);
    }
    return entry;
  }

  /**
   * Load balance from Supabase if not already loaded
   */
  private async loadFromDb(address: Address): Promise<void> {
    const normalized = address.toLowerCase();

    // Skip if already loaded from DB
    if (this.loadedFromDb.has(normalized)) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('balance, total_deposited, total_withdrawn')
        .eq('wallet_address', normalized)
        .single();

      if (data && !error) {
        const entry: BalanceEntry = {
          available: Number(data.balance) || 0,
          locked: 0, // Locked amounts are calculated from open positions
          totalDeposited: Number(data.total_deposited) || 0,
          totalWithdrawn: Number(data.total_withdrawn) || 0,
          lastUpdated: Date.now(),
        };
        this.balances.set(normalized, entry);
        console.log(`[Balance] Loaded from DB: ${normalized.slice(0, 10)}... available: $${entry.available.toFixed(2)}`);
      }
      this.loadedFromDb.add(normalized);
    } catch (err) {
      console.error(`[Balance] Error loading from DB:`, err);
      this.loadedFromDb.add(normalized); // Mark as loaded to avoid retrying
    }
  }

  /**
   * Persist balance to Supabase
   */
  private async persistToDb(address: Address, entry: BalanceEntry): Promise<void> {
    const normalized = address.toLowerCase();

    try {
      const { error } = await supabase
        .from('users')
        .upsert({
          wallet_address: normalized,
          balance: entry.available,
          total_deposited: entry.totalDeposited,
          total_withdrawn: entry.totalWithdrawn,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' });

      if (error) {
        console.error(`[Balance] Error persisting to DB:`, error);
      } else {
        console.log(`[Balance] Persisted to DB: ${normalized.slice(0, 10)}... available: $${entry.available.toFixed(2)}`);
      }
    } catch (err) {
      console.error(`[Balance] Error persisting to DB:`, err);
    }
  }

  /**
   * Get user's trading balance (async - loads from DB if needed)
   */
  async getBalanceAsync(address: Address): Promise<BalanceEntry> {
    await this.loadFromDb(address);
    return { ...this.getEntrySync(address) };
  }

  /**
   * Get user's trading balance (sync version - uses cached data only)
   */
  getBalance(address: Address): BalanceEntry {
    return { ...this.getEntrySync(address) };
  }

  /**
   * Initialize or add to balance from on-chain deposit
   */
  deposit(address: Address, amount: number): BalanceEntry {
    const entry = this.getEntrySync(address);
    entry.available += amount;
    entry.totalDeposited += amount;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Deposit: ${address.slice(0, 10)}... +$${amount.toFixed(2)} (available: $${entry.available.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(address, entry).catch(console.error);

    return { ...entry };
  }

  /**
   * Withdraw from trading balance
   */
  withdraw(address: Address, amount: number): { success: boolean; entry: BalanceEntry } {
    const entry = this.getEntrySync(address);
    if (amount > entry.available) {
      console.log(`[Balance] Withdraw failed: ${address.slice(0, 10)}... needs $${amount.toFixed(2)}, has $${entry.available.toFixed(2)}`);
      return { success: false, entry: { ...entry } };
    }
    entry.available -= amount;
    entry.totalWithdrawn += amount;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Withdraw: ${address.slice(0, 10)}... -$${amount.toFixed(2)} (available: $${entry.available.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(address, entry).catch(console.error);

    return { success: true, entry: { ...entry } };
  }

  /**
   * Deduct premium from buyer when purchasing an option
   */
  deductPremium(buyer: Address, premium: number): { success: boolean; newBalance: number } {
    const entry = this.getEntrySync(buyer);
    if (premium > entry.available) {
      console.log(`[Balance] Purchase failed: ${buyer.slice(0, 10)}... needs $${premium.toFixed(2)}, has $${entry.available.toFixed(2)}`);
      return { success: false, newBalance: entry.available };
    }
    entry.available -= premium;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Premium deducted: ${buyer.slice(0, 10)}... -$${premium.toFixed(2)} (available: $${entry.available.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(buyer, entry).catch(console.error);

    return { success: true, newBalance: entry.available };
  }

  /**
   * Credit premium to writer when their option is sold
   */
  creditPremium(writer: Address, premium: number): number {
    const entry = this.getEntrySync(writer);
    entry.available += premium;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Premium credited: ${writer.slice(0, 10)}... +$${premium.toFixed(2)} (available: $${entry.available.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(writer, entry).catch(console.error);

    return entry.available;
  }

  /**
   * Lock collateral when writing an option
   */
  lockCollateral(writer: Address, amount: number): { success: boolean; newBalance: number } {
    const entry = this.getEntrySync(writer);
    if (amount > entry.available) {
      return { success: false, newBalance: entry.available };
    }
    entry.available -= amount;
    entry.locked += amount;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Collateral locked: ${writer.slice(0, 10)}... $${amount.toFixed(2)} (available: $${entry.available.toFixed(2)}, locked: $${entry.locked.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(writer, entry).catch(console.error);

    return { success: true, newBalance: entry.available };
  }

  /**
   * Release collateral when option expires/is exercised
   */
  releaseCollateral(writer: Address, amount: number, payout: number = 0): number {
    const entry = this.getEntrySync(writer);
    const actualRelease = Math.min(amount, entry.locked);
    entry.locked -= actualRelease;
    // Add back collateral minus any payout to the option holder
    const netReturn = Math.max(0, actualRelease - payout);
    entry.available += netReturn;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Collateral released: ${writer.slice(0, 10)}... +$${netReturn.toFixed(2)} (available: $${entry.available.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(writer, entry).catch(console.error);

    return entry.available;
  }

  /**
   * Credit payout to option holder when exercised
   */
  creditPayout(holder: Address, payout: number): number {
    const entry = this.getEntrySync(holder);
    entry.available += payout;
    entry.lastUpdated = Date.now();
    console.log(`[Balance] Payout credited: ${holder.slice(0, 10)}... +$${payout.toFixed(2)} (available: $${entry.available.toFixed(2)})`);

    // Persist to database asynchronously
    this.persistToDb(holder, entry).catch(console.error);

    return entry.available;
  }

  /**
   * Check if user has sufficient balance for a purchase
   */
  hasSufficientBalance(address: Address, amount: number): boolean {
    const entry = this.getEntrySync(address);
    return entry.available >= amount;
  }

  /**
   * Check if user has sufficient balance (async - loads from DB if needed)
   */
  async hasSufficientBalanceAsync(address: Address, amount: number): Promise<boolean> {
    await this.loadFromDb(address);
    const entry = this.getEntrySync(address);
    return entry.available >= amount;
  }

  /**
   * Get all balances (for debugging/admin)
   */
  getAllBalances(): Map<string, BalanceEntry> {
    return new Map(this.balances);
  }

  /**
   * Reset a user's balance (for debugging/testing)
   */
  resetBalance(address: Address): void {
    const normalized = address.toLowerCase();
    this.balances.delete(normalized);
    this.loadedFromDb.delete(normalized);
    console.log(`[Balance] Reset balance for ${address.slice(0, 10)}...`);

    // Reset in database asynchronously
    supabase
      .from('users')
      .update({ balance: 0, total_deposited: 0, total_withdrawn: 0 })
      .eq('wallet_address', normalized)
      .then((result: { error: unknown }) => {
        if (result.error) console.error(`[Balance] Error resetting in DB:`, result.error);
      })
      .catch(console.error);
  }

  /**
   * Set a user's balance directly (for syncing with on-chain state)
   */
  setBalance(address: Address, amount: number): BalanceEntry {
    const normalized = address.toLowerCase();
    const entry: BalanceEntry = {
      available: amount,
      locked: 0,
      totalDeposited: amount,
      totalWithdrawn: 0,
      lastUpdated: Date.now(),
    };
    this.balances.set(normalized, entry);
    this.loadedFromDb.add(normalized);
    console.log(`[Balance] Set balance for ${address.slice(0, 10)}... to $${amount.toFixed(2)}`);

    // Persist to database asynchronously
    this.persistToDb(address, entry).catch(console.error);

    return { ...entry };
  }

  /**
   * Load all balances from database (call on server startup)
   */
  async loadAllFromDb(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('wallet_address, balance, total_deposited, total_withdrawn');

      if (error) {
        console.error('[Balance] Error loading all balances from DB:', error);
        return 0;
      }

      if (data) {
        for (const row of data) {
          const normalized = row.wallet_address.toLowerCase();
          const entry: BalanceEntry = {
            available: Number(row.balance) || 0,
            locked: 0,
            totalDeposited: Number(row.total_deposited) || 0,
            totalWithdrawn: Number(row.total_withdrawn) || 0,
            lastUpdated: Date.now(),
          };
          this.balances.set(normalized, entry);
          this.loadedFromDb.add(normalized);
        }
        console.log(`[Balance] Loaded ${data.length} balances from database`);
        return data.length;
      }

      return 0;
    } catch (err) {
      console.error('[Balance] Error loading all balances from DB:', err);
      return 0;
    }
  }
}

// Singleton instance
export const balanceTracker = new BalanceTracker();
