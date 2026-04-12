import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUpdateProfile } from "@workspace/api-client-react";
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
import type { UpdateProfileBody } from "@workspace/api-client-react/src/generated/api.schemas";
import ArScanner from "@/components/ar-scanner";

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
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const updateProfileMutation = useUpdateProfile();

  const [profile, setProfile] = useState<UpdateProfileBody>({
    name: user?.name ?? "",
    gender: "prefer_not_to_say",
    height: null,
    weight: null,
    apparel: { topSize: "M", bottomSize: "32" },
    arMeasurements: { chest: null, waist: null, hips: null, inseam: null },
    interests: [],
    emailIntegration: { connected: false, categories: [], brands: [] }
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
    if (step < totalSteps) setStep((s) => s + 1);
    else handleComplete();
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleComplete = () => {
    updateProfileMutation.mutate(
      { data: profile },
      {
        onSuccess: () => {
          if (user) updateUser({ ...user, onboardingCompleted: true });
          toast({ title: "Profile saved", description: "Welcome to your personal intelligence layer." });
          setLocation("/dashboard");
        },
        onError: (err: unknown) => {
          const error = err as Error;
          toast({ title: "Error saving profile", description: error.message, variant: "destructive" });
        },
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
              <div className="grid grid-cols-5 gap-2">
                {["XS", "S", "M", "L", "XL"].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={profile.apparel.topSize === size ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, topSize: size } }))}
                    className="w-full"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bottom Size</Label>
              <div className="grid grid-cols-6 gap-2">
                {["26", "28", "30", "32", "34", "36"].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={profile.apparel.bottomSize === size ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, bottomSize: size } }))}
                    className="w-full"
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
                    variant={profile.apparel.topSize === fit ? "default" : "outline"}
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
        const activeBrands = profile.emailIntegration.brands;
        const allBrands = Object.values(BRAND_CATEGORIES).flat();
        const filteredBrands = brandSearch
          ? allBrands.filter((b) => b.toLowerCase().includes(brandSearch.toLowerCase()))
          : (BRAND_CATEGORIES[selectedBrandCat] ?? []);

        return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Select brands you shop from</p>
                <p className="text-xs text-muted-foreground">This powers your personalized Fit Score</p>
              </div>
              {activeBrands.length > 0 && (
                <div className="ml-auto flex items-center gap-1 text-green-600 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {activeBrands.length}
                </div>
              )}
            </div>

            {/* Shopping categories */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Categories you shop for</p>
              <div className="flex flex-wrap gap-1.5">
                {SHOPPING_CATS.map((cat) => (
                  <Badge
                    key={cat}
                    variant={selectedShoppingCats.includes(cat) ? "default" : "outline"}
                    className="cursor-pointer capitalize text-xs px-2.5 py-1 transition-all hover:scale-105"
                    onClick={() => toggleShoppingCat(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Brand search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 text-sm"
                placeholder="Search brands..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
              />
            </div>

            {/* Brand category tabs */}
            {!brandSearch && (
              <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {Object.keys(BRAND_CATEGORIES).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedBrandCat(cat)}
                    className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-all ${
                      selectedBrandCat === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {cat.split(" ")[0]}
                  </button>
                ))}
              </div>
            )}

            {/* Brand grid */}
            <div className="max-h-[160px] overflow-y-auto -mx-1 px-1">
              <div className="flex flex-wrap gap-1.5">
                {filteredBrands.map((brand) => {
                  const isSelected = activeBrands.includes(brand);
                  return (
                    <Badge
                      key={brand}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer text-xs px-2.5 py-1 transition-all hover:scale-105 active:scale-95 ${isSelected ? "shadow-sm shadow-primary/20" : "hover:bg-primary/5"}`}
                      onClick={() => toggleBrand(brand)}
                    >
                      {brand}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {activeBrands.length > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-lg">
                Selected: {activeBrands.slice(0, 4).join(", ")}{activeBrands.length > 4 ? ` +${activeBrands.length - 4} more` : ""}
              </div>
            )}
          </div>
        );
      }
      default: return null;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-muted/20 p-4">
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
          {renderStep()}
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

      {step < totalSteps && (
        <Button variant="link" className="mt-6 text-muted-foreground" onClick={handleNext}>
          Skip for now
        </Button>
      )}
    </div>
  );
}
