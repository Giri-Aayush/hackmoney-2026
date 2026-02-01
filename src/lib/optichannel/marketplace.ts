import { Address, Hex } from 'viem';
import { YellowClient, RPCAppSessionAllocation, RPCProtocolVersion } from '../yellow/index.js';
import { OptionsOrderBook, Option, CreateOptionParams } from '../options/index.js';
import { PythClient } from '../pyth/index.js';

export interface MarketplaceConfig {
  yellowClient: YellowClient;
  pythClient?: PythClient;
}

export interface Trade {
  tradeId: Hex;
  option: Option;
  buyer: Address;
  seller: Address;
  premium: bigint;
  executedAt: number;
  sessionId?: Hex;
}

export class OptiChannelMarketplace {
  private yellowClient: YellowClient;
  private orderBook: OptionsOrderBook;
  private pythClient: PythClient;
  private trades: Map<Hex, Trade> = new Map();

  constructor(config: MarketplaceConfig) {
    this.yellowClient = config.yellowClient;
    this.pythClient = config.pythClient || new PythClient();
    this.orderBook = new OptionsOrderBook(this.pythClient);
  }

  get address(): Address {
    return this.yellowClient.address;
  }

  async getCurrentPrice(): Promise<number> {
    const data = await this.pythClient.getEthUsdPrice();
    return data.price;
  }

  async writeOption(params: CreateOptionParams): Promise<Option> {
    return this.orderBook.listOption(this.yellowClient.address, params);
  }

  getAvailableOptions(filters?: {
    optionType?: 'call' | 'put';
    underlying?: string;
    minStrike?: number;
    maxStrike?: number;
  }): Option[] {
    return this.orderBook.getAvailableOptions(filters);
  }

  getCalls(): Option[] {
    return this.orderBook.getCallOptions();
  }

  getPuts(): Option[] {
    return this.orderBook.getPutOptions();
  }

  async buyOption(optionId: Hex): Promise<Trade> {
    const option = this.orderBook.getOptionById(optionId);
    if (!option) {
      throw new Error(`Option ${optionId} not found`);
    }

    const buyer = this.yellowClient.address;
    const seller = option.writer;

    const boughtOption = await this.orderBook.buyOption(optionId, buyer);

    let sessionId: Hex | undefined;
    try {
      const response = await this.yellowClient.createAppSession({
        definition: {
          application: 'optichannel',
          protocol: RPCProtocolVersion.NitroRPC_0_2,
          participants: [buyer, seller],
          weights: [50, 50],
          quorum: 100,
          challenge: 86400,
          nonce: Date.now(),
        },
        allocations: [
          { participant: buyer, asset: 'usdc', amount: boughtOption.premium.toString() },
          { participant: seller, asset: 'usdc', amount: '0' },
        ],
      });
      sessionId = (response.data as { app_session_id?: Hex }).app_session_id;
    } catch {
      // Sandbox fallback
    }

    const tradeId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(66, '0').slice(0, 66) as Hex;

    const trade: Trade = {
      tradeId,
      option: boughtOption,
      buyer,
      seller,
      premium: boughtOption.premium,
      executedAt: Math.floor(Date.now() / 1000),
      sessionId,
    };

    this.trades.set(tradeId, trade);
    console.log(`[Marketplace] Trade executed: ${tradeId.slice(0, 10)}...`);

    return trade;
  }

  async exerciseOption(optionId: Hex): Promise<{ payout: number }> {
    return this.orderBook.exerciseOption(optionId, this.yellowClient.address);
  }

  getMyWrittenOptions(): Option[] {
    return this.orderBook.getOptionsByWriter(this.yellowClient.address);
  }

  getMyPurchasedOptions(): Option[] {
    return this.orderBook.getOptionsByHolder(this.yellowClient.address);
  }

  getMyTrades(): Trade[] {
    return Array.from(this.trades.values()).filter(
      t => t.buyer === this.yellowClient.address || t.seller === this.yellowClient.address
    );
  }

  getOrderBookStats() {
    return this.orderBook.getStats();
  }

  async createOptionChain(params: {
    underlying: string;
    baseStrike: number;
    strikeInterval: number;
    numStrikes: number;
    premium: number;
    expiryMinutes: number;
  }): Promise<Option[]> {
    const options: Option[] = [];

    for (let i = -Math.floor(params.numStrikes / 2); i <= Math.floor(params.numStrikes / 2); i++) {
      const strike = params.baseStrike + i * params.strikeInterval;
      if (strike <= 0) continue;

      const call = await this.writeOption({
        underlying: params.underlying,
        strikePrice: strike,
        premium: params.premium,
        expiryMinutes: params.expiryMinutes,
        optionType: 'call',
        amount: 0.1,
      });
      options.push(call);

      const put = await this.writeOption({
        underlying: params.underlying,
        strikePrice: strike,
        premium: params.premium,
        expiryMinutes: params.expiryMinutes,
        optionType: 'put',
        amount: 0.1,
      });
      options.push(put);
    }

    console.log(`[Marketplace] Created option chain with ${options.length} options`);
    return options;
  }
}
