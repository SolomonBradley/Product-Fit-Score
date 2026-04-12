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
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Search, ExternalLink } from "lucide-react";
import type { UpdateProfileBody } from "@workspace/api-client-react/src/generated/api.schemas";
import ArScanner from "@/components/ar-scanner";

const ALL_INTERESTS = [
  "Photography", "Vlogging", "Fitness", "Skincare", "Gaming", "Travel", "Tech", "Fashion",
  "Music", "Content Creation", "Cooking", "Hiking", "Reading", "Yoga", "Running", "Cycling",
  "Dance", "Art", "Movies", "Sports", "Gadgets", "Beauty", "Home Decor", "Pets", "Cars",
  "Sustainability", "Coffee", "Wine", "Streetwear", "Sneakers", "Luxury", "Budget", "Outdoor",
  "DIY", "Coding", "Design", "Investing", "Health", "Wellness", "Minimalism"
];

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
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState<boolean | null>(null);

  // Check Gmail integration status on step 5
  useEffect(() => {
    if (step === 5) {
      fetch("/api/gmail/status", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
        .then((r) => r.json())
        .then((data: { configured: boolean; connected: boolean; categories: string[]; brands: string[] }) => {
          setGmailConfigured(data.configured);
          if (data.connected) {
            setProfile((p) => ({
              ...p,
              emailIntegration: { connected: true, categories: data.categories, brands: data.brands },
            }));
          }
        })
        .catch(() => setGmailConfigured(false));
    }
  }, [step]);

  // Handle Gmail OAuth callback result (query params after redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailSuccess = params.get("gmail_success");
    const gmailError = params.get("gmail_error");
    const brands = params.get("brands");
    const categories = params.get("categories");

    if (gmailSuccess) {
      const brandList = brands ? brands.split(",") : [];
      const catList = categories ? categories.split(",") : [];
      setProfile((p) => ({
        ...p,
        emailIntegration: { connected: true, categories: catList, brands: brandList },
      }));
      setStep(5);
      toast({ title: "Gmail connected", description: `Found ${brandList.length} brands from your purchase history.` });
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gmailError) {
      toast({ title: "Gmail connection failed", description: decodeURIComponent(gmailError), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
          // Update local user state to reflect onboarding complete
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

  const connectGmail = async () => {
    setGmailLoading(true);
    try {
      const response = await fetch("/api/gmail/auth-url", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json() as { url?: string; error?: string };
      if (data.url) {
        // Redirect to Google OAuth
        window.location.href = data.url;
      } else {
        toast({ title: "Gmail not configured", description: data.error || "Add GOOGLE_CLIENT_ID to enable Gmail sync.", variant: "destructive" });
        setGmailLoading(false);
      }
    } catch {
      toast({ title: "Error", description: "Could not start Gmail connection.", variant: "destructive" });
      setGmailLoading(false);
    }
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
      case 5: return "Shopping History";
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
                data-testid="input-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={profile.gender} onValueChange={(v) => setProfile((p) => ({ ...p, gender: v }))}>
                <SelectTrigger data-testid="select-gender"><SelectValue /></SelectTrigger>
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
                  placeholder="e.g. 175"
                  data-testid="input-height"
                />
              </div>
              <div className="space-y-2">
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  value={profile.weight || ""}
                  onChange={(e) => setProfile((p) => ({ ...p, weight: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="e.g. 70"
                  data-testid="input-weight"
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
                {["S", "M", "L", "XL", "XXL"].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={profile.apparel.topSize === size ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, topSize: size } }))}
                    className="w-full"
                    data-testid={`button-top-size-${size}`}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bottom Size</Label>
              <div className="grid grid-cols-6 gap-2">
                {["28", "30", "32", "34", "36", "38"].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={profile.apparel.bottomSize === size ? "default" : "outline"}
                    onClick={() => setProfile((p) => ({ ...p, apparel: { ...p.apparel, bottomSize: size } }))}
                    className="w-full"
                    data-testid={`button-bottom-size-${size}`}
                  >
                    {size}
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
                data-testid="input-interest-search"
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
                      data-testid={`badge-interest-${interest}`}
                    >
                      {interest}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
            <div className="mx-auto w-20 h-20 rounded-xl bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center mb-2 shadow-lg shadow-red-500/20">
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold">Gmail Integration</h3>
              <p className="text-sm text-muted-foreground mt-2 px-2">
                Connect your Gmail so we can read your purchase receipts and boost Fit Score accuracy.
              </p>
            </div>

            {profile.emailIntegration.connected ? (
              <div className="bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 p-4 rounded-xl flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                <p className="font-semibold">Connected to Gmail</p>
                <p className="text-xs opacity-80">
                  Found {profile.emailIntegration.brands.length} brands
                  {profile.emailIntegration.categories.length > 0 && ` across ${profile.emailIntegration.categories.join(", ")}`}
                </p>
                {profile.emailIntegration.brands.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center mt-1">
                    {profile.emailIntegration.brands.slice(0, 5).map((b) => (
                      <span key={b} className="text-xs bg-green-500/20 px-2 py-0.5 rounded-full">{b}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  onClick={connectGmail}
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={gmailLoading}
                  data-testid="button-connect-gmail"
                >
                  {gmailLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting to Google...</>
                  ) : (
                    <><ExternalLink className="w-4 h-4 mr-2" /> Connect Gmail</>
                  )}
                </Button>
                {gmailConfigured === false && (
                  <p className="text-xs text-muted-foreground">
                    Gmail sync requires Google OAuth setup. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.
                  </p>
                )}
              </div>
            )}
          </div>
        );
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
            {step === 4 && `Select everything that excites you. ${profile.interests.length > 0 ? `${profile.interests.length} selected.` : ""}`}
            {step === 1 && "Let's start with the basics."}
            {step === 3 && "Point your camera at your best-fitting clothes."}
          </CardDescription>
        </CardHeader>

        <CardContent className="min-h-[300px] flex flex-col justify-center">
          {renderStep()}
        </CardContent>

        <CardFooter className="flex justify-between border-t p-4 bg-muted/10">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1 || updateProfileMutation.isPending} data-testid="button-back">
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          <Button onClick={handleNext} disabled={updateProfileMutation.isPending} className="min-w-[100px]" data-testid="button-next">
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
        <Button variant="link" className="mt-6 text-muted-foreground" onClick={handleNext} data-testid="button-skip">
          Skip for now
        </Button>
      )}
    </div>
  );
}
