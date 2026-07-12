import "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { I18nProvider } from "@/game/i18n";
import { lazy, Suspense } from "react";
import { BottomNav } from "@/components/BottomNav";
import { IndexFinder } from "@/components/IndexFinder";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Tasks from "./pages/Tasks";
import TaskBoard from "./pages/TaskBoard";
import TaskCalendar from "./pages/TaskCalendar";
import Agents from "./pages/Agents";
import PodsPage from "./pages/Pods";
import Files from "./pages/Files";
import Play from "./pages/Play";
import TelegramShell from "./pages/TelegramShell";
import Vault from "./pages/Vault";
import BotFoundry from "./pages/BotFoundry";
import BotSwarm from "./pages/BotSwarm";
import ApiKeyManager from "./pages/ApiKeyManager";
import GunitLayout from "./pages/gunit/GunitLayout";
import GunitDashboard from "./pages/gunit/GunitDashboard";
import GunitBotFactory from "./pages/gunit/GunitBotFactory";
import GunitChat from "./pages/gunit/GunitChat";
import GunitAgents from "./pages/gunit/GunitAgents";
import GunitUsers from "./pages/gunit/GunitUsers";
import GunitApiKeys from "./pages/gunit/GunitApiKeys";
import SphereCommand from "./pages/SphereCommand";
import JackieControl from "./pages/JackieControl";
import VeilOps from "./pages/VeilOps";
import MarvelsRace from "./pages/MarvelsRace";
import SentinelDashboard from "./pages/SentinelDashboard";
import SentinelBoard from "./pages/SentinelBoard";
import ApexHub from "./pages/ApexHub";
import AIProviders from "./pages/AIProviders";
import PodStation from "./pages/PodStation";
import Design from "./pages/Design";
import NotFound from "./pages/NotFound";

const EruRouter = lazy(() => import("./eru/EruRouter"));
const FloatingEditorNav = lazy(() => import("./eru/FloatingEditorNav"));
const VisualizerLab = lazy(() => import("./eru/VisualizerLab"));

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-4xl font-bold text-primary animate-pulse">J</span>
      </div>
    );
  }
  if (!user) return <Auth />;
  return <>{children}</>;
};

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <>
    {children}
    <BottomNav />
    <IndexFinder />
  </>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><AppLayout>{children}</AppLayout></ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<P><Index /></P>} />
                <Route path="/tasks" element={<P><Tasks /></P>} />
                <Route path="/tasks/board" element={<P><TaskBoard /></P>} />
                <Route path="/tasks/calendar" element={<P><TaskCalendar /></P>} />
                <Route path="/agents" element={<P><Agents /></P>} />
                <Route path="/pods" element={<P><PodsPage /></P>} />
                <Route path="/podstation" element={<P><PodStation /></P>} />
                <Route path="/files" element={<P><Files /></P>} />
                <Route path="/play" element={<P><Play /></P>} />
                <Route path="/hub" element={<TelegramShell />} />
                <Route path="/vault" element={<P><Vault /></P>} />
                <Route path="/bots" element={<P><BotFoundry /></P>} />
                <Route path="/swarm" element={<P><BotSwarm /></P>} />
                <Route path="/keys" element={<P><ApiKeyManager /></P>} />
                <Route path="/gunit" element={<ProtectedRoute><GunitLayout /></ProtectedRoute>}>
                  <Route index element={<GunitDashboard />} />
                  <Route path="bots" element={<GunitBotFactory />} />
                  <Route path="chat" element={<GunitChat />} />
                  <Route path="agents" element={<GunitAgents />} />
                  <Route path="users" element={<GunitUsers />} />
                  <Route path="keys" element={<GunitApiKeys />} />
                </Route>
                <Route path="/sphere" element={<P><SphereCommand /></P>} />
                <Route path="/control" element={<P><JackieControl /></P>} />
                <Route path="/veilops" element={<P><VeilOps /></P>} />
                <Route path="/marvels" element={<P><MarvelsRace /></P>} />
                <Route path="/sentinel" element={<P><SentinelDashboard /></P>} />
                <Route path="/sentinel/board" element={<P><SentinelBoard /></P>} />
                <Route path="/apex" element={<P><ApexHub /></P>} />
                <Route path="/providers" element={<P><AIProviders /></P>} />
                <Route path="/design" element={<P><Design /></P>} />
                <Route
                  path="/eru/visualizers"
                  element={<ProtectedRoute><Suspense fallback={null}><VisualizerLab /></Suspense></ProtectedRoute>}
                />
                <Route
                  path="/eru/*"
                  element={<ProtectedRoute><Suspense fallback={null}><EruRouter /></Suspense></ProtectedRoute>}
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <Suspense fallback={null}><FloatingEditorNav /></Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
