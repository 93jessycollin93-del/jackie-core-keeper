import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { listTasks, createTask, updateTask, deleteTask, type Task, type TaskStatus, type TaskPriority } from "@/lib/tasks-db";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { toast } from "sonner";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

const TaskBoard = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newColumnStatus, setNewColumnStatus] = useState<TaskStatus>("todo");

  const load = useCallback(async () => {
    try { setTasks(await listTasks()); } catch { toast.error("Failed to load tasks"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; due_date: string | null }) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data);
      } else {
        await createTask({ ...data, status: newColumnStatus });
      }
      setDialogOpen(false);
      setEditingTask(null);
      await load();
    } catch { toast.error("Failed to save task"); }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    try {
      await deleteTask(editingTask.id);
      setDialogOpen(false);
      setEditingTask(null);
      await load();
    } catch { toast.error("Failed to delete task"); }
  };

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    try {
      await updateTask(task.id, { status });
      await load();
    } catch { toast.error("Failed to update"); }
  };

  const columnLabels: Record<TaskStatus, string> = {
    todo: t("tasks.todo"),
    in_progress: t("tasks.inProgress"),
    done: t("tasks.done"),
  };

  const columnColors: Record<TaskStatus, string> = {
    todo: "border-muted-foreground/30",
    in_progress: "border-primary/40",
    done: "border-green-500/40",
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <div className="border-b border-border p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">
            {t("nav.board")}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[60vh]">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col);
            return (
              <div key={col} className={`border-t-2 ${columnColors[col]} bg-secondary/10 rounded-sm p-3 space-y-2`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {columnLabels[col]} ({colTasks.length})
                  </h2>
                  <button
                    onClick={() => { setNewColumnStatus(col); setEditingTask(null); setDialogOpen(true); }}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => { setEditingTask(task); setDialogOpen(true); }}
                    onStatusChange={(status) => handleStatusChange(task, status)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <TaskDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
        task={editingTask}
      />
    </div>
  );
};

export default TaskBoard;
