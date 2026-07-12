import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, ListTodo, Bot, Box, FolderTree, Shield, Gamepad2, KeyRound, Cpu, Radar } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", icon: MessageSquare, labelKey: "nav.chat", fallback: "Chat" },
  { path: "/tasks", icon: ListTodo, labelKey: "nav.tasks", fallback: "Tasks" },
  { path: "/files", icon: FolderTree, labelKey: "nav.files", fallback: "Files" },
  { path: "/agents", icon: Bot, labelKey: "nav.agents", fallback: "Agents" },
  { path: "/bots", icon: Cpu, labelKey: "nav.bots", fallback: "Bots" },
  { path: "/pods", icon: Box, labelKey: "nav.pods", fallback: "Pods" },
  { path: "/vault", icon: Shield, labelKey: "nav.vault", fallback: "Vault" },
  { path: "/play", icon: Gamepad2, labelKey: "nav.play", fallback: "Play" },
  { path: "/sentinel", icon: Radar, labelKey: "nav.sentinel", fallback: "Sentinel" },
  { path: "/keys", icon: KeyRound, labelKey: "nav.keys", fallback: "Keys" },
] as const;

export const BottomNav = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border md:hidden">
      <div className="flex items-center gap-1 h-14 px-2 overflow-x-auto no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 shrink-0 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon size={18} />
              <span className="font-mono text-[9px] uppercase tracking-wider">
                {t(item.labelKey, item.fallback)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
