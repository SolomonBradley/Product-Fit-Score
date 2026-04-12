import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBoostScore } from "@workspace/api-client-react";
import { Share, Zap, AlertTriangle, Check, Info, ChevronRight } from "lucide-react";
import type { FitScoreResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export function FitScoreCard({ result: initialResult }: { result: FitScoreResult }) {
  const [result, setResult] = useState<FitScoreResult>(initialResult);
  const boostMutation = useBoostScore();
  const { toast } = useToast();
  
  // Update state if props change (e.g. new analysis)
  useEffect(() => {
    setResult(initialResult);
  }, [initialResult]);

  const handleBoost = (feature: string) => {
    boostMutation.mutate(
      { data: { productUrl: result.productUrl, boostedFeature: feature } },
      {
        onSuccess: (newResult) => {
          setResult(newResult);
          toast({
            title: "Score Boosted!",
            description: `We recalculated considering how much you care about ${feature}.`,
          });
        }
      }
    );
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(
      `I got a Fit Score of ${result.fitScore} for ${result.productName}! Check it out.`
    );
    toast({ title: "Copied to clipboard" });
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };
  
  const getRiskColor = (level: string) => {
    switch(level.toLowerCase()) {
      case "low": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "medium": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "high": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-8 items-center border-b bg-muted/10 relative overflow-hidden">
        {/* Background glow based on score */}
        <div 
          className={`absolute -inset-4 opacity-10 blur-3xl rounded-full ${
            result.fitScore >= 75 ? 'bg-green-500' : result.fitScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
          }`} 
          style={{ transition: 'background-color 1s ease' }}
        />

        <div className="relative z-10 flex-shrink-0 flex flex-col items-center justify-center w-32 h-32 rounded-full border-8 border-background bg-card shadow-xl">
          <span className={`text-4xl font-bold font-mono tracking-tighter ${getScoreColor(result.fitScore)} transition-colors duration-500`}>
            {result.fitScore}
          </span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fit Score</span>
        </div>

        <div className="relative z-10 flex-1 text-center md:text-left space-y-2">
          <Badge variant="outline" className="mb-2 font-mono uppercase tracking-wider text-[10px]">
            {result.category}
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">{result.productName}</h2>
          <a href={result.productUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
            View original product <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-px bg-border">
        <div className="bg-card p-6 sm:p-8 space-y-6">
          <div className="space-y-4">
            <h3 className="flex items-center text-lg font-semibold gap-2">
              <Check className="w-5 h-5 text-green-500" />
              Why it fits YOU
            </h3>
            <ul className="space-y-3">
              {result.whyItFitsYou.map((reason, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-3 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 mt-1.5 flex-shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4 pt-6 border-t">
            <h3 className="flex items-center text-lg font-semibold gap-2">
              <Info className="w-5 h-5 text-yellow-500" />
              Why it may NOT
            </h3>
            <ul className="space-y-3">
              {result.whyItMayNot.map((reason, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-3 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/50 mt-1.5 flex-shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-card p-6 sm:p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center text-lg font-semibold gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Risk Factors
              </h3>
              <Badge variant="outline" className={getRiskColor(result.riskLevel)}>
                {result.riskLevel} Risk
              </Badge>
            </div>
            {result.riskFactors.length > 0 ? (
              <ul className="space-y-3">
                {result.riskFactors.map((factor, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-3 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 mt-1.5 flex-shrink-0" />
                    {factor}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">No significant risk factors identified.</p>
            )}
          </div>

          <div className="space-y-5 pt-6 border-t">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Feature Breakdown</h3>
            {Object.entries(result.featureScores).map(([feature, score]) => {
              if (score === null || score === undefined) return null;
              return (
                <div key={feature} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="capitalize">{feature}</span>
                    <span>{score}/10</span>
                  </div>
                  <Progress value={score * 10} className="h-1.5" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(result.boostableFeatures?.length > 0 || true) && (
        <div className="p-6 bg-primary/5 border-t border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="font-semibold text-sm flex items-center justify-center sm:justify-start gap-1">
              <Zap className="w-4 h-4 text-primary fill-primary/20" /> 
              Improve your score
            </h4>
            <p className="text-xs text-muted-foreground">Tell us what matters most to you</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {(result.boostableFeatures?.length > 0 ? result.boostableFeatures : ["Value", "Design"]).map(feature => (
              <Button 
                key={feature} 
                variant="outline" 
                size="sm" 
                className="bg-background"
                onClick={() => handleBoost(feature)}
                disabled={boostMutation.isPending}
              >
                Boost {feature}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 border-t flex justify-center bg-muted/5">
        <Button variant="ghost" size="sm" onClick={copyToClipboard} className="text-muted-foreground">
          <Share className="w-4 h-4 mr-2" /> Share Analysis
        </Button>
      </div>
    </div>
  );
}

