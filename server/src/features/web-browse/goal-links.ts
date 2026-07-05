import { extractUrls } from "../link-fetch/index.js";

export interface LinkTask {
  /** The link this sub-task handles, or null when the goal has no explicit URL. */
  url: string | null;
  /** Goal text for this sub-task's agent run. */
  goal: string;
}

/**
 * Split a run goal into per-link sub-tasks. When the goal contains **multiple**
 * links, each becomes its own task (processed one by one, each with a fresh
 * budget) carrying the goal's instruction focused on that single link. With one
 * or zero links the whole goal is a single task (unchanged behavior).
 */
export function planGoalLinks(goal: string): LinkTask[] {
  const urls = extractUrls(goal);
  if (urls.length <= 1) return [{ url: urls[0] ?? null, goal }];

  const instruction =
    goal.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim() ||
    "Download the video";
  return urls.map((url) => ({
    url,
    goal: `${instruction}\nProcess ONLY this link now: ${url}`,
  }));
}
