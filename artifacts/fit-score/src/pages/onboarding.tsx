import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUpdateProfile, useGetProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ChevronRight, ChevronLeft, Search, ShoppingBag, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout";
import type { UpdateProfileBody } from "@workspace/api-client-react/src/generated/api.schemas";
import ArScanner from "@/components/ar-scanner";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

const ALL_INTERESTS = [
  "Photography", "Vlogging", "Fitness", "Skincare", "Gaming", "Travel", "Tech", "Fashion",
  "Music", "Content Creation", "Cooking", "Hiking", "Reading", "Yoga", "Running", "Cycling",
  "Dance", "Art", "Movies", "Sports", "Gadgets", "Beauty", "Home Decor", "Pets", "Cars",
  "Sustainability", "Coffee", "Wine", "Streetwear", "Sneakers", "Luxury", "Budget", "Outdoor",
  "DIY", "Coding", "Design", "Investing", "Health", "Wellness", "Minimalism"
];

// Popular brands by category for the Brand Intelligence picker
const BRAND_CATEGORIES: Record<string, string[]> = {
  "Fashion & Apparel": ["Zara", "H&M", "Uniqlo", "Myntra", "Ajio", "Nykaa Fashion", "FabIndia", "W", "Biba", "Mango", "Forever 21", "Nike", "Adidas", "Puma", "Levi's", "Arrow", "Van Heusen"],
  "Electronics & Tech": ["Apple", "Samsung", "OnePlus", "Xiaomi", "Realme", "Sony", "LG", "Dell", "HP", "Lenovo", "Bose", "JBL", "boAt", "Noise", "Philips"],
  "Beauty & Skincare": ["Nykaa", "Sephora", "L'Oreal", "Lakme", "Maybelline", "Mamaearth", "Plum", "The Ordinary", "Dot & Key", "Sugar", "Minimalist", "WOW"],
  "Sports & Fitness": ["Nike", "Adidas", "Decathlon", "Puma", "Reebok", "Under Armour", "Skechers", "New Balance", "Columbia", "Wildcraft"],
  "Home & Lifestyle": ["IKEA", "Pepperfry", "Urban Ladder", "Home Centre", "Westside Home", "FabFurnish", "Bombay Dyeing"],
  "Food & Grocery": ["BigBasket", "Blinkit", "Swiggy Instamart", "Zepto", "Nature's Basket", "Organic India"],
  "Luxury": ["Gucci", "Prada", "Louis Vuitton", "Burberry", "Coach", "Michael Kors", "Calvin Klein", "Tommy Hilfiger"],
};

const SHOPPING_CATS = ["fashion", "electronics", "beauty", "sports", "home", "food", "books", "luxury", "general"];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [hasInitialized, setHasInitialized] = useState(false);
  const totalSteps = 5;

  const { data: existingProfile, isLoading: isFetchingProfile } = useGetProfile({
    query: {
      retry: false,
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // If user is already completed, they shouldn't be here. 
    // Redirect to dashboard UNLESS force=1 is passed to allow re-syncing!
    if (user?.onboardingCompleted && params.get("force") !== "1") {
      setLocation("/dashboard");
      return;
    }

    if (params.get("gmail_success") === "1") {
      // 1. Force state update locally
      if (user) updateUser({ ...user, onboardingCompleted: true });
      // 2. Clear cache to ensure any subsequent /me calls are fresh
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      // 3. Go to dashboard
      setLocation("/dashboard");
    } else if (params.get("gmail_error")) {
      setStep(5); // Stay on the Gmail step to see the error
      toast({ title: "Sync Failed", description: params.get("gmail_error") || "An unknown error occurred.", variant: "destructive" });
    }
  }, [user, updateUser, setLocation, toast, queryClient]);

  // Sync existing profile data into local state and skip steps if already filled
  useEffect(() => {
    if (existingProfile && !hasInitialized) {
      setProfile({
        name: existingProfile.name,
        gender: existingProfile.gender as any,
        height: existingProfile.height,
        weight: existingProfile.weight,
        apparel: existingProfile.apparel as any,
        arMeasurements: existingProfile.arMeasurements as any,
        interests: existingProfile.interests as any,
        emailIntegration: existingProfile.emailIntegration as any,
      });
      
      // Calculate the correct step based on progress
      if (existingProfile.interests?.length > 0) {
        setStep(5);
      } else if (existingProfile.arMeasurements?.chest || existingProfile.apparel?.preferredFit) {
        setStep(4);
      } else if (existingProfile.height && existingProfile.weight) {
        setStep(2);
      }
      setHasInitialized(true);
    } else if (!isFetchingProfile && !hasInitialized) {
      setHasInitialized(true);
    }
  }, [existingProfile, isFetchingProfile, hasInitialized]);

  const updateProfileMutation = useUpdateProfile();

  const [profile, setProfile] = useState<UpdateProfileBody>({
    name: user?.name ?? "",
    gender: "prefer_not_to_say",
    height: null,
    weight: null,
    apparel: { topSize: "M", bottomSize: "32" },
    arMeasurements: { chest: null, waist: null, hips: null, inseam: null },
    interests: [],
    emailIntegration: { connected: false, categories: [], brands: [], recentOrders: [] }
  });

  const [interestSearch, setInterestSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [selectedBrandCat, setSelectedBrandCat] = useState<string>("Fashion & Apparel");
  const [selectedShoppingCats, setSelectedShoppingCats] = useState<string[]>([]);

  const toggleBrand = (brand: string) => {
    const current = profile.emailIntegration.brands;
    const isSelected = current.includes(brand);
    const updated = isSelected ? current.filter((b) => b !== brand) : [...current, brand];
    setProfile((p) => ({
      ...p,
      emailIntegration: { ...p.emailIntegration, connected: updated.length > 0, brands: updated },
    }));
  };

  const toggleShoppingCat = (cat: string) => {
    const updated = selectedShoppingCats.includes(cat)
      ? selectedShoppingCats.filter((c) => c !== cat)
      : [...selectedShoppingCats, cat];
    setSelectedShoppingCats(updated);
    setProfile((p) => ({
      ...p,
      emailIntegration: { ...p.emailIntegration, categories: updated },
    }));
  };

  const handleNext = () => {
    // Validate current step before proceeding
    if (step === 1) {
      if (!profile.name || profile.gender === "prefer_not_to_say" || !profile.height || !profile.weight) {
        toast({ title: "Required Fields", description: "Please complete all basic profile details.", variant: "destructive" });
        return;
      }
    }
    if (step === 2) {
      if (!profile.apparel.topSize || !profile.apparel.bottomSize) {
        toast({ title: "Required Fields", description: "Please select your apparel sizes.", variant: "destructive" });
        return;
      }
    }
    if (step === 4) {
      if (profile.interests.length === 0) {
        toast({ title: "Required Fields", description: "Please select at least one interest.", variant: "destructive" });
        return;
      }
    }

    // Save progress to database on every step!
    handleComplete(false);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleComplete = (isFinal = true) => {
    updateProfileMutation.mutate(
      { data: profile },
      {
        onSuccess: () => {
          if (isFinal) {
            if (user) updateUser({ ...user, onboardingCompleted: true });
            toast({ title: "Profile saved", description: "Welcome to your personal intelligence layer." });
            setLocation("/dashboard");
          } else {
            setStep((s) => s + 1);
          }
        },
        onError: (err: unknown) => {
          const error = err as Error;
          toast({ title: "Error saving profile", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  const skipOnboarding = () => {
    // If skipping, we still save whatever progress they have so far, 
    // but force the 'completed' flag to true.
    updateProfileMutation.mutate(
      { data: profile },
      {
        onSuccess: () => {
          if (user) updateUser({ ...user, onboardingCompleted: true });
          toast({ title: "Welcome!", description: "You can complete your profile later in settings." });
          setLocation("/dashboard");
        },
        onError: () => {
          // Even if save fails (e.g. invalid partial data), we let them through if they want to skip
          if (user) updateUser({ ...user, onboardingCompleted: true });
          setLocation("/dashboard");
        }
      }
    );
  };

  const filteredInterests = ALL_INTERESTS.filter((i) =>
    i.toLowerCase().includes(interestSearch.toLowerCase())
  );

  const getStepTitle = () => {
    switch (step) {
      case 1: return "Basic Profile";
      case 2: return "Apparel Preferences";
      case 3: return "AR Measurements";
      case 4: return "Your Interests";
      case 5: return "Shopping Intelligence";
      default: return "";
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="What should we call you?"
              />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non_binary">Non-binary</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Height (cm)</Label>
                <Input
                  type="number"
                  value={profile.height || ""}
                  onChange={(e) => setProfile((p) => ({ ...p, height: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="e.g. 165"
                />
              </div>
              <div className="space-y-2">
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  value={profile.weight || ""}
                  onChange={(e) => setProfile((p) => ({ ...p, weight: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="e.g. 60"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <Label>Top Size</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {["XXS", "XS", "S", "M", "L", "XL", "2XL"].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={profile.apparel.topSize === size ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, topSize: size } }))}
                    className="w-full text-xs"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bottom Size</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {["26", "28", "30", "32", "34", "36", "38", "40"].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={profile.apparel.bottomSize === size ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, bottomSize: size } }))}
                    className="w-full text-xs"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Preferred Fit</Label>
              <div className="grid grid-cols-3 gap-2">
                {["Slim", "Regular", "Relaxed"].map((fit) => (
                  <Button
                    key={fit}
                    type="button"
                    variant={profile.apparel.preferredFit === fit ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, preferredFit: fit } }))}
                    className="w-full text-sm"
                  >
                    {fit}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ArScanner
              height={profile.height}
              weight={profile.weight}
              gender={profile.gender}
              existingMeasurements={profile.arMeasurements}
              onMeasurementsReady={(measurements) => {
                setProfile((p) => ({ ...p, arMeasurements: measurements }));
              }}
            />
          </div>
        );

      case 4:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-[380px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search interests..."
                value={interestSearch}
                onChange={(e) => setInterestSearch(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {profile.interests.length} selected
            </div>
            <div className="flex-1 overflow-y-auto pr-2 pb-2">
              <div className="flex flex-wrap gap-2">
                {filteredInterests.map((interest) => {
                  const isSelected = profile.interests.includes(interest);
                  return (
                    <Badge
                      key={interest}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105 active:scale-95 ${isSelected ? "shadow-md shadow-primary/20" : "hover:bg-primary/5"}`}
                      onClick={() => {
                        setProfile((p) => ({
                          ...p,
                          interests: isSelected
                            ? p.interests.filter((i) => i !== interest)
                            : [...p.interests, interest],
                        }));
                      }}
                    >
                      {interest}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 5: {
        return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 flex flex-col items-center justify-center text-center py-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <ShoppingBag className="w-8 h-8 text-primary" />
            </div>
            
            <div className="space-y-2 max-w-sm">
              <h3 className="text-xl font-semibold">Connect Shopping Data</h3>
              <p className="text-sm text-muted-foreground">
                We parse your email for purchase receipts to automatically build your shopping profile. 
                This allows us to score products based on what you actually buy and keep.
              </p>
            </div>

            <Button 
              size="lg" 
              className="w-full max-w-sm gap-3 font-medium bg-[#ea4335] hover:bg-[#d33c30] text-white"
              onClick={async () => {
                try {
                  const token = localStorage.getItem("token");
                  // Add timestamp to prevent Chrome from aggressively caching the old response!
                  const res = await fetch(`/api/gmail/auth-url?t=${Date.now()}`, {
                    headers: {
                      Authorization: `Bearer ${token}`
                    }
                  });
                  const data = await res.json();
                  if (data.url) {
                    window.location.href = data.url;
                  } else {
                    toast({ title: "Setup Required", description: data.error || "Failed to initiate Gmail sync.", variant: "destructive" });
                  }
                } catch (e) {
                  toast({ title: "Error", description: "Failed to reach backend API.", variant: "destructive" });
                }
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
              Connect with Gmail
            </Button>
            
            <p className="text-xs text-muted-foreground">
              We only request read-only access and only scan emails identified as receipts or orders.
            </p>
          </div>
        );
      }
      default: return null;
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 p-4">
        <div className="w-full max-w-md mb-8 space-y-2">
          <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}%</span>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>

        <Card className="w-full max-w-md border-border/50 shadow-2xl shadow-primary/5 bg-background/80 backdrop-blur-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">{getStepTitle()}</CardTitle>
            <CardDescription>
              {step === 1 && "Let's start with the basics."}
              {step === 2 && "Tell us your size so we can score fit accurately."}
              {step === 3 && "Point your camera at your best-fitting clothes for precise measurements."}
              {step === 4 && "Select everything that excites you."}
              {step === 5 && "Tell us where you shop — this drastically improves your Fit Score."}
            </CardDescription>
          </CardHeader>

          <CardContent className="min-h-[300px] flex flex-col justify-center">
            {isFetchingProfile && !hasInitialized ? (
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                <p className="text-sm text-muted-foreground animate-pulse">Syncing your progress...</p>
              </div>
            ) : (
              renderStep()
            )}
          </CardContent>

        <CardFooter className="flex justify-between border-t p-4 bg-muted/10">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1 || updateProfileMutation.isPending}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          <Button onClick={handleNext} disabled={updateProfileMutation.isPending} className="min-w-[100px]">
            {updateProfileMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : step === totalSteps ? (
              "Complete"
            ) : (
              <>Next <ChevronRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Skip for now is ONLY shown on AR measurement step (Step 3) since AR is optional */}
      {step === 3 && (
        <Button variant="link" className="mt-6 text-muted-foreground" onClick={() => setStep((s) => s + 1)}>
          Skip for now
        </Button>
      )}
    </div>
  </Layout>
);
}
