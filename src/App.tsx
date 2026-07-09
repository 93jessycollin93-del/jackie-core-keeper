import "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { BottomNav } from "@/components/BottomNav";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Tasks from "./pages/Tasks";
import TaskBoard from "./pages/TaskBoard";
import TaskCalendar from "./pages/TaskCalendar";
import Agents from "./pages/Agents";
import Pods from "./pages/Pods";
import NotFound from "./pages/NotFound";

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
  </>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout><Index /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <ProtectedRoute>
                    <AppLayout><Tasks /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks/board"
                element={
                  <ProtectedRoute>
                    <AppLayout><TaskBoard /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks/calendar"
                element={
                  <ProtectedRoute>
                    <AppLayout><TaskCalendar /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route path="/agents" element={<ProtectedRoute><AppLayout><Agents /></AppLayout></ProtectedRoute>} />
              <Route path="/pods" element={<ProtectedRoute><AppLayout><Pods /></AppLayout></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
