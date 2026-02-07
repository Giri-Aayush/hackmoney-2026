'use client';

import { useAccount } from 'wagmi';
import { useTradingBalance } from '@/hooks/use-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Zap, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface YellowBalanceProps {
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export function YellowBalance({ onDeposit, onWithdraw }: YellowBalanceProps) {
  const { address, isConnected } = useAccount();
  const { data: tradingBalance, isLoading } = useTradingBalance();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['trading-balance'] });
  };

  const available = tradingBalance?.available ?? 0;
  const locked = tradingBalance?.locked ?? 0;
  const hasBalance = available > 0 || locked > 0;

  if (!isConnected) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Trading Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to view balance
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Trading Balance
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
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-8 w-24 animate-pulse bg-white/10 rounded" />
            <div className="h-4 w-32 animate-pulse bg-white/5 rounded" />
          </div>
        ) : hasBalance ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-amber-400">
                  ${available.toFixed(2)}
                </span>
                <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                  USDC
                </Badge>
              </div>
              <p className="text-xs text-amber-400/70 mt-1">
                Available for gasless trading
              </p>
            </div>
            {locked > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Locked in positions:</span>
                <span>${locked.toFixed(2)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-5 w-5" />
              <span className="text-lg font-medium">$0.00</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Deposit USDC to start trading gaslessly
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-amber-500/30 hover:bg-amber-500/10"
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
            disabled={!hasBalance}
          >
            <ArrowUpRight className="h-4 w-4 mr-1" />
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
