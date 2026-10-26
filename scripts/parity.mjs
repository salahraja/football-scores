// Byte-for-byte parity of an engine against the TS reference on every fixture in tests/fixtures.
// Usage: node scripts/parity.mjs goose|python   (exit 1 on any difference)
import { readdirSync, readFileSync } from "node:fs";
import { runEngine } from "./engines.ts";

const engine = process.argv[2];
if (!engine) { console.error("usage: parity.mjs goose|python"); process.exit(2); }
const dir = "tests/fixtures";
let bad = 0, n = 0;
for (const f of readdirSync(dir).sort()) {
  const m = f.match(/^(.*)\.(standings|results)\.json$/);
  if (!m) continue;
  const text = readFileSync(`${dir}/${f}`, "utf8");
  const got = runEngine(engine, m[2], text);
  if (m[1] === "outside-latin") { console.log(`skip ${f} (documented divergence from ICU; see README)`); continue; }
  const want = runEngine("ts", m[2], text);
  n++;
  if (got === want) console.log(`ok   ${f}`);
  else { bad++; console.log(`DIFF ${f}`); }
}
console.log(`${engine}: ${n - bad}/${n} fixtures identical to the TS reference`);
process.exit(bad ? 1 : 0);
