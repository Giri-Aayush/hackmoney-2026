'use client';

import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVolume } from '@/hooks/use-api';

export function VolumeCard() {
  const { data: volume, isLoading, error } = useVolume();

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">24h Volume</CardTitle>
        <Activity className="h-4 w-4 text-blue-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <div className="h-8 w-24 rounded bg-muted animate-pulse mb-1" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          </>
        ) : error || !volume ? (
          <>
            <div className="text-2xl font-bold text-muted-foreground">$0.00</div>
            <p className="text-xs text-muted-foreground mt-1">0 trades</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">
              ${volume.volume24h.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {volume.tradeCount24h} trade{volume.tradeCount24h !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
