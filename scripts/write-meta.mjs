// Writes <out>/meta.json: the source of the data (from <raw>/meta.json, written by fetch-data.mjs; "snapshot" if absent
// or unreadable) plus the engine that produced the generated files.
//   node scripts/write-meta.mjs data/raw src/data/generated goose
import { readFileSync, writeFileSync } from "node:fs";

const [raw, out, engine] = process.argv.slice(2);
let meta = { source: "snapshot" };
try {
  const m = JSON.parse(readFileSync(`${raw}/meta.json`, "utf8"));
  if (m?.source === "live" && typeof m.fetchedAt === "string") meta = m;
} catch {
  // no meta file: the committed snapshot
}
writeFileSync(`${out}/meta.json`, JSON.stringify({ ...meta, engine }) + "\n");
