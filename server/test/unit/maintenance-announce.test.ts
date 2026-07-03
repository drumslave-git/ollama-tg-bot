import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMaintenanceAnnouncementUserMessage,
  collectMaintenanceAnnouncementChatIds,
  parseMaintenanceAnnouncementReply,
} from "../../src/bot/maintenance/announce-support.js";
import { MAINTENANCE_MODE_ON_BEHAVIOR } from "../../src/bot/maintenance/maintenance-mode.js";

vi.mock("../../src/features/history/db/index.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/features/history/db/index.js")
  >()),
  listDistinctHistoryChatIds: vi.fn(),
}));

import { listDistinctHistoryChatIds } from "../../src/features/history/db/index.js";

const mockedListDistinctHistoryChatIds = vi.mocked(listDistinctHistoryChatIds);

describe("maintenance announcement helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListDistinctHistoryChatIds.mockResolvedValue([]);
  });

  it("loads chat ids from distinct history chat keys", async () => {
    mockedListDistinctHistoryChatIds.mockResolvedValue([-100999001, 424242]);
    expect(await collectMaintenanceAnnouncementChatIds()).toEqual([
      -100999001,
      424242,
    ]);
  });

  it("reuses canonical maintenance behavior text when enabled", () => {
    const text = buildMaintenanceAnnouncementUserMessage(true);
    expect(text).toContain("Maintenance mode is now on");
    expect(text).toContain(MAINTENANCE_MODE_ON_BEHAVIOR);
  });

  it("states maintenance is off without repeating behavior rules", () => {
    const text = buildMaintenanceAnnouncementUserMessage(false);
    expect(text).toBe("Maintenance mode is now off.");
  });

  it("returns the trimmed plain-text reply", () => {
    expect(parseMaintenanceAnnouncementReply("  Back soon, mortals.  ")).toBe(
      "Back soon, mortals.",
    );
  });

  it("rejects an empty reply", () => {
    expect(() => parseMaintenanceAnnouncementReply("   ")).toThrow(
      /empty reply/,
    );
  });
});
