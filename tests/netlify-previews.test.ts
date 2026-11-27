import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Salah, 2026-11-27: "skip previews". Netlify skips a build when the ignore command exits 0: previews of pull requests are skipped (they
// used 86 of November's first 153 free build minutes), live builds from merges and the rebuild hook still run.
const toml = readFileSync("netlify.toml", "utf8");
const ignore = /^\s*ignore\s*=\s*'([^']+)'/m.exec(toml)?.[1] ?? "";
const skips = (context: string) => { try { execSync(ignore, { env: { ...process.env, CONTEXT: context }, stdio: "ignore", shell: "/bin/sh" }); return true; } catch { return false; } };

describe("Netlify previews", () => {
  it("are skipped for pull requests", () => {
    expect(ignore).not.toBe("");
    expect(skips("deploy-preview")).toBe(true);
  });

  it("never skip a live build", () => {
    for (const context of ["production", "branch-deploy", ""]) expect(skips(context)).toBe(false);
  });
});
