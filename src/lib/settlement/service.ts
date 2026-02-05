import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  Address,
  Hex,
  PublicClient,
  WalletClient,
  Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { config } from '../../config/index.js';
import {
  DepositRequest,
  WithdrawalRequest,
  SettlementRequest,
  SettlementResult,
  ContractAddresses,
} from './types.js';

// OptiChannel Settlement Contract ABI (minimal interface)
const OPTICHANNEL_ABI = parseAbi([
  // Deposits
  'function deposit(uint256 amount) external',
  'function depositFor(address user, uint256 amount) external',

  // Withdrawals
  'function withdraw(uint256 amount, uint256 nonce, bytes signature) external',
  'function withdrawTo(address to, uint256 amount, uint256 nonce, bytes signature) external',

  // Settlement
  'function settleOption(bytes32 optionId, address holder, address writer, uint256 payout, uint256 settlementPrice, bytes pythUpdate, bytes holderSig, bytes writerSig) external',

  // View functions
  'function balanceOf(address user) external view returns (uint256)',
  'function nonces(address user) external view returns (uint256)',
  'function isSettled(bytes32 optionId) external view returns (bool)',

  // Events
  'event Deposit(address indexed user, uint256 amount)',
  'event Withdrawal(address indexed user, uint256 amount)',
  'event OptionSettled(bytes32 indexed optionId, address holder, address writer, uint256 payout)',
]);

// ERC20 ABI for USDC
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
]);

/**
 * SettlementService
 * Handles on-chain deposits, withdrawals, and option settlements
 */
export class SettlementService {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private account: Account | null = null;
  private contracts: ContractAddresses;

  constructor(contracts: ContractAddresses) {
    this.contracts = contracts;

    // Create public client for reading (Ethereum Sepolia)
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.chain.rpcUrl),
    });

    // Create wallet client if private key is available
    if (config.wallet.privateKey) {
      this.account = privateKeyToAccount(config.wallet.privateKey as Hex);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: sepolia,
        transport: http(config.chain.rpcUrl),
      });
    }
  }

  /**
   * Check if wallet client is available
   */
  isWalletConnected(): boolean {
    return this.walletClient !== null;
  }

  /**
   * Get on-chain balance for a user
   */
  async getOnChainBalance(user: Address): Promise<bigint> {
    const balance = await this.publicClient.readContract({
      address: this.contracts.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'balanceOf',
      args: [user],
    });
    return balance as bigint;
  }

  /**
   * Get USDC balance for a user
   */
  async getUsdcBalance(user: Address): Promise<bigint> {
    const balance = await this.publicClient.readContract({
      address: this.contracts.usdc,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [user],
    });
    return balance as bigint;
  }

  /**
   * Get current nonce for withdrawals
   */
  async getNonce(user: Address): Promise<bigint> {
    const nonce = await this.publicClient.readContract({
      address: this.contracts.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'nonces',
      args: [user],
    });
    return nonce as bigint;
  }

  /**
   * Check if an option has been settled
   */
  async isOptionSettled(optionId: Hex): Promise<boolean> {
    const settled = await this.publicClient.readContract({
      address: this.contracts.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'isSettled',
      args: [optionId],
    });
    return settled as boolean;
  }

  /**
   * Approve USDC spending for deposits
   */
  async approveUsdc(amount: bigint): Promise<Hex> {
    if (!this.walletClient) throw new Error('Wallet not connected');

    const hash = await this.walletClient.writeContract({
      account: this.account!,
      chain: sepolia,
      address: this.contracts.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.contracts.optiChannel, amount],
    });

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Deposit USDC to the settlement contract
   */
  async deposit(request: DepositRequest): Promise<SettlementResult> {
    if (!this.walletClient) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      // Check allowance
      const allowance = await this.publicClient.readContract({
        address: this.contracts.usdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [request.user, this.contracts.optiChannel],
      }) as bigint;

      // Approve if needed
      if (allowance < request.amount) {
        await this.approveUsdc(request.amount);
      }

      // Deposit
      const hash = await this.walletClient.writeContract({
        account: this.account!,
        chain: sepolia,
        address: this.contracts.optiChannel,
        abi: OPTICHANNEL_ABI,
        functionName: 'deposit',
        args: [request.amount],
      });

      await this.publicClient.waitForTransactionReceipt({ hash });

      return { success: true, txHash: hash };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deposit failed',
      };
    }
  }

  /**
   * Withdraw USDC from the settlement contract
   */
  async withdraw(request: WithdrawalRequest): Promise<SettlementResult> {
    if (!this.walletClient) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const hash = await this.walletClient.writeContract({
        account: this.account!,
        chain: sepolia,
        address: this.contracts.optiChannel,
        abi: OPTICHANNEL_ABI,
        functionName: 'withdraw',
        args: [request.amount, request.nonce, request.signature],
      });

      await this.publicClient.waitForTransactionReceipt({ hash });

      return { success: true, txHash: hash };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed',
      };
    }
  }

  /**
   * Settle an option on-chain
   * This is called when an option is exercised and needs final settlement
   */
  async settleOption(request: SettlementRequest): Promise<SettlementResult> {
    if (!this.walletClient) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      // Check if already settled
      const alreadySettled = await this.isOptionSettled(request.optionId);
      if (alreadySettled) {
        return { success: false, error: 'Option already settled' };
      }

      const hash = await this.walletClient.writeContract({
        account: this.account!,
        chain: sepolia,
        address: this.contracts.optiChannel,
        abi: OPTICHANNEL_ABI,
        functionName: 'settleOption',
        args: [
          request.optionId,
          request.holder,
          request.writer,
          request.payout,
          request.settlementPrice,
          request.pythPriceUpdate,
          request.signatures.holder,
          request.signatures.writer,
        ],
      });

      await this.publicClient.waitForTransactionReceipt({ hash });

      return { success: true, txHash: hash };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Settlement failed',
      };
    }
  }

  /**
   * Watch for deposit events
   */
  watchDeposits(callback: (event: { user: Address; amount: bigint }) => void): () => void {
    const unwatch = this.publicClient.watchContractEvent({
      address: this.contracts.optiChannel,
      abi: OPTICHANNEL_ABI,
      eventName: 'Deposit',
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as { user: Address; amount: bigint };
          callback(args);
        }
      },
    });

    return unwatch;
  }

  /**
   * Watch for settlement events
   */
  watchSettlements(
    callback: (event: { optionId: Hex; holder: Address; writer: Address; payout: bigint }) => void
  ): () => void {
    const unwatch = this.publicClient.watchContractEvent({
      address: this.contracts.optiChannel,
      abi: OPTICHANNEL_ABI,
      eventName: 'OptionSettled',
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as { optionId: Hex; holder: Address; writer: Address; payout: bigint };
          callback(args);
        }
      },
    });

    return unwatch;
  }
}

// Default contract addresses - Ethereum Sepolia
export const DEFAULT_CONTRACTS: ContractAddresses = {
  optiChannel: '0x7779c5E338e52Be395A2A5386f8CFBf6629f67CB' as Address, // OptiChannelSettlement on Sepolia
  usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address, // Circle USDC on Sepolia
  pyth: '0xDd24F84d36BF92C65F92307595335bdFab5Bbd21' as Address, // Pyth on Sepolia
};
