'use client';

import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePrice } from '@/hooks/use-api';

export function PriceCard() {
  const { data: price, isLoading, error } = usePrice();

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">ETH/USD</CardTitle>
        <TrendingUp className="h-4 w-4 text-emerald-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <div className="h-8 w-28 rounded bg-muted animate-pulse mb-1" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </>
        ) : error || !price ? (
          <>
            <div className="text-2xl font-bold text-muted-foreground">--</div>
            <p className="text-xs text-red-500 mt-1">Unable to fetch price</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">
              ${price.price.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-emerald-500 border-emerald-500/30">
                Pyth
              </Badge>
              <span className="text-xs text-muted-foreground">
                ±{((price.confidence || 0) / price.price * 100).toFixed(4)}%
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
