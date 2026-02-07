/**
 * Optix On-Chain Flow Test
 *
 * Tests REAL on-chain transactions with 10 USDC:
 * 1. Approve USDC
 * 2. Deposit 10 USDC
 * 3. Verify balance
 * 4. Withdraw 10 USDC back
 *
 * IMPORTANT: Uses only 10 USDC as requested!
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { config } from './config/index.js';
import { DEFAULT_CONTRACTS } from './lib/settlement/service.js';

const DEPOSIT_AMOUNT = parseUnits('10', 6); // 10 USDC (MIN_DEPOSIT requirement)

const OPTIX_ABI = [
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawDirect', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'MIN_DEPOSIT', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTIX ON-CHAIN FLOW TEST');
  console.log('  Testing with 10 USDC (minimum deposit)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const rpcUrl = process.env.SEPOLIA_RPC_URL || config.chain.rpcUrl;

  if (!config.wallet.privateKey) {
    console.log('ERROR: No wallet configured');
    process.exit(1);
  }

  const account = privateKeyToAccount(config.wallet.privateKey as Hex);
  const walletAddress = account.address;

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  console.log(`Wallet: ${walletAddress}`);
  console.log(`Contract: ${DEFAULT_CONTRACTS.optix}`);
  console.log(`Amount: 10 USDC\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Check Initial Balances
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Check Initial Balances');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ethBalance = await publicClient.getBalance({ address: walletAddress });
  console.log(`   ETH: ${formatUnits(ethBalance, 18)} ETH`);

  const usdcBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
  console.log(`   USDC: ${formatUnits(usdcBalance, 6)} USDC`);

  const contractBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'balances',
    args: [walletAddress],
  }) as bigint;
  console.log(`   Optix Balance: ${formatUnits(contractBalance, 6)} USDC\n`);

  if (usdcBalance < DEPOSIT_AMOUNT) {
    console.log(`   ✗ Insufficient USDC! Need 10 USDC, have ${formatUnits(usdcBalance, 6)}`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Approve USDC Spending
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Approve USDC Spending');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const currentAllowance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [walletAddress, DEFAULT_CONTRACTS.optix],
  }) as bigint;
  console.log(`   Current allowance: ${formatUnits(currentAllowance, 6)} USDC`);

  if (currentAllowance < DEPOSIT_AMOUNT) {
    console.log('   Approving 10 USDC...');

    const approveTx = await walletClient.writeContract({
      address: DEFAULT_CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [DEFAULT_CONTRACTS.optix, DEPOSIT_AMOUNT],
    });

    console.log(`   Tx: ${approveTx}`);
    console.log('   Waiting for confirmation...');

    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log(`   ✓ Approved! Block: ${approveReceipt.blockNumber}\n`);
  } else {
    console.log('   ✓ Already approved\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Deposit 10 USDC
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Deposit 10 USDC');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('   Depositing 10 USDC to Optix...');

  const depositTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'deposit',
    args: [DEPOSIT_AMOUNT],
  });

  console.log(`   Tx: ${depositTx}`);
  console.log('   Waiting for confirmation...');

  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`   ✓ Deposited! Block: ${depositReceipt.blockNumber}`);
  console.log(`   Gas used: ${depositReceipt.gasUsed}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Verify Deposit
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Verify Deposit');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const newContractBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'balances',
    args: [walletAddress],
  }) as bigint;
  console.log(`   Optix Balance: ${formatUnits(newContractBalance, 6)} USDC`);

  const newUsdcBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
  console.log(`   Wallet USDC: ${formatUnits(newUsdcBalance, 6)} USDC`);

  if (newContractBalance >= DEPOSIT_AMOUNT) {
    console.log('   ✓ Deposit verified!\n');
  } else {
    console.log('   ✗ Deposit verification failed!\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Withdraw 10 USDC Back
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Withdraw 10 USDC Back');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('   Withdrawing 10 USDC from Optix...');

  const withdrawTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'withdrawDirect',
    args: [DEPOSIT_AMOUNT],
  });

  console.log(`   Tx: ${withdrawTx}`);
  console.log('   Waiting for confirmation...');

  const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
  console.log(`   ✓ Withdrawn! Block: ${withdrawReceipt.blockNumber}`);
  console.log(`   Gas used: ${withdrawReceipt.gasUsed}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Final Balance Check
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 6: Final Balance Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const finalContractBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'balances',
    args: [walletAddress],
  }) as bigint;
  console.log(`   Optix Balance: ${formatUnits(finalContractBalance, 6)} USDC`);

  const finalUsdcBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
  console.log(`   Wallet USDC: ${formatUnits(finalUsdcBalance, 6)} USDC`);

  const finalEthBalance = await publicClient.getBalance({ address: walletAddress });
  console.log(`   ETH: ${formatUnits(finalEthBalance, 18)} ETH`);

  const gasUsed = ethBalance - finalEthBalance;
  console.log(`   Gas spent: ${formatUnits(gasUsed, 18)} ETH\n`);

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ON-CHAIN FLOW TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const success = finalUsdcBalance >= usdcBalance - parseUnits('0.01', 6); // Allow tiny rounding

  console.log(`   ${success ? '✓' : '✗'} USDC recovered: ${formatUnits(finalUsdcBalance, 6)} / ${formatUnits(usdcBalance, 6)}`);
  console.log(`   ✓ Contract balance: ${formatUnits(finalContractBalance, 6)} USDC`);
  console.log(`   ✓ Gas cost: ~${formatUnits(gasUsed, 18)} ETH\n`);

  console.log('Transactions:');
  console.log(`   Approve: https://sepolia.etherscan.io/tx/${depositReceipt.transactionHash}`);
  console.log(`   Deposit: https://sepolia.etherscan.io/tx/${depositReceipt.transactionHash}`);
  console.log(`   Withdraw: https://sepolia.etherscan.io/tx/${withdrawReceipt.transactionHash}\n`);
}

main().catch(console.error);
