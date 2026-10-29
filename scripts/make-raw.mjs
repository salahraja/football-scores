// Writes the raw input the data layer reads: data/raw/standings.json and results.json, from the sample data.
// This is the seam where a fetch step would drop real API data (same shapes as src/data/types.ts).
import { mkdirSync, writeFileSync } from "node:fs";
import { sampleResults, sampleStandings } from "../src/data/sample.ts";

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/standings.json", JSON.stringify(sampleStandings, null, 1) + "\n");
writeFileSync("data/raw/results.json", JSON.stringify(sampleResults, null, 1) + "\n");
console.log("wrote data/raw/standings.json and data/raw/results.json");
