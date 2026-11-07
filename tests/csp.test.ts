// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashOf, inlineScripts, policy, writeHeaders } from "../scripts/csp.mjs";

// The policy lets the build's own inline scripts run, by hash, and no others (Astro wakes the homepage's board with one).
describe("the content security policy", () => {
  it("finds inline scripts that run, and skips files and data blocks", () => {
    const html = `<script src="/a.js"></script><script type="module">go()</script><script>one()</script>
      <script type="application/ld+json">{"@type":"x"}</script>`;
    expect(inlineScripts(html)).toEqual(["go()", "one()"]);
  });
  it("hashes as browsers do (sha256 of the exact text, base64)", () => {
    expect(hashOf("alert(1)")).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
  });
  it("keeps the site's other rules and allows nothing inline without a hash", () => {
    const p = policy([]);
    expect(p).toContain("default-src 'self'");
    expect(p).toContain("script-src 'self';");
    expect(p.split("; ").find((d) => d.startsWith("script-src"))).toBe("script-src 'self'");
    expect(p).toContain("connect-src 'self' https://sportscore.com");
    expect(p).toContain("frame-ancestors 'none'");
  });
  it("writes one policy for the whole site with every page's scripts", () => {
    const dist = mkdtempSync(join(tmpdir(), "csp-"));
    mkdirSync(join(dist, "leagues"));
    writeFileSync(join(dist, "index.html"), "<script>a()</script><script>a()</script>");
    writeFileSync(join(dist, "leagues", "index.html"), '<script src="/leagues/live.js"></script><script>b()</script>');
    expect(writeHeaders(dist)).toBe(2);
    const headers = readFileSync(join(dist, "_headers"), "utf8");
    expect(headers.startsWith("/*\n  Content-Security-Policy: ")).toBe(true);
    expect(headers).toContain(hashOf("a()"));
    expect(headers).toContain(hashOf("b()"));
  });
});
