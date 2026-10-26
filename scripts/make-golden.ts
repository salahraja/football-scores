// Writes tests/golden/<fixture>: the TS reference output for every fixture, so the Python tests need no Node.
//   node scripts/make-golden.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { runEngine } from "./engines.ts";

mkdirSync("tests/golden", { recursive: true });
for (const f of readdirSync("tests/fixtures").sort()) {
  const m = f.match(/^(.*)\.(standings|results)\.json$/);
  if (!m || m[1] === "outside-latin") continue;
  writeFileSync(`tests/golden/${f}`, runEngine("ts", m[2] as "standings" | "results", readFileSync(`tests/fixtures/${f}`, "utf8")));
}
console.log("wrote tests/golden");
