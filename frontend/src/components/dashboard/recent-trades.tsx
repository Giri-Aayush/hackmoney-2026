'use client';

import { ArrowUpRight, ArrowDownRight, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRecentTrades } from '@/hooks/use-api';

export function RecentTrades() {
  const { data: trades, isLoading, error } = useRecentTrades(10);

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center gap-2">
        <History className="h-5 w-5 text-emerald-500" />
        <CardTitle>Recent Trades</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-24 rounded bg-muted animate-pulse mb-1" />
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                </div>
                <div className="text-right">
                  <div className="h-4 w-16 rounded bg-muted animate-pulse mb-1" />
                  <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : error || !trades || trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-3 rounded-full bg-muted mb-4">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">No Trades Yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Recent trades will appear here. Be the first to trade!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {trade.type === 'buy' ? (
                    <div className="p-2 rounded-full bg-emerald-500/10">
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-full bg-red-500/10">
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {trade.type === 'buy' ? 'Bought' : 'Sold'} Option
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {trade.buyer.slice(0, 6)}...{trade.buyer.slice(-4)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    ${trade.price.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
