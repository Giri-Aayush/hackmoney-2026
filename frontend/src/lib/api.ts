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
  theoreticalPrice?: number;
  intrinsicValue?: number;
  timeValue?: number;
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
  type: string;
  name: string;
  description: string;
  requiredParams: string[];
  // Optional fields that may not be present in simple templates
  legs?: Array<{
    type: 'call' | 'put';
    position: 'long' | 'short';
    strikeOffset: number;
  }>;
  maxProfit?: string;
  maxLoss?: string;
  breakeven?: string;
}

export interface BuiltStrategy {
  id: string;
  name: string;
  type: string;
  underlying: string;
  legs: Array<{
    optionType: 'call' | 'put';
    strike: number;
    side: 'buy' | 'sell';
    quantity: number;
    premium: number;
  }>;
  expiry: number;
  netDebit: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
}

export interface TradingBalance {
  available: number;
  locked: number;
  totalDeposited: number;
  totalWithdrawn: number;
  lastUpdated: number;
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
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || errorData.message || 'API request failed');
    }

    return response.json();
  }

  // Price endpoints
  async getPrice(): Promise<PriceData> {
    const response = await this.fetch<{ success: boolean; data: { symbol: string; price: number; confidence: number; publishTime: string } }>('/api/price');
    return {
      asset: response.data.symbol,
      price: response.data.price,
      confidence: response.data.confidence,
      publishTime: new Date(response.data.publishTime).getTime(),
      source: 'Pyth',
    };
  }

  // Options endpoints
  async getOptions(): Promise<Option[]> {
    // Backend returns { success, data: OptionResponse[] } with different field names
    interface BackendOption {
      id: string;
      optionType: 'call' | 'put';
      strikePrice: number;
      expiry: number;
      premium: number;
      amount: number;
      writer: string;
      holder?: string;
      status: string;
      underlying: string;
      greeks?: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
        rho: number;
      };
    }

    const response = await this.fetch<{ success: boolean; data: BackendOption[] }>('/api/options');

    // Transform backend format to frontend format
    return (response.data || []).map((o) => ({
      id: o.id,
      type: o.optionType,
      strike: o.strikePrice,
      expiry: o.expiry,
      premium: o.premium,
      amount: o.amount,
      writer: o.writer,
      buyer: o.holder,
      status: o.status as Option['status'],
      underlyingAsset: o.underlying || 'ETH',
      greeks: o.greeks,
    }));
  }

  async getPositions(): Promise<{ bought: Option[]; written: Option[] }> {
    // Backend returns options with different field names
    interface BackendOption {
      id: string;
      optionType: 'call' | 'put';
      strikePrice: number;
      expiry: number;
      premium: number;
      amount: number;
      writer: string;
      holder?: string;
      status: string;
      underlying: string;
      theoreticalPrice?: number;
      intrinsicValue?: number;
      timeValue?: number;
      greeks?: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
        rho: number;
      };
    }

    const response = await this.fetch<{
      success: boolean;
      data: { bought: BackendOption[]; written: BackendOption[] };
    }>('/api/options/positions');

    const transform = (o: BackendOption): Option => ({
      id: o.id,
      type: o.optionType,
      strike: o.strikePrice,
      expiry: o.expiry,
      premium: o.premium,
      amount: o.amount,
      writer: o.writer,
      buyer: o.holder,
      status: o.status as Option['status'],
      underlyingAsset: o.underlying || 'ETH',
      theoreticalPrice: o.theoreticalPrice,
      intrinsicValue: o.intrinsicValue,
      timeValue: o.timeValue,
      greeks: o.greeks,
    });

    return {
      bought: (response.data?.bought || []).map(transform),
      written: (response.data?.written || []).map(transform),
    };
  }

  async createOption(option: {
    type: 'call' | 'put';
    strike: number;
    expiry: number;
    premium: number;
    amount: number;
  }): Promise<Option> {
    // Normalize expiry to milliseconds (handles both seconds and milliseconds input)
    const expiryMs = option.expiry < 1e12 ? option.expiry * 1000 : option.expiry;
    // Convert expiry timestamp to minutes from now
    const expiryMinutes = Math.max(1, Math.round((expiryMs - Date.now()) / (1000 * 60)));

    // Transform to backend format
    const payload = {
      underlying: 'ETH',
      strikePrice: option.strike,
      premium: option.premium,
      expiryMinutes,
      optionType: option.type,
      amount: option.amount,
    };

    const response = await this.fetch<{ success: boolean; data: Option }>('/api/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.data;
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
    const response = await this.fetch<{ success: boolean; data: { volume24h: number; trades24h: number; volumeUsd24h: number } }>('/api/market/volume');
    return {
      volume24h: response.data?.volumeUsd24h || 0,
      tradeCount24h: response.data?.trades24h || 0,
      uniqueTraders24h: 0, // Not tracked by backend
    };
  }

  async getOpenInterest(): Promise<OpenInterest> {
    interface OIData { strike: number; expiry: number; callOI: number; putOI: number }
    const response = await this.fetch<{ success: boolean; data: { byStrike: OIData[]; totals: { totalOI: number } } }>('/api/market/open-interest');
    return {
      totalOpenInterest: response.data?.totals?.totalOI || 0,
      byStrike: (response.data?.byStrike || []).map(oi => ({
        strike: oi.strike,
        calls: oi.callOI,
        puts: oi.putOI,
        total: oi.callOI + oi.putOI,
      })),
    };
  }

  async getMarketDepth(optionId: string): Promise<{
    bids: Array<{ price: number; amount: number }>;
    asks: Array<{ price: number; amount: number }>;
  }> {
    return this.fetch(`/api/market/depth/${optionId}`);
  }

  async getRecentTrades(limit?: number): Promise<Trade[]> {
    const response = await this.fetch<{ success: boolean; data: { trades: Trade[]; count: number } }>(
      `/api/market/trades${limit ? `?limit=${limit}` : ''}`
    );
    return response.data?.trades || [];
  }

  // Strategy endpoints
  async getStrategyTemplates(): Promise<StrategyTemplate[]> {
    const response = await this.fetch<{ success: boolean; data: StrategyTemplate[] }>(
      '/api/strategies/templates'
    );
    return response.data || [];
  }

  async buildStrategy(params: {
    type: string;
    underlying: string;
    expiryDays: number;
    lowerStrike?: number;
    upperStrike?: number;
    middleStrike?: number;
    strike?: number;
    putStrike?: number;
    callStrike?: number;
    putBuyStrike?: number;
    putSellStrike?: number;
    callSellStrike?: number;
    callBuyStrike?: number;
  }): Promise<BuiltStrategy> {
    const response = await this.fetch<{ success: boolean; data: BuiltStrategy }>(
      '/api/strategies/build',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return response.data;
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

  // Trading balance endpoints
  async getTradingBalance(): Promise<TradingBalance> {
    const response = await this.fetch<{ success: boolean; data: TradingBalance }>(
      '/api/portfolio/trading-balance'
    );
    return response.data;
  }

  async syncDeposit(amount: number, txHash?: string): Promise<TradingBalance> {
    const response = await this.fetch<{ success: boolean; data: TradingBalance }>(
      '/api/portfolio/trading-balance/sync',
      {
        method: 'POST',
        body: JSON.stringify({ amount, txHash }),
      }
    );
    return response.data;
  }

  async resetTradingBalance(): Promise<void> {
    await this.fetch<{ success: boolean }>('/api/portfolio/trading-balance/reset', {
      method: 'POST',
    });
  }

  async setTradingBalance(amount: number): Promise<TradingBalance> {
    const response = await this.fetch<{ success: boolean; data: TradingBalance }>(
      '/api/portfolio/trading-balance/set',
      {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }
    );
    return response.data;
  }
}

export const api = new ApiClient(API_BASE_URL);
