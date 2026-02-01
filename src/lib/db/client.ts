import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';

// Database types
export interface DbUser {
  id: string;
  wallet_address: string;
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
}

export interface DbOption {
  id: string;
  writer_address: string;
  holder_address: string | null;
  underlying: string;
  strike_price: number;
  premium: number;
  amount: number;
  option_type: 'call' | 'put';
  expiry: string;
  status: 'open' | 'exercised' | 'expired' | 'cancelled';
  settlement_price: number | null;
  settlement_tx_hash: string | null;
  created_at: string;
  exercised_at: string | null;
  updated_at: string;
}

export interface DbTrade {
  id: string;
  option_id: string;
  buyer_address: string;
  seller_address: string;
  premium: number;
  size: number;
  tx_hash: string | null;
  created_at: string;
}

export interface DbPosition {
  id: string;
  user_address: string;
  option_id: string;
  side: 'long' | 'short';
  size: number;
  entry_price: number;
  exit_price: number | null;
  realized_pnl: number | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface DbDeposit {
  id: string;
  user_address: string;
  amount: number;
  token: string;
  tx_hash: string;
  block_number: number | null;
  status: 'pending' | 'confirmed' | 'failed';
  created_at: string;
  confirmed_at: string | null;
}

export interface DbWithdrawal {
  id: string;
  user_address: string;
  amount: number;
  token: string;
  tx_hash: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export interface DbSettlement {
  id: string;
  option_id: string;
  settlement_price: number;
  payout: number;
  winner_address: string;
  tx_hash: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

// Singleton Supabase client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClient: any = null;

export function getSupabase() {
  if (!supabaseClient) {
    const url = config.supabase.url;
    const key = config.supabase.serviceKey || config.supabase.anonKey;

    if (!url || !key) {
      throw new Error('Supabase URL and key are required. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    }

    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// Export for direct use - lazy initialization with any type for flexibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: { from: (table: string) => any } = {
  from: (table: string) => getSupabase().from(table),
};
