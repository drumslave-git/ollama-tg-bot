import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  isPrivateIp,
  UnsafeUrlError,
} from "../../../src/features/web-browse/ssrf.js";

describe("isPrivateIp", () => {
  it("flags private, loopback, link-local, and reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12::34",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1::"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("ftp://example.com/x")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("rejects private IP literals without any network call", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicUrl("http://10.0.0.5:8080/x")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("rejects localhost by name", async () => {
    await expect(assertPublicUrl("http://localhost/x")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("accepts a public IP literal", async () => {
    const url = await assertPublicUrl("http://93.184.216.34/page");
    expect(url.hostname).toBe("93.184.216.34");
  });
});
