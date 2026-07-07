export const TASKS_CREATE_DESCRIPTION =
  "Create a scheduled task that posts a message into THIS chat at a wall-clock time. " +
  "Use when the owner asks the bot to do something on a schedule (e.g. 'ask how I'm doing every day at 17:00'). " +
  "instruction is a self-contained directive the bot will rephrase in-character on each fire; keep entities as " +
  "[user:name:id] tags from the [SESSION] block or history. schedule_kind: 'daily' (give time), " +
  "'weekly' (give time + weekdays, 0=Sunday..6=Saturday), or 'once' (give time + date YYYY-MM-DD). " +
  "time is HH:MM 24-hour in the bot timezone. Owner only.";

export const TASKS_UPDATE_DESCRIPTION =
  "Change an existing task in this chat: its instruction, time, or schedule. " +
  "Use when the owner replies to a task's message to reschedule it (the [SESSION] block names the linked task id). " +
  "Pass only the fields to change. To STOP or CANCEL a task, use tasks_delete instead; set enabled:false only to temporarily pause a recurring task. Owner only.";

export const TASKS_DELETE_DESCRIPTION =
  "Permanently remove a task in this chat. This is how you STOP or CANCEL a task: " +
  "use it whenever the owner says to stop/cancel a task or no longer needs it " +
  "(often by replying to its message; the [SESSION] block names the linked task id). " +
  "Prefer this over disabling. Owner only.";

export const TASKS_GET_DESCRIPTION =
  "Read one task in this chat by id, including its schedule and next run time. Owner only.";

export const TASKS_LIST_DESCRIPTION =
  "List all scheduled tasks for THIS chat. Use to answer 'what tasks/reminders do I have?'. Owner only.";

export const TASKS_SEARCH_DESCRIPTION =
  "Case-insensitive substring search over this chat's task instructions. Owner only.";
