import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, ListTodo, Bot, Box, FolderTree } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", icon: MessageSquare, labelKey: "nav.chat" },
  { path: "/tasks", icon: ListTodo, labelKey: "nav.tasks" },
  { path: "/files", icon: FolderTree, labelKey: "nav.files" },
  { path: "/agents", icon: Bot, labelKey: "nav.agents" },
  { path: "/pods", icon: Box, labelKey: "nav.pods" },
] as const;

export const BottomNav = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border flex items-center justify-around h-14 md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <item.icon size={18} />
            <span className="font-mono text-[9px] uppercase tracking-wider">
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
