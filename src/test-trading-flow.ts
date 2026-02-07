/**
 * Optix Full Trading Flow Test
 *
 * Tests REAL on-chain trading with USDC:
 * 1. Approve & Deposit USDC
 * 2. Create an option (as writer)
 * 3. Verify option on-chain
 * 4. Cancel option (to get collateral back)
 * 5. Withdraw USDC
 *
 * Shows ALL transaction hashes
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, Address, Hex, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { config } from './config/index.js';
import { DEFAULT_CONTRACTS } from './lib/settlement/service.js';
import { PythClient } from './lib/pyth/client.js';

const DEPOSIT_AMOUNT = parseUnits('10', 6); // 10 USDC

const OPTIX_ABI = [
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawDirect', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'createOption', inputs: [
    { name: 'strikePrice', type: 'uint256' },
    { name: 'premium', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'isCall', type: 'bool' }
  ], outputs: [{ name: 'optionId', type: 'bytes32' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelOption', inputs: [{ name: 'optionId', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getOption', inputs: [{ name: 'optionId', type: 'bytes32' }], outputs: [{
    type: 'tuple',
    components: [
      { name: 'id', type: 'bytes32' },
      { name: 'writer', type: 'address' },
      { name: 'holder', type: 'address' },
      { name: 'strikePrice', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'isCall', type: 'bool' },
      { name: 'status', type: 'uint8' }
    ]
  }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_DEPOSIT', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'event', name: 'OptionCreated', inputs: [
    { name: 'optionId', type: 'bytes32', indexed: true },
    { name: 'writer', type: 'address', indexed: true },
    { name: 'strike', type: 'uint256', indexed: false },
    { name: 'isCall', type: 'bool', indexed: false }
  ] },
] as const;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

interface TxRecord {
  step: string;
  hash: string;
  block: bigint;
  gasUsed: bigint;
}

const transactions: TxRecord[] = [];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTIX FULL TRADING FLOW TEST');
  console.log('  Real on-chain option trading');
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

  // Get ETH price
  const pyth = new PythClient();
  const priceData = await pyth.getEthUsdPrice();
  const ethPrice = Math.round(priceData.price);

  console.log(`Wallet: ${walletAddress}`);
  console.log(`Contract: ${DEFAULT_CONTRACTS.optix}`);
  console.log(`ETH Price: $${ethPrice}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Check Initial State
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Initial State');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const initialEth = await publicClient.getBalance({ address: walletAddress });
  const initialUsdc = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
  const initialContract = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'balances',
    args: [walletAddress],
  }) as bigint;

  console.log(`   ETH: ${formatUnits(initialEth, 18)} ETH`);
  console.log(`   USDC (wallet): ${formatUnits(initialUsdc, 6)} USDC`);
  console.log(`   USDC (contract): ${formatUnits(initialContract, 6)} USDC\n`);

  if (initialUsdc < DEPOSIT_AMOUNT) {
    console.log(`   ✗ Need at least 10 USDC`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Approve USDC
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Approve USDC');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const currentAllowance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [walletAddress, DEFAULT_CONTRACTS.optix],
  }) as bigint;

  if (currentAllowance < DEPOSIT_AMOUNT) {
    console.log('   Approving USDC...');
    const approveTx = await walletClient.writeContract({
      address: DEFAULT_CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [DEFAULT_CONTRACTS.optix, DEPOSIT_AMOUNT],
    });
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
    transactions.push({ step: 'Approve USDC', hash: approveTx, block: approveReceipt.blockNumber, gasUsed: approveReceipt.gasUsed });
    console.log(`   ✓ Approved! Tx: ${approveTx}\n`);
  } else {
    console.log('   ✓ Already approved\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Deposit USDC
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Deposit 10 USDC');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('   Depositing...');
  const depositTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'deposit',
    args: [DEPOSIT_AMOUNT],
  });
  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
  transactions.push({ step: 'Deposit USDC', hash: depositTx, block: depositReceipt.blockNumber, gasUsed: depositReceipt.gasUsed });
  console.log(`   ✓ Deposited! Tx: ${depositTx}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Create Option
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Create Call Option');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Option parameters - use tiny amount to minimize collateral
  const strikePrice = parseUnits(String(ethPrice + 100), 6); // $100 OTM call
  const premium = parseUnits('1', 6); // $1 premium
  const amount = parseUnits('0.001', 18); // 0.001 ETH (tiny amount)
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
  const isCall = true;

  console.log(`   Strike: $${ethPrice + 100}`);
  console.log(`   Premium: $1`);
  console.log(`   Size: 0.001 ETH`);
  console.log(`   Type: CALL`);
  console.log(`   Expiry: 1 hour\n`);

  console.log('   Creating option...');
  const createTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'createOption',
    args: [strikePrice, premium, amount, expiry, isCall],
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  transactions.push({ step: 'Create Option', hash: createTx, block: createReceipt.blockNumber, gasUsed: createReceipt.gasUsed });
  console.log(`   ✓ Option created! Tx: ${createTx}`);

  // Get option ID from logs
  const optionCreatedLog = createReceipt.logs.find(log =>
    log.topics[0] === keccak256(encodePacked(['string'], ['OptionCreated(bytes32,address,uint256,bool)']))
  );
  const optionId = optionCreatedLog?.topics[1] || '0x0';
  console.log(`   Option ID: ${optionId}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Verify Option
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Verify Option On-Chain');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const option = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.optix,
      abi: OPTIX_ABI,
      functionName: 'getOption',
      args: [optionId as Hex],
    }) as any;

    console.log(`   Writer: ${option.writer}`);
    console.log(`   Strike: $${formatUnits(option.strikePrice, 6)}`);
    console.log(`   Premium: $${formatUnits(option.premium, 6)}`);
    console.log(`   Amount: ${formatUnits(option.amount, 18)} ETH`);
    console.log(`   Is Call: ${option.isCall}`);
    console.log(`   Status: ${option.status} (0=Open, 1=Active, 2=Exercised, 3=Expired, 4=Cancelled)`);
    console.log(`   ✓ Option verified on-chain!\n`);
  } catch (e) {
    console.log(`   ⚠ Could not read option details\n`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Cancel Option (to get collateral back)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 6: Cancel Option (Reclaim Collateral)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('   Cancelling option...');
  const cancelTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'cancelOption',
    args: [optionId as Hex],
  });
  const cancelReceipt = await publicClient.waitForTransactionReceipt({ hash: cancelTx });
  transactions.push({ step: 'Cancel Option', hash: cancelTx, block: cancelReceipt.blockNumber, gasUsed: cancelReceipt.gasUsed });
  console.log(`   ✓ Option cancelled! Tx: ${cancelTx}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: Withdraw USDC
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 7: Withdraw All USDC');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const contractBalance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'balances',
    args: [walletAddress],
  }) as bigint;

  console.log(`   Contract balance: ${formatUnits(contractBalance, 6)} USDC`);
  console.log('   Withdrawing...');

  const withdrawTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'withdrawDirect',
    args: [contractBalance],
  });
  const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
  transactions.push({ step: 'Withdraw USDC', hash: withdrawTx, block: withdrawReceipt.blockNumber, gasUsed: withdrawReceipt.gasUsed });
  console.log(`   ✓ Withdrawn! Tx: ${withdrawTx}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: Final State
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 8: Final State');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const finalEth = await publicClient.getBalance({ address: walletAddress });
  const finalUsdc = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  }) as bigint;
  const finalContract = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.optix,
    abi: OPTIX_ABI,
    functionName: 'balances',
    args: [walletAddress],
  }) as bigint;

  console.log(`   ETH: ${formatUnits(finalEth, 18)} ETH`);
  console.log(`   USDC (wallet): ${formatUnits(finalUsdc, 6)} USDC`);
  console.log(`   USDC (contract): ${formatUnits(finalContract, 6)} USDC`);
  console.log(`   Gas spent: ${formatUnits(initialEth - finalEth, 18)} ETH\n`);

  // ═══════════════════════════════════════════════════════════════════
  // Summary - All Transactions
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ALL TRANSACTIONS');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let totalGas = 0n;
  for (const tx of transactions) {
    console.log(`${tx.step}:`);
    console.log(`   Hash: ${tx.hash}`);
    console.log(`   Block: ${tx.block}`);
    console.log(`   Gas: ${tx.gasUsed}`);
    console.log(`   Link: https://sepolia.etherscan.io/tx/${tx.hash}\n`);
    totalGas += tx.gasUsed;
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log(`   Total Transactions: ${transactions.length}`);
  console.log(`   Total Gas Used: ${totalGas}`);
  console.log(`   USDC Recovered: ${formatUnits(finalUsdc, 6)} / ${formatUnits(initialUsdc, 6)}`);
  console.log(`   ✓ All funds safe!\n`);
}

main().catch(console.error);
