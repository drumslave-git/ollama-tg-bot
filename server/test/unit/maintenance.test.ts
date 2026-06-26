import { beforeEach, describe, expect, it, vi } from "vitest";
import { isMaintenanceBlocked } from "../../src/bot/maintenance/maintenance.js";
import { makeSettings } from "../helpers/settings.js";

vi.mock("../../src/db/index.js", () => ({
  getSettings: vi.fn(),
}));

vi.mock("../../src/bot/owner/owner.js", () => ({
  isOwner: vi.fn(),
}));

import { getSettings } from "../../src/db/index.js";
import { isOwner } from "../../src/bot/owner/owner.js";

const mockedGetSettings = vi.mocked(getSettings);
const mockedIsOwner = vi.mocked(isOwner);

const BOT = { id: 100, username: "alex_bot" };

function ctx(over: {
  chatType?: string;
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number; user?: { id: number } }>;
  from?: { id: number; username?: string };
}) {
  return {
    chat: { type: over.chatType ?? "supergroup" },
    from: over.from ?? { id: 42, username: "alice" },
    me: BOT,
    message:
      over.text != null
        ? { text: over.text, entities: over.entities }
        : undefined,
  };
}

describe("isMaintenanceBlocked", async () => {
  beforeEach(() => {
    mockedGetSettings.mockResolvedValue(
      makeSettings({ maintenanceModeEnabled: true }),
    );
    mockedIsOwner.mockResolvedValue(false);
  });

  it("is false when maintenance mode is off", async () => {
    mockedGetSettings.mockResolvedValue(
      makeSettings({ maintenanceModeEnabled: false }),
    );
    expect(await isMaintenanceBlocked(ctx({ text: "hello" }) as never)).toBe(false);
  });

  it("is false for the owner in private chat", async () => {
    mockedIsOwner.mockResolvedValue(true);
    expect(
      await isMaintenanceBlocked(ctx({ chatType: "private", text: "hello" }) as never),
    ).toBe(false);
  });

  it("is false for the owner with a direct @mention in a group", async () => {
    mockedIsOwner.mockResolvedValue(true);
    expect(
      await isMaintenanceBlocked(ctx({ text: "@alex_bot hello" }) as never),
    ).toBe(false);
  });

  it("is true for the owner without an @mention in a group", async () => {
    mockedIsOwner.mockResolvedValue(true);
    expect(await isMaintenanceBlocked(ctx({ text: "hello" }) as never)).toBe(true);
  });

  it("is true for a direct @mention from a non-owner in a group", async () => {
    expect(
      await isMaintenanceBlocked(ctx({ text: "@alex_bot hello" }) as never),
    ).toBe(true);
  });

  it("is true for unrelated group chatter", async () => {
    expect(await isMaintenanceBlocked(ctx({ text: "just chatting" }) as never)).toBe(
      true,
    );
  });

  it("is true for a reply without an @mention in a group", async () => {
    expect(await isMaintenanceBlocked(ctx({ text: "thanks" }) as never)).toBe(true);
  });

  it("is true for a private message from a non-owner", async () => {
    expect(
      await isMaintenanceBlocked(
        ctx({ chatType: "private", text: "@alex_bot hello" }) as never,
      ),
    ).toBe(true);
  });
});
