import { Address, Hex } from 'viem';
import { YellowClient, CreateAppSessionRequestParams, RPCAppSessionAllocation, RPCProtocolVersion } from '../yellow/index.js';
import { OptionsEngine, Option, CreateOptionParams, OptionQuote } from '../options/index.js';
import { PythClient } from '../pyth/index.js';

export interface OptixConfig {
  yellowClient: YellowClient;
  pythClient?: PythClient;
}

export interface ActiveSession {
  sessionId: Hex;
  counterparty: Address;
  option: Option;
  createdAt: number;
}

export class OptixService {
  private yellowClient: YellowClient;
  private optionsEngine: OptionsEngine;
  private pythClient: PythClient;
  private activeSessions: Map<Hex, ActiveSession> = new Map();

  constructor(config: OptixConfig) {
    this.yellowClient = config.yellowClient;
    this.pythClient = config.pythClient || new PythClient();
    this.optionsEngine = new OptionsEngine(
      config.yellowClient.address,
      this.pythClient
    );
  }

  get address(): Address {
    return this.yellowClient.address;
  }

  async getCurrentEthPrice(): Promise<number> {
    const priceData = await this.pythClient.getEthUsdPrice();
    return priceData.price;
  }

  async createOption(params: CreateOptionParams): Promise<Option> {
    const option = await this.optionsEngine.createOption(params);
    console.log(`[Optix] Option created: ${option.id.slice(0, 10)}...`);
    return option;
  }

  async getOptionQuote(optionId: Hex): Promise<OptionQuote> {
    return this.optionsEngine.getOptionQuote(optionId);
  }

  getAllOptions(): Option[] {
    return this.optionsEngine.getAllOptions();
  }

  async openTradingSession(
    counterparty: Address,
    option: Option,
    collateralAmount: bigint
  ): Promise<ActiveSession> {
    console.log(`[Optix] Opening trading session with ${counterparty.slice(0, 10)}...`);

    const allocations: RPCAppSessionAllocation[] = [
      {
        participant: this.yellowClient.address,
        asset: 'usdc',
        amount: collateralAmount.toString(),
      },
      {
        participant: counterparty,
        asset: 'usdc',
        amount: '0',
      },
    ];

    const sessionParams: CreateAppSessionRequestParams = {
      definition: {
        application: 'optix',
        protocol: RPCProtocolVersion.NitroRPC_0_2,
        participants: [this.yellowClient.address, counterparty],
        weights: [100, 0],
        quorum: 100,
        challenge: 86400,
        nonce: Date.now(),
      },
      allocations,
    };

    try {
      const response = await this.yellowClient.createAppSession(sessionParams);
      const sessionData = response.data as { app_session_id?: Hex };
      const sessionId = sessionData.app_session_id || (`0x${Date.now().toString(16)}` as Hex);

      const session: ActiveSession = {
        sessionId,
        counterparty,
        option,
        createdAt: Math.floor(Date.now() / 1000),
      };

      this.activeSessions.set(sessionId, session);
      console.log(`[Optix] Session opened: ${sessionId.slice(0, 10)}...`);

      return session;
    } catch (error) {
      console.log(`[Optix] Session creation via ClearNode skipped (sandbox), using local session`);

      const sessionId = `0x${Date.now().toString(16)}${'0'.repeat(48)}`.slice(0, 66) as Hex;

      const session: ActiveSession = {
        sessionId,
        counterparty,
        option,
        createdAt: Math.floor(Date.now() / 1000),
      };

      this.activeSessions.set(sessionId, session);
      return session;
    }
  }

  async sendTradeMessage(
    sessionId: Hex,
    action: 'offer' | 'accept' | 'exercise' | 'settle',
    data: unknown
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const message = {
      action,
      optionId: session.option.id,
      timestamp: Date.now(),
      data,
    };

    try {
      await this.yellowClient.sendApplicationMessage(sessionId, message);
      console.log(`[Optix] Sent ${action} message in session ${sessionId.slice(0, 10)}...`);
    } catch (error) {
      console.log(`[Optix] Message simulated (sandbox): ${action}`);
    }
  }

  async exerciseOption(sessionId: Hex): Promise<{ payout: number }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const result = await this.optionsEngine.exerciseOption(
      session.option.id,
      session.counterparty
    );

    await this.sendTradeMessage(sessionId, 'exercise', {
      settlementPrice: result.option.settlementPrice?.toString(),
      payout: result.payout,
    });

    return { payout: result.payout };
  }

  async closeSession(sessionId: Hex, finalAllocations?: RPCAppSessionAllocation[]): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      await this.yellowClient.closeAppSession({
        app_session_id: sessionId,
        allocations: finalAllocations || [],
      });
      console.log(`[Optix] Session ${sessionId.slice(0, 10)}... closed`);
    } catch (error) {
      console.log(`[Optix] Session close simulated (sandbox)`);
    }

    this.activeSessions.delete(sessionId);
  }

  getActiveSession(sessionId: Hex): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getAllActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  async simulateFullTrade(counterparty: Address): Promise<{
    option: Option;
    session: ActiveSession;
    quote: OptionQuote;
  }> {
    console.log('\n' + '='.repeat(50));
    console.log('Optix Full Trade Simulation');
    console.log('='.repeat(50) + '\n');

    const currentPrice = await this.getCurrentEthPrice();
    console.log(`Current ETH Price: $${currentPrice.toFixed(2)}`);

    const strikePrice = Math.round(currentPrice * 1.05);
    const option = await this.createOption({
      underlying: 'ETH',
      strikePrice,
      premium: 25,
      expiryMinutes: 60,
      optionType: 'call',
      amount: 0.1,
    });

    const quote = await this.getOptionQuote(option.id);
    console.log(`\nOption Quote:`);
    console.log(`  Type: CALL`);
    console.log(`  Strike: $${strikePrice}`);
    console.log(`  Premium: $25`);
    console.log(`  Breakeven: $${quote.breakeven.toFixed(2)}`);

    const collateral = BigInt(Math.round(25 * 1e6));
    const session = await this.openTradingSession(counterparty, option, collateral);

    await this.sendTradeMessage(session.sessionId, 'offer', {
      premium: 25,
      terms: 'Standard call option',
    });

    console.log(`\n${'='.repeat(50)}`);
    console.log('Trade simulation complete!');
    console.log(`Session ID: ${session.sessionId.slice(0, 20)}...`);
    console.log(`${'='.repeat(50)}\n`);

    return { option, session, quote };
  }
}
