import { describe, expect, it } from "vitest";
import { planGoalLinks } from "../../../src/features/web-browse/goal-links.js";

describe("planGoalLinks", () => {
  it("keeps a single task when there are no links", () => {
    const tasks = planGoalLinks("find the best price for a widget");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      url: null,
      goal: "find the best price for a widget",
    });
  });

  it("keeps a single task (whole goal) for one link", () => {
    const tasks = planGoalLinks("download the video from https://x.example/v/1");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.url).toBe("https://x.example/v/1");
    expect(tasks[0]!.goal).toContain("https://x.example/v/1");
  });

  it("splits multiple links into per-link tasks with the instruction", () => {
    const tasks = planGoalLinks(
      "download these videos: https://x.example/a and https://x.example/b",
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.url)).toEqual([
      "https://x.example/a",
      "https://x.example/b",
    ]);
    for (const task of tasks) {
      expect(task.goal).toContain("download these videos");
      expect(task.goal).toContain(`Process ONLY this link now: ${task.url}`);
    }
  });

  it("de-duplicates repeated links", () => {
    const tasks = planGoalLinks(
      "https://x.example/a https://x.example/a https://x.example/b",
    );
    expect(tasks.map((t) => t.url)).toEqual([
      "https://x.example/a",
      "https://x.example/b",
    ]);
  });
});
