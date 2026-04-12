import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useGetHistory, useGetHistoryStats, useAnalyzeProduct, getGetHistoryQueryKey, getGetHistoryStatsQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FitScoreCard } from "@/components/fit-score-card";
import { Search, Sparkles, Clock, ArrowUpRight, BarChart3, Activity } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: history, isLoading: historyLoading } = useGetHistory({
    query: {
      queryKey: getGetHistoryQueryKey()
    }
  });

  const { data: stats, isLoading: statsLoading } = useGetHistoryStats({
    query: {
      queryKey: getGetHistoryStatsQueryKey()
    }
  });

  const analyzeMutation = useAnalyzeProduct();
  const [currentResult, setCurrentResult] = useState<any>(null);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setCurrentResult(null);
    analyzeMutation.mutate(
      { data: { url } },
      {
        onSuccess: (data) => {
          setCurrentResult(data);
          queryClient.invalidateQueries({ queryKey: getGetHistoryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetHistoryStatsQueryKey() });
          setUrl("");
        },
        onError: (err: any) => {
          toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-12">
        
        {/* Header & Stats */}
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name?.split(' ')[0] || 'User'}</h1>
              <p className="text-muted-foreground">Your personal shopping intelligence is ready.</p>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              <Card className="bg-muted/30 border-none shadow-none shrink-0 min-w-[120px]">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Total
                  </p>
                  <div className="text-2xl font-mono">{statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.totalAnalyzed || 0}</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30 border-none shadow-none shrink-0 min-w-[120px]">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" /> Avg Score
                  </p>
                  <div className="text-2xl font-mono text-primary">{statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.averageFitScore || 0}</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Main Input */}
        <section className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 rounded-3xl blur-3xl -z-10" />
          <form onSubmit={handleAnalyze} className="relative bg-card border border-border/50 shadow-2xl shadow-primary/5 rounded-2xl p-2 flex items-center transition-all focus-within:ring-2 ring-primary/20">
            <div className="pl-4 pr-2 text-muted-foreground">
              <Search className="w-5 h-5" />
            </div>
            <Input 
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste any product URL (Amazon, Zara, BestBuy...)" 
              className="border-0 shadow-none focus-visible:ring-0 text-lg h-14 bg-transparent placeholder:text-muted-foreground/60"
            />
            <Button 
              type="submit" 
              size="lg" 
              className="h-14 px-8 rounded-xl font-medium shadow-md transition-transform active:scale-95"
              disabled={analyzeMutation.isPending || !url.trim()}
            >
              {analyzeMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-bounce" style={{animationDelay: "0ms"}} />
                    <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-bounce" style={{animationDelay: "150ms"}} />
                    <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-bounce" style={{animationDelay: "300ms"}} />
                  </span>
                  <span className="ml-2">Analyzing...</span>
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Analyze
                </span>
              )}
            </Button>
          </form>
        </section>

        {/* Results Area */}
        <div className="space-y-8">
          {currentResult && (
            <div className="animate-in slide-in-from-bottom-8 fade-in duration-700">
              <h2 className="text-xl font-semibold mb-4">Latest Analysis</h2>
              <FitScoreCard result={currentResult} />
            </div>
          )}

          {/* History */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
              <Clock className="w-5 h-5" /> Recent History
            </h2>
            
            {historyLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : history && history.length > 0 ? (
              <div className="grid gap-3">
                {history.map((item: any) => (
                  <div key={item.id} className="group bg-card border rounded-xl p-4 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer shadow-sm hover:shadow-md">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold font-mono text-lg border-2 ${
                        item.fitScore >= 75 ? 'border-green-500/20 text-green-500 bg-green-500/5' : 
                        item.fitScore >= 50 ? 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5' : 
                        'border-red-500/20 text-red-500 bg-red-500/5'
                      }`}>
                        {item.fitScore}
                      </div>
                      <div>
                        <h4 className="font-medium group-hover:text-primary transition-colors">{item.productName}</h4>
                        <div className="flex gap-2 items-center mt-1">
                          <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(item.analyzedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                      <a href={item.productUrl} target="_blank" rel="noreferrer"><ArrowUpRight className="w-4 h-4" /></a>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 border border-dashed rounded-2xl bg-muted/10">
                <p className="text-muted-foreground">No analyses yet. Paste a link above to get started.</p>
              </div>
            )}
          </section>
        </div>

      </div>
    </Layout>
  );
}
