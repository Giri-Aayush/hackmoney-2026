'use client';

import { useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { useYellow } from '@/lib/yellow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// Contract addresses on Sepolia
const OPTICHANNEL_CONTRACT = '0x7779c5E338e52Be395A2A5386f8CFBf6629f67CB' as Address;

// ABI for reading balance
const BALANCE_ABI = [
  {
    name: 'balances',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

interface YellowBalanceProps {
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export function YellowBalance({ onDeposit, onWithdraw }: YellowBalanceProps) {
  const { address } = useAccount();
  const { isAuthenticated, balances, refreshBalances } = useYellow();

  // Read on-chain contract balance
  const { data: onChainBalance, refetch: refetchOnChain } = useReadContract({
    address: OPTICHANNEL_CONTRACT,
    abi: BALANCE_ABI,
    functionName: 'balances',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      refreshBalances();
    }
  }, [isAuthenticated, refreshBalances]);

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance) / 1e6; // Assuming 6 decimals for USDC
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Format on-chain balance (USDC has 6 decimals)
  const onChainBalanceFormatted = onChainBalance
    ? parseFloat(formatUnits(onChainBalance, 6)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00';

  const hasOnChainBalance = onChainBalance && onChainBalance > 0n;

  const handleRefresh = () => {
    refreshBalances();
    refetchOnChain();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-500" />
          State Channel Balance
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRefresh}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* On-Chain Contract Balance */}
        {hasOnChainBalance && (
          <div className="space-y-2 mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-emerald-400">
                ${onChainBalanceFormatted}
              </span>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
                On-Chain USDC
              </Badge>
            </div>
            <p className="text-xs text-emerald-400/70">
              Deposited to smart contract - Ready to trade!
            </p>
          </div>
        )}

        {/* Yellow Network Ledger Balance */}
        {balances.length > 0 && (
          <div className="space-y-4">
            {balances.map((balance) => (
              <div key={balance.asset} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    ${formatBalance(balance.total)}
                  </span>
                  <Badge variant="outline">{balance.symbol || balance.asset}</Badge>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Available: ${formatBalance(balance.available)}</span>
                  <span>Locked: ${formatBalance(balance.locked)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No balances message */}
        {!hasOnChainBalance && balances.length === 0 && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <p className="text-xs text-muted-foreground">
              No balances yet. Deposit funds to start trading gaslessly.
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onDeposit}
          >
            <ArrowDownRight className="h-4 w-4 mr-1" />
            Deposit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onWithdraw}
          >
            <ArrowUpRight className="h-4 w-4 mr-1" />
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
