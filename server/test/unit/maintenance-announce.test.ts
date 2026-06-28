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

  it("extracts reply from valid JSON", () => {
    const reply = parseMaintenanceAnnouncementReply(
      JSON.stringify({ reply: "Back soon, mortals." }),
    );
    expect(reply).toBe("Back soon, mortals.");
  });

  it("rejects raw JSON without a parsed reply field", () => {
    expect(() =>
      parseMaintenanceAnnouncementReply(
        '{"reasoning":"thinking aloud","reply":"Hi',
      ),
    ).toThrow(/not valid JSON with a reply field/);
  });

  it("rejects empty reply field", () => {
    expect(() =>
      parseMaintenanceAnnouncementReply(JSON.stringify({ reply: "   " })),
    ).toThrow(/empty reply/);
  });
});
