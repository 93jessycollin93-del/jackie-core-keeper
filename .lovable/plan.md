

# Plan: Add Task Management + Multi-Language Support to Jackie

## What We're Building

A native task management system inside Jackie with Kanban boards, calendar view, and chat-based task commands, plus full i18n support for English, Ukrainian, Russian, and Chinese.

**Note on SyncroTask**: Base44 apps don't expose public APIs, so we'll rebuild these features natively in Jackie's database and UI rather than trying to sync with SyncroTask.

---

## Phase 1: Database Schema

New tables via migration:

- **tasks** — id, user_id, title, description, status (enum: `todo`, `in_progress`, `done`), priority (enum: `low`, `medium`, `high`, `urgent`), due_date, created_at, updated_at
- **task_labels** — id, user_id, name, color, created_at
- **task_label_links** — id, task_id, label_id, user_id

All with RLS policies scoped to `auth.uid() = user_id`. An `update_updated_at` trigger on `tasks`.

## Phase 2: Task Management UI

New pages/views added to the app router:

1. **Tasks List View** (`/tasks`) — filterable/sortable table of all tasks with inline status toggling
2. **Kanban Board View** (`/tasks/board`) — three columns (To Do, In Progress, Done) with drag-and-drop cards
3. **Calendar View** (`/tasks/calendar`) — month view showing tasks by due date
4. **Task Detail Dialog** — create/edit task with title, description, priority, due date, labels

A new **bottom navigation bar** or **sidebar tabs** to switch between Chat, Tasks (list), Board, and Calendar views.

## Phase 3: Chat Commands for Tasks

Enhance the Jackie edge function and frontend to recognize task commands in chat:

- "add task: Fix login bug" → creates a task
- "show tasks" → lists current tasks
- "complete task: Fix login bug" → marks done

This will be handled client-side by detecting command patterns in user messages before/after sending to the AI, and calling the tasks API accordingly.

## Phase 4: Internationalization (i18n)

- Install `react-i18next` and `i18next`
- Create translation files: `src/i18n/en.json`, `src/i18n/uk.json`, `src/i18n/ru.json`, `src/i18n/zh.json`
- Wrap all UI strings with `t()` function calls
- Add language selector in sidebar/settings
- Store language preference in localStorage
- Translate all labels, buttons, placeholders, toast messages, and system text

---

## Technical Details

**Files to create:**
- `src/i18n/index.ts` — i18next config
- `src/i18n/en.json`, `uk.json`, `ru.json`, `zh.json` — translations
- `src/lib/tasks-db.ts` — CRUD functions for tasks/labels
- `src/pages/Tasks.tsx` — list view
- `src/pages/TaskBoard.tsx` — Kanban view
- `src/pages/TaskCalendar.tsx` — calendar view
- `src/components/TaskCard.tsx` — reusable task card
- `src/components/TaskDialog.tsx` — create/edit dialog
- `src/components/BottomNav.tsx` — navigation between views
- `src/lib/task-commands.ts` — chat command parser

**Files to modify:**
- `src/App.tsx` — add routes, i18n provider
- `src/pages/Index.tsx` — wrap strings with `t()`, add navigation
- `supabase/functions/jackie-chat/index.ts` — task-aware system prompt additions

**New dependencies:** `react-i18next`, `i18next`, `i18next-browser-languagedetector`

**Implementation order:** Database → Task CRUD lib → Task UI pages → Navigation → Chat commands → i18n wrapping → Translations

This is a large scope. I recommend implementing it in stages across multiple messages, starting with the database + basic task list, then board, then calendar, then chat commands, then i18n.

