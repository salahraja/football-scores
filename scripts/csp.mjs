// After the build: the site's Content-Security-Policy, written to dist/_headers (Netlify reads it).
// Astro wakes the homepage's Vue island with a small inline script. The policy allows exactly the inline scripts the build made,
// by their sha256, and nothing else inline: a script that is changed, or added by anyone else, is refused.
//   node scripts/csp.mjs [dist]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASE = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "connect-src": ["'self'", "https://sportscore.com"],
  "img-src": ["'self'", "data:"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
};

/** Every inline script that runs (src-less, and not a data block such as JSON-LD) in one page's HTML. */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== "module" && type !== "text/javascript" && type !== "application/javascript") continue;
    out.push(m[2]);
  }
  return out;
}

export const hashOf = (script) => `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`;

export function policy(hashes) {
  const p = { ...BASE, "script-src": [...BASE["script-src"], ...[...new Set(hashes)].sort()] };
  return Object.entries(p).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith(".html") ? [p] : [];
  });
}

export function writeHeaders(dist) {
  const hashes = htmlFiles(dist).flatMap((f) => inlineScripts(readFileSync(f, "utf8")).map(hashOf));
  writeFileSync(join(dist, "_headers"), `/*\n  Content-Security-Policy: ${policy(hashes)}\n`);
  return new Set(hashes).size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] ?? join(fileURLToPath(new URL("..", import.meta.url)), "dist");
  console.log(`csp: allowed ${writeHeaders(dist)} inline script(s) by hash in ${join(dist, "_headers")}`);
}
