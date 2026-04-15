import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Loader2, Search, Settings as SettingsIcon, Save, Mail, Link as LinkIcon, RefreshCw, Unlink } from "lucide-react";

type UpdateProfileBody = {
  name: string;
  gender: string;
  height: number | null;
  weight: number | null;
  apparel: Record<string, any>;
  arMeasurements: Record<string, any>;
  interests: string[];
  emailIntegration: Record<string, any>;
};
import { useAuth } from "@/hooks/use-auth";

const ALL_INTERESTS = [
  "Photography", "Vlogging", "Fitness", "Skincare", "Gaming", "Travel", "Tech", "Fashion",
  "Music", "Content Creation", "Cooking", "Hiking", "Reading", "Yoga", "Running", "Cycling",
  "Dance", "Art", "Movies", "Sports", "Gadgets", "Beauty", "Home Decor", "Pets", "Cars",
  "Sustainability", "Coffee", "Wine", "Streetwear", "Sneakers", "Luxury", "Budget", "Outdoor",
  "DIY", "Coding", "Design", "Investing", "Health", "Wellness", "Minimalism"
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: existingProfile, isLoading, refetch } = useGetProfile();
  const updateProfileMutation = useUpdateProfile();
  
  const [profile, setProfile] = useState<UpdateProfileBody | null>(null);
  const [interestSearch, setInterestSearch] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (existingProfile && !isDirty) {
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
    }
  }, [existingProfile]);

  const handleSave = () => {
    if (!profile) return;
    
    updateProfileMutation.mutate(
      { data: profile },
      {
        onSuccess: () => {
          toast({ title: "Settings Saved", description: "Your profile has been updated." });
          setIsDirty(false);
          refetch();
        },
        onError: (err: unknown) => {
          const error = err as Error;
          toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  const handleDisconnectGmail = async () => {
    if (!confirm("Are you sure you want to disconnect Gmail? This will remove all your shopping history and intelligence data.")) return;
    try {
      setDisconnecting(true);
      const token = localStorage.getItem("token");
      const res = await fetch('/api/gmail/disconnect-all', {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      
      toast({ title: "Disconnected", description: "Your Gmail account has been successfully disconnected." });
      refetch();
    } catch(e) {
      toast({ title: "Error", description: "Failed to disconnect Gmail.", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/gmail/auth-url?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
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
  };

  const updateField = (section: keyof UpdateProfileBody, field: string | null, value: any) => {
    setProfile((p: UpdateProfileBody | null) => {
      if (!p) return p;
      setIsDirty(true);
      if (field === null) {
        return { ...p, [section]: value };
      }
      return {
        ...p,
        [section]: {
          ...(p[section] as Record<string, any>),
          [field]: value
        }
      };
    });
  };

  if (!profile) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const filteredInterests = ALL_INTERESTS.filter((i) =>
    i.toLowerCase().includes(interestSearch.toLowerCase())
  );

  return (
    <Layout>
      <div className="container max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <SettingsIcon className="w-8 h-8 text-primary" />
              Settings
            </h1>
            <p className="text-muted-foreground mt-1">Manage your personalization data</p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={!isDirty || updateProfileMutation.isPending}
            className="hidden sm:flex"
          >
            {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="apparel">Apparel</TabsTrigger>
            <TabsTrigger value="interests">Interests</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle>Basic Profile</CardTitle>
                <CardDescription>Update your physical attributes for better product matching.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-md">
                  <Label>Name</Label>
                  <Input value={profile.name} onChange={e => updateField("name", null, e.target.value)} />
                </div>
                <div className="space-y-2 max-w-md">
                  <Label>Gender</Label>
                  <Select value={profile.gender} onValueChange={(v) => updateField("gender", null, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non_binary">Non-binary</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label>Height (cm)</Label>
                    <Input type="number" value={profile.height || ""} onChange={e => updateField("height", null, e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Weight (kg)</Label>
                    <Input type="number" value={profile.weight || ""} onChange={e => updateField("weight", null, e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apparel">
            <Card>
              <CardHeader>
                <CardTitle>Apparel Preferences</CardTitle>
                <CardDescription>Your sizing preferences and physical measurements.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                 <div className="space-y-4">
                  <Label className="text-base">Typical Sizes</Label>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase font-semibold">Top Size</Label>
                    <div className="flex flex-wrap gap-2">
                      {["XXS", "XS", "S", "M", "L", "XL", "2XL"].map((size) => (
                        <Button key={size} type="button" variant={profile.apparel.topSize === size ? "default" : "outline"} onClick={() => updateField("apparel", "topSize", size)} className="w-14">
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase font-semibold">Bottom Size</Label>
                    <div className="flex flex-wrap gap-2">
                      {["26", "28", "30", "32", "34", "36", "38", "40"].map((size) => (
                        <Button key={size} type="button" variant={profile.apparel.bottomSize === size ? "default" : "outline"} onClick={() => updateField("apparel", "bottomSize", size)} className="w-14">
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase font-semibold">Preferred Fit</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Slim", "Regular", "Relaxed"].map((fit) => (
                        <Button key={fit} type="button" variant={profile.apparel.preferredFit === fit ? "default" : "outline"} onClick={() => updateField("apparel", "preferredFit", fit)}>
                          {fit}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t">
                  <Label className="text-base flex items-center justify-between">
                    AR Measurements
                    {profile.arMeasurements.chest && <Badge variant="secondary" className="bg-green-500/10 text-green-600">Active</Badge>}
                  </Label>
                  {profile.arMeasurements.chest ? (
                    <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                      <div><p className="text-xs text-muted-foreground">Chest</p><p className="font-semibold">{profile.arMeasurements.chest}"</p></div>
                      <div><p className="text-xs text-muted-foreground">Waist</p><p className="font-semibold">{profile.arMeasurements.waist}"</p></div>
                      <div><p className="text-xs text-muted-foreground">Hips</p><p className="font-semibold">{profile.arMeasurements.hips}"</p></div>
                      <div><p className="text-xs text-muted-foreground">Inseam</p><p className="font-semibold">{profile.arMeasurements.inseam}"</p></div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-4 bg-muted/20 border border-dashed rounded-lg text-center">No AR measurements captured yet.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Note: To retake AR measurements, please use the Onboarding flow or Mobile app.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interests">
            <Card>
              <CardHeader>
                <CardTitle>Lifestyle & Interests</CardTitle>
                <CardDescription>Select areas of interest to help our AI understand your lifestyle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search interests..." value={interestSearch} onChange={(e) => setInterestSearch(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2 pt-4">
                  {filteredInterests.map((interest) => {
                    const isSelected = profile.interests.includes(interest);
                    return (
                      <Badge
                        key={interest}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105 active:scale-95 ${isSelected ? "" : "hover:bg-primary/5"}`}
                        onClick={() => {
                          const updated = isSelected ? profile.interests!.filter((i: string) => i !== interest) : [...profile.interests!, interest];
                          updateField("interests", null, updated);
                        }}
                      >
                        {interest}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>Connected Accounts</CardTitle>
                <CardDescription>Manage your data sources for AI product intelligence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 border rounded-xl bg-card">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${existingProfile?.emailIntegration?.connected ? "bg-green-500/10" : "bg-muted"}`}>
                      <Mail className={`w-6 h-6 ${existingProfile?.emailIntegration?.connected ? "text-green-600" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        Gmail Shopping Sync
                        {existingProfile?.emailIntegration?.connected && <Badge className="bg-green-500">Connected</Badge>}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {existingProfile?.emailIntegration?.connected 
                          ? 'Your Gmail account is actively syncing your shopping history.'
                          : 'Connect to extract your shopping habits and identify brand loyalty automatically.'}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 w-full sm:w-auto">
                    {existingProfile?.emailIntegration?.connected ? (
                      <Button variant="outline" className="w-full sm:w-auto text-destructive hover:bg-destructive/10" onClick={handleDisconnectGmail} disabled={disconnecting}>
                        {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlink className="w-4 h-4 mr-2" />}
                        Disconnect
                      </Button>
                    ) : (
                      <Button variant="default" className="w-full sm:w-auto bg-[#ea4335] hover:bg-[#d33c30] text-white" onClick={handleConnectGmail}>
                        <LinkIcon className="w-4 h-4 mr-2" /> Connect
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Mobile sticky save button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t sm:hidden z-50">
          <Button onClick={handleSave} disabled={!isDirty || updateProfileMutation.isPending} className="w-full">
             {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
             Save Changes
          </Button>
        </div>
      </div>
    </Layout>
  );
}
