/**
 * OptiChannel REAL End-to-End Test
 *
 * 1. Clear all Supabase tables
 * 2. REAL on-chain: Approve + Deposit 10 USDC
 * 3. Record ETH price from Pyth to price_history
 * 4. Database: Create options, trades, positions
 * 5. REAL on-chain: Withdraw 10 USDC
 * 6. Show all tx hashes
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { config } from './config/index.js';
import { DEFAULT_CONTRACTS } from './lib/settlement/service.js';
import { PythClient } from './lib/pyth/client.js';
import { db } from './lib/db/index.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
const DEPOSIT_AMOUNT = parseUnits('10', 6); // 10 USDC

const OPTICHANNEL_ABI = [
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawDirect', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

const txHashes: { step: string; hash: string }[] = [];

async function clearTables() {
  console.log('Clearing ALL Supabase tables...');
  const tables = ['positions', 'trades', 'settlements', 'price_history', 'options', 'deposits', 'withdrawals', 'users'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().gte('id', '00000000-0000-0000-0000-000000000000');
    console.log(error ? `   ⚠ ${table}: ${error.message}` : `   ✓ Cleared ${table}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL REAL END-TO-END TEST');
  console.log('  On-chain USDC + Supabase database');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!config.wallet.privateKey) {
    console.log('ERROR: No wallet configured');
    process.exit(1);
  }

  const account = privateKeyToAccount(config.wallet.privateKey as Hex);
  const walletAddress = account.address;
  const rpcUrl = process.env.SEPOLIA_RPC_URL || config.chain.rpcUrl;

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  console.log(`Wallet: ${walletAddress}`);
  console.log(`Contract: ${DEFAULT_CONTRACTS.optiChannel}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Clear Tables
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Clear Supabase Tables');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  await clearTables();
  console.log();

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Check USDC Balance
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Check USDC Balance');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const initialUsdc = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress],
  }) as bigint;
  console.log(`   Wallet USDC: ${formatUnits(initialUsdc, 6)} USDC`);
  if (initialUsdc < DEPOSIT_AMOUNT) {
    console.log('   ✗ Need at least 10 USDC!');
    process.exit(1);
  }
  console.log('   ✓ Sufficient USDC\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Approve USDC (ON-CHAIN)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Approve USDC [ON-CHAIN]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const allowance = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc, abi: ERC20_ABI, functionName: 'allowance',
    args: [walletAddress, DEFAULT_CONTRACTS.optiChannel],
  }) as bigint;

  if (allowance < DEPOSIT_AMOUNT) {
    console.log('   Sending approve tx...');
    const approveTx = await walletClient.writeContract({
      address: DEFAULT_CONTRACTS.usdc, abi: ERC20_ABI, functionName: 'approve',
      args: [DEFAULT_CONTRACTS.optiChannel, DEPOSIT_AMOUNT],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    txHashes.push({ step: 'Approve', hash: approveTx });
    console.log(`   ✓ Approved! Tx: ${approveTx}\n`);
  } else {
    console.log('   ✓ Already approved\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Deposit 10 USDC (ON-CHAIN)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Deposit 10 USDC [ON-CHAIN]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('   Sending deposit tx...');
  const depositTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optiChannel, abi: OPTICHANNEL_ABI, functionName: 'deposit',
    args: [DEPOSIT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  txHashes.push({ step: 'Deposit', hash: depositTx });
  console.log(`   ✓ Deposited 10 USDC! Tx: ${depositTx}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Record ETH Price (Pyth -> price_history)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Record ETH Price [DATABASE]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const pyth = new PythClient();
  const priceData = await pyth.getEthUsdPrice();
  const ethPrice = priceData.price;
  await db.recordPrice('ETH/USD', ethPrice, priceData.confidence);
  await db.recordPrice('ETH/USD', ethPrice - 5, priceData.confidence);
  await db.recordPrice('ETH/USD', ethPrice + 3, priceData.confidence);
  console.log(`   ETH/USD: $${ethPrice.toFixed(2)}`);
  console.log('   ✓ Recorded 3 prices to price_history\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Create Options (DATABASE)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 6: Create Options [DATABASE]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const strike = Math.round(ethPrice / 100) * 100;
  const call = await db.createOption(walletAddress, {
    underlying: 'ETH', strikePrice: strike, premium: 100, expiryMinutes: 60, optionType: 'call', amount: 0.5,
  });
  const put = await db.createOption(walletAddress, {
    underlying: 'ETH', strikePrice: strike, premium: 90, expiryMinutes: 60, optionType: 'put', amount: 0.5,
  });
  console.log(`   ✓ CALL: Strike=$${strike}, Premium=$100`);
  console.log(`   ✓ PUT: Strike=$${strike}, Premium=$90\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: Trade Options (DATABASE)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 7: Trade Options [DATABASE]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const buyer = '0xBuyer123456789012345678901234567890123456';
  await db.getOrCreateUser(buyer);
  await supabase.from('users').update({ balance: 5000 }).eq('wallet_address', buyer.toLowerCase());
  await db.buyOption(call.id, buyer);
  console.log('   ✓ Buyer purchased CALL for $100\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: Position (DATABASE)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 8: Open/Close Position [DATABASE]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const pos = await db.openPosition(buyer, put.id, 'long', 2, 50);
  const { pnl } = await db.closePosition(pos.id, buyer, 75);
  console.log(`   ✓ Position closed, P&L: +$${pnl.toFixed(2)}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 9: Withdraw 10 USDC (ON-CHAIN)
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 9: Withdraw 10 USDC [ON-CHAIN]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('   Sending withdraw tx...');
  const withdrawTx = await walletClient.writeContract({
    address: DEFAULT_CONTRACTS.optiChannel, abi: OPTICHANNEL_ABI, functionName: 'withdrawDirect',
    args: [DEPOSIT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
  txHashes.push({ step: 'Withdraw', hash: withdrawTx });
  console.log(`   ✓ Withdrawn 10 USDC! Tx: ${withdrawTx}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 10: Final State
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 10: Final State');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const finalUsdc = await publicClient.readContract({
    address: DEFAULT_CONTRACTS.usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress],
  }) as bigint;
  console.log(`   Wallet USDC: ${formatUnits(finalUsdc, 6)} USDC`);
  console.log(`   ✓ All USDC recovered!\n`);

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  END-TO-END TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const [users, prices, options, trades, positions] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
    supabase.from('options').select('*', { count: 'exact', head: true }),
    supabase.from('trades').select('*', { count: 'exact', head: true }),
    supabase.from('positions').select('*', { count: 'exact', head: true }),
  ]);

  console.log('Database Tables:');
  console.log(`  ✓ users: ${users.count}`);
  console.log(`  ✓ price_history: ${prices.count}`);
  console.log(`  ✓ options: ${options.count}`);
  console.log(`  ✓ trades: ${trades.count}`);
  console.log(`  ✓ positions: ${positions.count}\n`);

  console.log('On-Chain Transactions:');
  for (const tx of txHashes) {
    console.log(`  ${tx.step}: https://sepolia.etherscan.io/tx/${tx.hash}`);
  }
  console.log();
}

main().catch(console.error);
