import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskLabel {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Task[];
}

export async function createTask(task: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}): Promise<Task> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: task.title,
      description: task.description ?? "",
      status: task.status ?? "todo",
      priority: task.priority ?? "medium",
      due_date: task.due_date ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Task;
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "due_date">>
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function listTaskLabels(): Promise<TaskLabel[]> {
  const { data, error } = await supabase
    .from("task_labels")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as TaskLabel[];
}

export async function createTaskLabel(name: string, color: string): Promise<TaskLabel> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("task_labels")
    .insert({ user_id: user.id, name, color })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as TaskLabel;
}

export async function deleteTaskLabel(id: string): Promise<void> {
  const { error } = await supabase.from("task_labels").delete().eq("id", id);
  if (error) throw error;
}
