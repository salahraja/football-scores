// TS reference: node goose/run_ts.mjs table|rounds < input.json  (same output format as table.goose)
import { readFileSync } from "node:fs";
import { buildTable, groupByRound } from "../src/data/helpers.ts";

const mode = process.argv[2] ?? "table";
const input = JSON.parse(readFileSync(0, "utf8"));
if (mode === "rounds") {
  const g = groupByRound(input);
  process.stdout.write(JSON.stringify([...g].map(([r, es]) => [r, es.map((e) => e.id)])) + "\n");
} else {
  process.stdout.write(JSON.stringify(buildTable(input)) + "\n");
}
