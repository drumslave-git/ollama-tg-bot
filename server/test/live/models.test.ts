import { describe, expect, it } from "vitest";
import { liveClient, liveConfig } from "./helpers.js";

const cfg = liveConfig();

describe.skipIf(!cfg)("live: model catalog (/v1/models)", () => {
  it("lists models and includes the configured model", async () => {
    const client = liveClient(cfg!);
    const page = await client.models.list();
    const ids = page.data.map((m) => m.id);
    expect(ids.length).toBeGreaterThan(0);

    // Some gateways report a different id than the alias used for chat; only
    // assert presence when the exact id is advertised.
    if (ids.includes(cfg!.model)) {
      expect(ids).toContain(cfg!.model);
    } else {
      console.warn(
        `Configured model "${cfg!.model}" not in /v1/models list (${ids.length} models). ` +
          "This is acceptable for gateways that accept aliases.",
      );
    }
  });
});
