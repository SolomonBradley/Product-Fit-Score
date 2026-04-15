import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, requireOnboarding = true }: { component: any, requireOnboarding?: boolean }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Redirect to="/login" />;
  
  if (requireOnboarding && !user.onboardingCompleted) {
    return <Redirect to="/onboarding" />;
  }
  
  if (!requireOnboarding && user.onboardingCompleted && location === "/onboarding") {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: any }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (user) return <Redirect to={user.onboardingCompleted ? "/dashboard" : "/onboarding"} />;

  return <Component />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/">
        <PublicRoute component={Login} />
      </Route>
      <Route path="/login">
        <PublicRoute component={Login} />
      </Route>
      <Route path="/signup">
        <PublicRoute component={Signup} />
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute component={Onboarding} requireOnboarding={false} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
