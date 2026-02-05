const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';

export interface Option {
  id: string;
  type: 'call' | 'put';
  strike: number;
  expiry: number;
  premium: number;
  amount: number;
  writer: string;
  buyer?: string;
  status: 'open' | 'filled' | 'exercised' | 'expired' | 'cancelled';
  underlyingAsset: string;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

export interface PriceData {
  asset: string;
  price: number;
  confidence: number;
  publishTime: number;
  source: string;
}

export interface VolumeStats {
  volume24h: number;
  tradeCount24h: number;
  uniqueTraders24h: number;
}

export interface OpenInterest {
  totalOpenInterest: number;
  byStrike: Array<{
    strike: number;
    calls: number;
    puts: number;
    total: number;
  }>;
}

export interface Trade {
  id: string;
  optionId: string;
  buyer: string;
  seller: string;
  price: number;
  amount: number;
  timestamp: number;
  type: 'buy' | 'sell';
}

export interface StrategyTemplate {
  name: string;
  description: string;
  legs: Array<{
    type: 'call' | 'put';
    position: 'long' | 'short';
    strikeOffset: number;
  }>;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
}

// Binance-style options chain types
export interface OptionsChainEntry {
  strike: number;
  expiry: number;
  expiryLabel: string;
  call: {
    optionId: string;
    bid: number;
    ask: number;
    premium: number;
    delta: number;
    iv: number;
  } | null;
  put: {
    optionId: string;
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

class ApiClient {
  private baseUrl: string;
  private walletAddress: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setWalletAddress(address: string | null) {
    this.walletAddress = address;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.walletAddress) {
      headers['x-wallet-address'] = this.walletAddress;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  // Price endpoints
  async getPrice(): Promise<PriceData> {
    return this.fetch<PriceData>('/api/price');
  }

  // Options endpoints
  async getOptions(): Promise<Option[]> {
    const response = await this.fetch<{ options: Option[] }>('/api/options');
    return response.options;
  }

  async createOption(option: {
    type: 'call' | 'put';
    strike: number;
    expiry: number;
    premium: number;
    amount: number;
  }): Promise<Option> {
    const response = await this.fetch<{ option: Option }>('/api/options', {
      method: 'POST',
      body: JSON.stringify(option),
    });
    return response.option;
  }

  async buyOption(optionId: string): Promise<{ success: boolean; trade: Trade }> {
    return this.fetch(`/api/options/${optionId}/buy`, {
      method: 'POST',
    });
  }

  async exerciseOption(optionId: string): Promise<{ success: boolean; settlement: unknown }> {
    return this.fetch(`/api/options/${optionId}/exercise`, {
      method: 'POST',
    });
  }

  async getOptionStats(): Promise<{
    totalOptions: number;
    openOptions: number;
    totalVolume: number;
    avgPremium: number;
  }> {
    return this.fetch('/api/options/stats/summary');
  }

  // Market endpoints
  async getVolume(): Promise<VolumeStats> {
    return this.fetch<VolumeStats>('/api/market/volume');
  }

  async getOpenInterest(): Promise<OpenInterest> {
    return this.fetch<OpenInterest>('/api/market/open-interest');
  }

  async getMarketDepth(optionId: string): Promise<{
    bids: Array<{ price: number; amount: number }>;
    asks: Array<{ price: number; amount: number }>;
  }> {
    return this.fetch(`/api/market/depth/${optionId}`);
  }

  async getRecentTrades(limit?: number): Promise<Trade[]> {
    const response = await this.fetch<{ trades: Trade[] }>(
      `/api/market/trades${limit ? `?limit=${limit}` : ''}`
    );
    return response.trades;
  }

  // Strategy endpoints
  async getStrategyTemplates(): Promise<StrategyTemplate[]> {
    const response = await this.fetch<{ templates: StrategyTemplate[] }>(
      '/api/strategies/templates'
    );
    return response.templates;
  }

  // Protocol options chain (Binance-style)
  async getOptionsChain(expiry?: string): Promise<OptionsChain> {
    const response = await this.fetch<{ success: boolean; data: OptionsChain }>(
      `/api/options/protocol${expiry ? `?expiry=${encodeURIComponent(expiry)}` : ''}`
    );
    return response.data;
  }

  async refreshOptionsChain(): Promise<{ newOptions: number }> {
    const response = await this.fetch<{ success: boolean; data: { newOptions: number } }>(
      '/api/options/protocol/refresh',
      { method: 'POST' }
    );
    return response.data;
  }
}

export const api = new ApiClient(API_BASE_URL);
