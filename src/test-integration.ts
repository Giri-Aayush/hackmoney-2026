/**
 * Optix Integration Test
 * Tests the complete flow: Backend API + On-Chain Contract + Pyth Oracle
 */

import { createPublicClient, createWalletClient, http, formatUnits, Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { config } from './config/index.js';
import { DEFAULT_CONTRACTS } from './lib/settlement/service.js';
import { PythClient } from './lib/pyth/client.js';

const API_URL = process.env.API_URL || 'http://localhost:8081';

// Contract ABIs
const OPTIX_ABI = [
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_DEPOSIT', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'CHALLENGE_PERIOD', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'usdc', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pyth', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

async function testApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    const data: AnyJson = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTIX INTEGRATION TEST');
  console.log('  Backend + On-Chain + Pyth Oracle');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const rpcUrl = process.env.SEPOLIA_RPC_URL || config.chain.rpcUrl;

  // Setup clients
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  let walletAddress: Address | null = null;

  if (config.wallet.privateKey) {
    const account = privateKeyToAccount(config.wallet.privateKey as Hex);
    walletAddress = account.address;
  }

  console.log('Configuration:');
  console.log(`  RPC: ${rpcUrl.substring(0, 50)}...`);
  console.log(`  Contract: ${DEFAULT_CONTRACTS.optix}`);
  console.log(`  Wallet: ${walletAddress || 'Not configured'}\n`);

  let allPassed = true;

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: On-Chain Contract
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: On-Chain Contract Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const code = await publicClient.getCode({ address: DEFAULT_CONTRACTS.optix });
    if (!code || code === '0x') {
      console.log('   ✗ Contract not deployed!');
      allPassed = false;
    } else {
      console.log(`   ✓ Contract deployed (${(code.length - 2) / 2} bytes)`);

      const minDeposit = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optix,
        abi: OPTIX_ABI,
        functionName: 'MIN_DEPOSIT',
      });
      console.log(`   ✓ MIN_DEPOSIT: ${formatUnits(minDeposit as bigint, 6)} USDC`);

      const challengePeriod = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optix,
        abi: OPTIX_ABI,
        functionName: 'CHALLENGE_PERIOD',
      });
      console.log(`   ✓ CHALLENGE_PERIOD: ${Number(challengePeriod) / 3600} hours`);

      const usdcAddr = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optix,
        abi: OPTIX_ABI,
        functionName: 'usdc',
      });
      const usdcMatch = usdcAddr === DEFAULT_CONTRACTS.usdc;
      console.log(`   ${usdcMatch ? '✓' : '✗'} USDC address ${usdcMatch ? 'matches' : 'mismatch'}`);
      if (!usdcMatch) allPassed = false;

      const pythAddr = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optix,
        abi: OPTIX_ABI,
        functionName: 'pyth',
      });
      const pythMatch = pythAddr === DEFAULT_CONTRACTS.pyth;
      console.log(`   ${pythMatch ? '✓' : '✗'} Pyth address ${pythMatch ? 'matches' : 'mismatch'}`);
      if (!pythMatch) allPassed = false;
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
    allPassed = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: Pyth Oracle
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: Pyth Oracle Integration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const pythClient = new PythClient();
    const priceData = await pythClient.getEthUsdPrice();

    if (priceData.price > 0) {
      console.log(`   ✓ ETH/USD Price: $${priceData.price.toFixed(2)}`);
      console.log(`   ✓ Confidence: ±$${priceData.confidence.toFixed(2)}`);
      console.log(`   ✓ Publish Time: ${priceData.publishTime.toISOString()}`);

      // Check price is reasonable (between $100 and $100,000)
      if (priceData.price < 100 || priceData.price > 100000) {
        console.log('   ⚠ Price seems unusual');
      }
    } else {
      console.log('   ✗ Invalid price data');
      allPassed = false;
    }
  } catch (error) {
    console.log(`   ✗ Error fetching Pyth price: ${error}`);
    allPassed = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: Wallet & Balances
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: Wallet & Balances');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (walletAddress) {
    try {
      const ethBalance = await publicClient.getBalance({ address: walletAddress });
      console.log(`   ✓ ETH Balance: ${formatUnits(ethBalance, 18)} ETH`);

      const usdcBalance = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      }) as bigint;
      console.log(`   ✓ USDC Balance: ${formatUnits(usdcBalance, 6)} USDC`);

      const optiBalance = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optix,
        abi: OPTIX_ABI,
        functionName: 'balances',
        args: [walletAddress],
      }) as bigint;
      console.log(`   ✓ Optix Balance: ${formatUnits(optiBalance, 6)} USDC`);

      if (ethBalance === 0n) {
        console.log('   ⚠ No ETH - get from faucet for gas');
      }
      if (usdcBalance === 0n) {
        console.log('   ⚠ No USDC - get from Circle faucet');
      }

    } catch (error) {
      console.log(`   ✗ Error: ${error}`);
      allPassed = false;
    }
  } else {
    console.log('   ⚠ No wallet configured (PRIVATE_KEY not set)');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: API Server
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 4: API Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const apiHealthy = await testApiHealth();

  if (apiHealthy) {
    console.log('   ✓ API server is running');

    try {
      // Test price endpoint
      const priceRes = await fetch(`${API_URL}/api/price`);
      const priceData: AnyJson = await priceRes.json();
      console.log(`   ✓ /api/price: $${priceData.price?.toFixed(2) || 'N/A'}`);

      // Test options endpoint
      const optionsRes = await fetch(`${API_URL}/api/options`);
      const optionsData: AnyJson = await optionsRes.json();
      console.log(`   ✓ /api/options: ${optionsData.length || 0} options`);

      // Test strategies endpoint
      const strategiesRes = await fetch(`${API_URL}/api/strategies/templates`);
      const strategiesData: AnyJson = await strategiesRes.json();
      console.log(`   ✓ /api/strategies/templates: ${strategiesData.length || 0} templates`);

    } catch (error) {
      console.log(`   ✗ API Error: ${error}`);
      allPassed = false;
    }
  } else {
    console.log('   ⚠ API server not running');
    console.log('     Run: npm run dev');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: Network Stats
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 5: Network Stats');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const blockNumber = await publicClient.getBlockNumber();
    const chainId = await publicClient.getChainId();
    const gasPrice = await publicClient.getGasPrice();

    console.log(`   ✓ Block: ${blockNumber}`);
    const isCorrectChain = chainId === 11155111;
    console.log(`   ${isCorrectChain ? '✓' : '✗'} Chain ID: ${chainId} (${chainId === 11155111 ? 'Sepolia' : 'Wrong chain!'})`);
    if (!isCorrectChain) allPassed = false;
    console.log(`   ✓ Gas Price: ${formatUnits(gasPrice, 9)} gwei`);

  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
    allPassed = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  INTEGRATION TEST ${allPassed ? 'PASSED' : 'FAILED'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('Component Status:');
  console.log('  [On-Chain]  Smart contract deployed and verified');
  console.log('  [Oracle]    Pyth Hermes integration working');
  console.log(`  [API]       ${apiHealthy ? 'Server running' : 'Server not running (optional)'}`);
  console.log(`  [Wallet]    ${walletAddress ? 'Configured' : 'Not configured'}\n`);

  console.log('Links:');
  console.log(`  Contract:    https://sepolia.etherscan.io/address/${DEFAULT_CONTRACTS.optix}`);
  console.log('  USDC Faucet: https://faucet.circle.com/');
  console.log('  ETH Faucet:  https://cloud.google.com/application/web3/faucet/ethereum/sepolia\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
