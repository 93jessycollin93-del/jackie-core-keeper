import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Task, TaskStatus, TaskPriority } from "@/lib/tasks-db";

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
  }) => void;
  onDelete?: () => void;
  task?: Task | null;
}

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export const TaskDialog = ({ open, onClose, onSave, onDelete, task }: TaskDialogProps) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
    } else {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setDueDate(undefined);
    }
  }, [task, open]);

  if (!open) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description,
      status,
      priority,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
    });
  };

  const statusLabels: Record<TaskStatus, string> = {
    todo: t("tasks.todo"),
    in_progress: t("tasks.inProgress"),
    done: t("tasks.done"),
  };

  const priorityLabels: Record<TaskPriority, string> = {
    low: t("tasks.low"),
    medium: t("tasks.medium"),
    high: t("tasks.high"),
    urgent: t("tasks.urgent"),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-sm shadow-lg w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">
            {task ? t("tasks.editTask") : t("tasks.addTask")}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("tasks.taskTitle")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-secondary/50 border border-border rounded-sm font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder={t("tasks.taskTitle")}
              autoFocus
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("tasks.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-secondary/50 border border-border rounded-sm font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              rows={3}
              placeholder={t("tasks.description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("tasks.status")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full mt-1 px-3 py-2 bg-secondary/50 border border-border rounded-sm font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{statusLabels[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("tasks.priority")}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full mt-1 px-3 py-2 bg-secondary/50 border border-border rounded-sm font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{priorityLabels[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("tasks.dueDate")}
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full mt-1 justify-start text-left font-mono text-sm",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "PPP") : t("tasks.dueDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            {task && onDelete && (
              <button
                onClick={onDelete}
                className="font-mono text-[10px] uppercase tracking-wider text-destructive hover:underline"
              >
                {t("tasks.delete")}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("tasks.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground font-mono text-xs rounded-sm hover:opacity-90 disabled:opacity-30 transition-opacity"
            >
              {t("tasks.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
