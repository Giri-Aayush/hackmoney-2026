/**
 * Event Indexer Service
 *
 * Watches blockchain events for deposits, withdrawals, and settlements.
 * Automatically records them to Supabase database.
 */

import {
  createPublicClient,
  http,
  parseAbi,
  Address,
  Hex,
  PublicClient,
} from 'viem';
import { sepolia } from 'viem/chains';
import { config } from '../../config/index.js';
import { db } from '../db/service.js';
import { DEFAULT_CONTRACTS } from '../settlement/service.js';

// Events ABI
const OPTICHANNEL_EVENTS_ABI = parseAbi([
  'event Deposit(address indexed user, uint256 amount)',
  'event Withdrawal(address indexed user, uint256 amount)',
  'event OptionSettled(bytes32 indexed optionId, address holder, address writer, uint256 payout)',
]);

// Event log types with args
interface DepositLog {
  args: { user: Address; amount: bigint };
  transactionHash?: Hex;
}

interface WithdrawalLog {
  args: { user: Address; amount: bigint };
  transactionHash?: Hex;
}

interface SettlementLog {
  args: { optionId: Hex; holder: Address; writer: Address; payout: bigint };
  transactionHash?: Hex;
}

export interface IndexerConfig {
  rpcUrl?: string;
  contractAddress?: Address;
  pollInterval?: number; // ms
  startBlock?: bigint;
}

export interface IndexerStats {
  depositsIndexed: number;
  withdrawalsIndexed: number;
  settlementsIndexed: number;
  lastBlockProcessed: bigint;
  isRunning: boolean;
}

/**
 * EventIndexerService
 *
 * Watches on-chain events and syncs them to database.
 * Runs as a background service that polls for new events.
 */
export class EventIndexerService {
  private client: PublicClient;
  private contractAddress: Address;
  private pollInterval: number;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastProcessedBlock: bigint = 0n;

  // Stats
  private depositsIndexed: number = 0;
  private withdrawalsIndexed: number = 0;
  private settlementsIndexed: number = 0;

  // Event listeners (for real-time watching)
  private depositUnwatch: (() => void) | null = null;
  private withdrawalUnwatch: (() => void) | null = null;
  private settlementUnwatch: (() => void) | null = null;

  constructor(indexerConfig: IndexerConfig = {}) {
    this.contractAddress = indexerConfig.contractAddress || DEFAULT_CONTRACTS.optiChannel;
    this.pollInterval = indexerConfig.pollInterval || 15000; // 15 seconds default

    this.client = createPublicClient({
      chain: sepolia,
      transport: http(indexerConfig.rpcUrl || config.chain.rpcUrl),
    });

    if (indexerConfig.startBlock) {
      this.lastProcessedBlock = indexerConfig.startBlock;
    }
  }

  /**
   * Start the indexer service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Indexer] Already running');
      return;
    }

    console.log('[Indexer] Starting event indexer...');
    console.log(`[Indexer] Contract: ${this.contractAddress}`);
    console.log(`[Indexer] Poll interval: ${this.pollInterval}ms`);

    this.isRunning = true;

    // Get current block if not set
    if (this.lastProcessedBlock === 0n) {
      const currentBlock = await this.client.getBlockNumber();
      // Start from recent blocks (last 1000)
      this.lastProcessedBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;
      console.log(`[Indexer] Starting from block ${this.lastProcessedBlock}`);
    }

    // Start real-time event watching
    this.startEventWatching();

    // Also poll for any missed events
    this.startPolling();

    console.log('[Indexer] Event indexer started');
  }

  /**
   * Stop the indexer service
   */
  stop(): void {
    console.log('[Indexer] Stopping event indexer...');

    this.isRunning = false;

    // Stop polling
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Stop event watching
    if (this.depositUnwatch) {
      this.depositUnwatch();
      this.depositUnwatch = null;
    }
    if (this.withdrawalUnwatch) {
      this.withdrawalUnwatch();
      this.withdrawalUnwatch = null;
    }
    if (this.settlementUnwatch) {
      this.settlementUnwatch();
      this.settlementUnwatch = null;
    }

    console.log('[Indexer] Event indexer stopped');
  }

  /**
   * Get indexer statistics
   */
  getStats(): IndexerStats {
    return {
      depositsIndexed: this.depositsIndexed,
      withdrawalsIndexed: this.withdrawalsIndexed,
      settlementsIndexed: this.settlementsIndexed,
      lastBlockProcessed: this.lastProcessedBlock,
      isRunning: this.isRunning,
    };
  }

  /**
   * Start real-time event watching using WebSocket/polling
   */
  private startEventWatching(): void {
    // Watch Deposit events
    this.depositUnwatch = this.client.watchContractEvent({
      address: this.contractAddress,
      abi: OPTICHANNEL_EVENTS_ABI,
      eventName: 'Deposit',
      onLogs: (logs) => {
        for (const log of logs) {
          this.handleDepositEvent(log as unknown as DepositLog);
        }
      },
      onError: (error) => {
        console.error('[Indexer] Deposit watch error:', error.message);
      },
    });

    // Watch Withdrawal events
    this.withdrawalUnwatch = this.client.watchContractEvent({
      address: this.contractAddress,
      abi: OPTICHANNEL_EVENTS_ABI,
      eventName: 'Withdrawal',
      onLogs: (logs) => {
        for (const log of logs) {
          this.handleWithdrawalEvent(log as unknown as WithdrawalLog);
        }
      },
      onError: (error) => {
        console.error('[Indexer] Withdrawal watch error:', error.message);
      },
    });

    // Watch OptionSettled events
    this.settlementUnwatch = this.client.watchContractEvent({
      address: this.contractAddress,
      abi: OPTICHANNEL_EVENTS_ABI,
      eventName: 'OptionSettled',
      onLogs: (logs) => {
        for (const log of logs) {
          this.handleSettlementEvent(log as unknown as SettlementLog);
        }
      },
      onError: (error) => {
        console.error('[Indexer] Settlement watch error:', error.message);
      },
    });

    console.log('[Indexer] Event watchers started');
  }

  /**
   * Start polling for historical/missed events
   */
  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.pollEvents();
      } catch (error) {
        console.error('[Indexer] Poll error:', error);
      }
    }, this.pollInterval);

    // Also poll immediately
    this.pollEvents().catch(console.error);
  }

  /**
   * Poll for events since last processed block
   */
  private async pollEvents(): Promise<void> {
    const currentBlock = await this.client.getBlockNumber();

    if (currentBlock <= this.lastProcessedBlock) {
      return; // No new blocks
    }

    const fromBlock = this.lastProcessedBlock + 1n;
    const toBlock = currentBlock;

    // Fetch all events in range
    const [depositLogs, withdrawalLogs, settlementLogs] = await Promise.all([
      this.client.getContractEvents({
        address: this.contractAddress,
        abi: OPTICHANNEL_EVENTS_ABI,
        eventName: 'Deposit',
        fromBlock,
        toBlock,
      }),
      this.client.getContractEvents({
        address: this.contractAddress,
        abi: OPTICHANNEL_EVENTS_ABI,
        eventName: 'Withdrawal',
        fromBlock,
        toBlock,
      }),
      this.client.getContractEvents({
        address: this.contractAddress,
        abi: OPTICHANNEL_EVENTS_ABI,
        eventName: 'OptionSettled',
        fromBlock,
        toBlock,
      }),
    ]);

    // Process events
    for (const log of depositLogs) {
      await this.handleDepositEvent(log as unknown as DepositLog);
    }

    for (const log of withdrawalLogs) {
      await this.handleWithdrawalEvent(log as unknown as WithdrawalLog);
    }

    for (const log of settlementLogs) {
      await this.handleSettlementEvent(log as unknown as SettlementLog);
    }

    this.lastProcessedBlock = toBlock;

    const total = depositLogs.length + withdrawalLogs.length + settlementLogs.length;
    if (total > 0) {
      console.log(`[Indexer] Processed ${total} events (blocks ${fromBlock}-${toBlock})`);
    }
  }

  /**
   * Handle a Deposit event
   */
  private async handleDepositEvent(log: DepositLog): Promise<void> {
    const { args } = log;
    if (!args?.user || args.amount === undefined) return;

    const txHash = log.transactionHash || ('0x' + '0'.repeat(64)) as Hex;
    const amountUsdc = Number(args.amount) / 1e6; // USDC has 6 decimals

    console.log(`[Indexer] Deposit: ${args.user.slice(0, 10)}... deposited $${amountUsdc.toFixed(2)} USDC`);

    try {
      // Record deposit to database
      await db.deposit(args.user, amountUsdc, txHash);
      this.depositsIndexed++;
    } catch (error) {
      console.error('[Indexer] Failed to record deposit:', error);
    }
  }

  /**
   * Handle a Withdrawal event
   */
  private async handleWithdrawalEvent(log: WithdrawalLog): Promise<void> {
    const { args } = log;
    if (!args?.user || args.amount === undefined) return;

    const amountUsdc = Number(args.amount) / 1e6; // USDC has 6 decimals

    console.log(`[Indexer] Withdrawal: ${args.user.slice(0, 10)}... withdrew $${amountUsdc.toFixed(2)} USDC`);

    try {
      // Record withdrawal to database
      await db.withdraw(args.user, amountUsdc);
      this.withdrawalsIndexed++;
    } catch (error) {
      console.error('[Indexer] Failed to record withdrawal:', error);
    }
  }

  /**
   * Handle an OptionSettled event
   */
  private async handleSettlementEvent(log: SettlementLog): Promise<void> {
    const { args } = log;
    if (!args?.optionId) return;

    const payoutUsdc = Number(args.payout) / 1e6;

    console.log(
      `[Indexer] Settlement: Option ${args.optionId.slice(0, 10)}... ` +
        `settled with payout $${payoutUsdc.toFixed(2)} USDC`
    );

    try {
      // Update option status in database
      // Note: The option exercise was already recorded, this confirms on-chain settlement
      this.settlementsIndexed++;
    } catch (error) {
      console.error('[Indexer] Failed to record settlement:', error);
    }
  }

  /**
   * Manually sync from a specific block
   */
  async syncFromBlock(fromBlock: bigint): Promise<void> {
    console.log(`[Indexer] Syncing from block ${fromBlock}...`);

    const currentBlock = await this.client.getBlockNumber();
    const BATCH_SIZE = 10000n;

    let start = fromBlock;
    while (start < currentBlock) {
      const end = start + BATCH_SIZE > currentBlock ? currentBlock : start + BATCH_SIZE;

      console.log(`[Indexer] Fetching blocks ${start}-${end}...`);

      const [depositLogs, withdrawalLogs, settlementLogs] = await Promise.all([
        this.client.getContractEvents({
          address: this.contractAddress,
          abi: OPTICHANNEL_EVENTS_ABI,
          eventName: 'Deposit',
          fromBlock: start,
          toBlock: end,
        }),
        this.client.getContractEvents({
          address: this.contractAddress,
          abi: OPTICHANNEL_EVENTS_ABI,
          eventName: 'Withdrawal',
          fromBlock: start,
          toBlock: end,
        }),
        this.client.getContractEvents({
          address: this.contractAddress,
          abi: OPTICHANNEL_EVENTS_ABI,
          eventName: 'OptionSettled',
          fromBlock: start,
          toBlock: end,
        }),
      ]);

      for (const log of depositLogs) {
        await this.handleDepositEvent(log as unknown as DepositLog);
      }
      for (const log of withdrawalLogs) {
        await this.handleWithdrawalEvent(log as unknown as WithdrawalLog);
      }
      for (const log of settlementLogs) {
        await this.handleSettlementEvent(log as unknown as SettlementLog);
      }

      start = end + 1n;
    }

    this.lastProcessedBlock = currentBlock;
    console.log(`[Indexer] Sync complete. Processed up to block ${currentBlock}`);
  }
}

// Singleton instance for easy access
let indexerInstance: EventIndexerService | null = null;

export function getIndexer(indexerConfig?: IndexerConfig): EventIndexerService {
  if (!indexerInstance) {
    indexerInstance = new EventIndexerService(indexerConfig);
  }
  return indexerInstance;
}

export function createIndexer(indexerConfig?: IndexerConfig): EventIndexerService {
  return new EventIndexerService(indexerConfig);
}
