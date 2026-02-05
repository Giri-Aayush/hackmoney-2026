'use client';

import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOpenInterest } from '@/hooks/use-api';

export function OpenInterestCard() {
  const { data: oi, isLoading, error } = useOpenInterest();

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Open Interest</CardTitle>
        <BarChart3 className="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <div className="h-8 w-16 rounded bg-muted animate-pulse mb-1" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          </>
        ) : error || !oi ? (
          <>
            <div className="text-2xl font-bold text-muted-foreground">0</div>
            <p className="text-xs text-muted-foreground mt-1">Active contracts</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{oi.totalOpenInterest}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active contract{oi.totalOpenInterest !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
