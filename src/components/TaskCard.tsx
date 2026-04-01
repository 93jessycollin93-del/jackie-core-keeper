import { useTranslation } from "react-i18next";
import { CalendarDays, Flag } from "lucide-react";
import { format } from "date-fns";
import type { Task, TaskPriority } from "@/lib/tasks-db";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-orange-500",
  urgent: "text-destructive",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted-foreground/20",
  in_progress: "bg-primary/30",
  done: "bg-green-500/30",
};

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onStatusChange?: (status: Task["status"]) => void;
}

export const TaskCard = ({ task, onClick, onStatusChange }: TaskCardProps) => {
  const { t } = useTranslation();

  const statusLabels: Record<string, string> = {
    todo: t("tasks.todo"),
    in_progress: t("tasks.inProgress"),
    done: t("tasks.done"),
  };

  return (
    <div
      onClick={onClick}
      className="p-3 bg-secondary/30 border border-border rounded-sm hover:bg-secondary/50 transition-colors cursor-pointer space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`font-mono text-xs font-semibold ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </h3>
        <Flag size={12} className={PRIORITY_COLORS[task.priority]} />
      </div>

      {task.description && (
        <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-2">
        {onStatusChange && (
          <select
            value={task.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(e.target.value as Task["status"]);
            }}
            className={`px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-wider border-none ${STATUS_COLORS[task.status]} text-foreground focus:outline-none`}
          >
            {Object.entries(statusLabels).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        )}
        {task.due_date && (
          <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
            <CalendarDays size={9} />
            {format(new Date(task.due_date), "MMM d")}
          </span>
        )}
      </div>
    </div>
  );
};
