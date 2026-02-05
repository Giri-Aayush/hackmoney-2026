'use client';

import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOptionStats } from '@/hooks/use-api';

export function StatsCard() {
  const { data: stats, isLoading, error } = useOptionStats();

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Open Options</CardTitle>
        <FileText className="h-4 w-4 text-purple-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <div className="h-8 w-12 rounded bg-muted animate-pulse mb-1" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </>
        ) : error || !stats ? (
          <>
            <div className="text-2xl font-bold text-muted-foreground">0</div>
            <p className="text-xs text-muted-foreground mt-1">of 0 total</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{stats.openOptions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {stats.totalOptions} total
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
