import { createTask, updateTask, listTasks, type TaskStatus, type TaskPriority } from "./tasks-db";

export interface TaskCommandResult {
  handled: boolean;
  response?: string;
}

const ADD_PATTERNS = [
  /^add task:\s*(.+)/i,
  /^new task:\s*(.+)/i,
  /^create task:\s*(.+)/i,
  /^todo:\s*(.+)/i,
];

const COMPLETE_PATTERNS = [
  /^complete task:\s*(.+)/i,
  /^done task:\s*(.+)/i,
  /^finish task:\s*(.+)/i,
];

const SHOW_PATTERNS = [
  /^show tasks$/i,
  /^list tasks$/i,
  /^my tasks$/i,
  /^tasks$/i,
];

export async function processTaskCommand(text: string): Promise<TaskCommandResult> {
  const trimmed = text.trim();

  // Add task
  for (const pat of ADD_PATTERNS) {
    const match = trimmed.match(pat);
    if (match) {
      const title = match[1].trim();
      // Parse optional priority: "Fix bug !high"
      let priority: TaskPriority = "medium";
      const prioMatch = title.match(/\s*!(low|medium|high|urgent)\s*$/i);
      let cleanTitle = title;
      if (prioMatch) {
        priority = prioMatch[1].toLowerCase() as TaskPriority;
        cleanTitle = title.replace(prioMatch[0], "").trim();
      }
      const task = await createTask({ title: cleanTitle, priority });
      return {
        handled: true,
        response: `✅ Task created: **${task.title}** (${task.priority} priority, ${task.status})`,
      };
    }
  }

  // Complete task
  for (const pat of COMPLETE_PATTERNS) {
    const match = trimmed.match(pat);
    if (match) {
      const searchTitle = match[1].trim().toLowerCase();
      const tasks = await listTasks();
      const found = tasks.find(
        (t) => t.title.toLowerCase().includes(searchTitle) && t.status !== "done"
      );
      if (found) {
        await updateTask(found.id, { status: "done" });
        return {
          handled: true,
          response: `✅ Task completed: **${found.title}**`,
        };
      }
      return {
        handled: true,
        response: `❌ No active task found matching "${match[1].trim()}"`,
      };
    }
  }

  // Show tasks
  for (const pat of SHOW_PATTERNS) {
    if (pat.test(trimmed)) {
      const tasks = await listTasks();
      if (tasks.length === 0) {
        return { handled: true, response: "📋 No tasks yet. Use `add task: <title>` to create one." };
      }
      const statusEmoji: Record<string, string> = { todo: "⬜", in_progress: "🔵", done: "✅" };
      const lines = tasks.slice(0, 20).map(
        (t) => `${statusEmoji[t.status] || "⬜"} **${t.title}** — ${t.priority} priority`
      );
      return {
        handled: true,
        response: `📋 **Your Tasks** (${tasks.length})\n\n${lines.join("\n")}`,
      };
    }
  }

  return { handled: false };
}
