// The TS engine of `npm run data`: raw JSON in, static JSON out, using src/data/build.ts (the original logic).
// Usage: node scripts/gen-ts.mjs [rawDir=data/raw] [outDir=src/data/generated]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resultsData, serialize, standingsData } from "../src/data/build.ts";

const [raw = "data/raw", out = "src/data/generated"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const read = (f) => JSON.parse(readFileSync(`${raw}/${f}`, "utf8"));
writeFileSync(`${out}/standings.json`, serialize(standingsData(read("standings.json"))));
writeFileSync(`${out}/results.json`, serialize(resultsData(read("results.json"))));
console.log(`engine=ts  wrote ${out}/standings.json and ${out}/results.json`);
