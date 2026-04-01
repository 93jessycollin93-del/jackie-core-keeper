import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { listTasks, createTask, updateTask, deleteTask, type Task, type TaskStatus, type TaskPriority } from "@/lib/tasks-db";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { toast } from "sonner";

const Tasks = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");

  const load = useCallback(async () => {
    try {
      setTasks(await listTasks());
    } catch { toast.error("Failed to load tasks"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; due_date: string | null }) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, data);
      } else {
        await createTask(data);
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
    } catch { toast.error("Failed to update task"); }
  };

  let filtered = tasks;
  if (filterStatus !== "all") filtered = filtered.filter((t) => t.status === filterStatus);
  if (filterPriority !== "all") filtered = filtered.filter((t) => t.priority === filterPriority);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <div className="border-b border-border p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">
            {t("tasks.title")}
          </h1>
          <button
            onClick={() => { setEditingTask(null); setDialogOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-mono text-xs rounded-sm hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            {t("tasks.addTask")}
          </button>
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto w-full">
        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
            className="px-2 py-1 bg-secondary/50 border border-border rounded-sm font-mono text-[10px] text-foreground focus:outline-none"
          >
            <option value="all">{t("tasks.filterByStatus")}: {t("tasks.all")}</option>
            <option value="todo">{t("tasks.todo")}</option>
            <option value="in_progress">{t("tasks.inProgress")}</option>
            <option value="done">{t("tasks.done")}</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
            className="px-2 py-1 bg-secondary/50 border border-border rounded-sm font-mono text-[10px] text-foreground focus:outline-none"
          >
            <option value="all">{t("tasks.filterByPriority")}: {t("tasks.all")}</option>
            <option value="low">{t("tasks.low")}</option>
            <option value="medium">{t("tasks.medium")}</option>
            <option value="high">{t("tasks.high")}</option>
            <option value="urgent">{t("tasks.urgent")}</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-muted-foreground font-mono text-sm">{t("tasks.noTasks")}</p>
            <p className="text-muted-foreground/60 font-mono text-[10px]">{t("tasks.chatCommands")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => { setEditingTask(task); setDialogOpen(true); }}
                onStatusChange={(status) => handleStatusChange(task, status)}
              />
            ))}
          </div>
        )}
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

export default Tasks;
