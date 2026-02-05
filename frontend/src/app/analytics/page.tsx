'use client';

import { useApiWallet, useStrategyTemplates, useOpenInterest, useVolume } from '@/hooks/use-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  BarChart3,
  TrendingUp,
  Users,
  Target,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Zap
} from 'lucide-react';

export default function AnalyticsPage() {
  useApiWallet();
  const { data: templates, isLoading: templatesLoading } = useStrategyTemplates();
  const { data: openInterest, isLoading: oiLoading } = useOpenInterest();
  const { data: volume, isLoading: volumeLoading } = useVolume();

  return (
    <div className="container py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Market insights and strategy templates
          </p>
        </div>

        {/* Market Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">24h Volume</CardTitle>
              <Activity className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <span className="gradient-text">$</span>{volume?.volume24h?.toFixed(2) || '0.00'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Trading volume
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">24h Trades</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {volume?.tradeCount24h || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Completed trades
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open Interest</CardTitle>
              <BarChart3 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {openInterest?.totalOpenInterest || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active contracts
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Traders</CardTitle>
              <Users className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {volume?.uniqueTraders24h || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active participants
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Open Interest by Strike */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-500" />
              <CardTitle>Open Interest by Strike</CardTitle>
            </div>
            <CardDescription>Distribution of options across strike prices</CardDescription>
          </CardHeader>
          <CardContent>
            {oiLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-20 h-5 rounded bg-muted/50 animate-pulse" />
                    <div className="flex-1 h-4 rounded-full bg-muted/50 animate-pulse" />
                    <div className="w-28 h-5 rounded bg-muted/50 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : !openInterest?.byStrike || openInterest.byStrike.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-amber-500/10 mb-4">
                  <BarChart3 className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="font-semibold mb-2">No Open Interest Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Open interest data will appear here once options are created and traded.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {openInterest.byStrike.map((item) => (
                  <div key={item.strike} className="flex items-center gap-4">
                    <div className="w-24 text-sm font-medium font-mono">
                      ${item.strike.toLocaleString()}
                    </div>
                    <div className="flex-1">
                      <div className="flex h-6 rounded-full overflow-hidden bg-white/5">
                        <div
                          className="bg-emerald-500 transition-all flex items-center justify-center"
                          style={{
                            width: `${(item.calls / (item.total || 1)) * 100}%`,
                          }}
                        >
                          {item.calls > 0 && (
                            <span className="text-[10px] text-white font-medium">{item.calls}</span>
                          )}
                        </div>
                        <div
                          className="bg-red-500 transition-all flex items-center justify-center"
                          style={{
                            width: `${(item.puts / (item.total || 1)) * 100}%`,
                          }}
                        >
                          {item.puts > 0 && (
                            <span className="text-[10px] text-white font-medium">{item.puts}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="w-36 flex gap-3 text-sm">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <ArrowUpRight className="h-3 w-3" />
                        {item.calls} Calls
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <ArrowDownRight className="h-3 w-3" />
                        {item.puts} Puts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Strategy Templates */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-amber-500" />
              <CardTitle>Strategy Templates</CardTitle>
            </div>
            <CardDescription>
              Pre-built options strategies for different market conditions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="p-4 rounded-lg border border-white/5 bg-white/[0.01]">
                    <div className="h-5 w-32 rounded bg-muted/50 animate-pulse mb-3" />
                    <div className="h-4 w-full rounded bg-muted/50 animate-pulse mb-2" />
                    <div className="h-4 w-3/4 rounded bg-muted/50 animate-pulse mb-4" />
                    <div className="flex gap-2">
                      <div className="h-6 w-16 rounded-full bg-muted/50 animate-pulse" />
                      <div className="h-6 w-16 rounded-full bg-muted/50 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <Layers className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No Strategy Templates</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Strategy templates will be available soon. Check back later!
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg border border-white/5 bg-white/[0.01] hover:border-amber-500/30 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">{template.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {template.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {template.legs.map((leg, j) => (
                        <Badge
                          key={j}
                          variant="outline"
                          className={
                            leg.type === 'call'
                              ? 'border-emerald-500/50 text-emerald-500 bg-emerald-500/5'
                              : 'border-red-500/50 text-red-500 bg-red-500/5'
                          }
                        >
                          {leg.position} {leg.type}
                          {leg.strikeOffset !== 0 &&
                            ` (${leg.strikeOffset > 0 ? '+' : ''}${leg.strikeOffset}%)`}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 pt-3 border-t border-white/5">
                      <div className="flex justify-between">
                        <span>Max Profit:</span>
                        <span className="text-emerald-500 font-medium">{template.maxProfit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Loss:</span>
                        <span className="text-red-500 font-medium">{template.maxLoss}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Breakeven:</span>
                        <span className="font-medium">{template.breakeven}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Banner */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-500">Real-time Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  All analytics data is updated in real-time from the Yellow Network state channels.
                  Start the backend server to see live data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
