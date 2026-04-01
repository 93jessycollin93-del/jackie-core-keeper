import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { listTasks, updateTask, type Task, type TaskStatus, type TaskPriority } from "@/lib/tasks-db";
import { TaskDialog } from "@/components/TaskDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Flag } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-orange-500",
  urgent: "text-destructive",
};

const TaskCalendar = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const load = useCallback(async () => {
    try { setTasks(await listTasks()); } catch { toast.error("Failed to load tasks"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; due_date: string | null }) => {
    if (!editingTask) return;
    try {
      await updateTask(editingTask.id, data);
      setDialogOpen(false);
      setEditingTask(null);
      await load();
    } catch { toast.error("Failed to update task"); }
  };

  // Tasks with due dates, grouped by date string
  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach((task) => {
    if (task.due_date) {
      const key = task.due_date;
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(task);
    }
  });

  const datesWithTasks = Object.keys(tasksByDate).map((d) => new Date(d));

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const selectedTasks = selectedDateStr ? (tasksByDate[selectedDateStr] || []) : [];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <div className="border-b border-border p-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">
            {t("nav.calendar")}
          </h1>
        </div>
      </div>

      <div className="flex-1 p-4 max-w-3xl mx-auto w-full space-y-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className={cn("p-3 pointer-events-auto rounded-sm border border-border")}
          modifiers={{ hasTasks: datesWithTasks }}
          modifiersStyles={{ hasTasks: { fontWeight: "bold", textDecoration: "underline", textDecorationColor: "hsl(var(--primary))" } }}
        />

        <div className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {selectedDate ? format(selectedDate, "MMMM d, yyyy") : ""}
          </h2>
          {selectedTasks.length === 0 ? (
            <p className="text-muted-foreground font-mono text-xs">
              {t("tasks.noDueDateTasks")}
            </p>
          ) : (
            selectedTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => { setEditingTask(task); setDialogOpen(true); }}
                className="w-full text-left p-3 bg-secondary/30 border border-border rounded-sm hover:bg-secondary/50 transition-colors flex items-center gap-3"
              >
                <Flag size={12} className={PRIORITY_COLORS[task.priority]} />
                <div className="flex-1 min-w-0">
                  <span className={`font-mono text-xs ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {task.title}
                  </span>
                </div>
                <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded-sm ${
                  task.status === "done" ? "bg-green-500/20 text-green-500" :
                  task.status === "in_progress" ? "bg-primary/20 text-primary" :
                  "bg-muted-foreground/20 text-muted-foreground"
                }`}>
                  {task.status === "todo" ? t("tasks.todo") : task.status === "in_progress" ? t("tasks.inProgress") : t("tasks.done")}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <TaskDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        task={editingTask}
      />
    </div>
  );
};

export default TaskCalendar;
