import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";

// The API's contract: one JSON Schema (data/api/schema.json), published beside the data as api/v1/schema.json so the web pages and the
// iPhone app read the same shapes. meta.json lists every file with its sha256, so a reader can tell a half-published or stale copy.
const out = mkdtempSync(join(tmpdir(), "golboard-schema-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));
build({ input: "tests/fixtures/openfootball", out, seasons: ["2025-26"], now: "2026-10-31T03:00:00Z" });
const read = (path: string) => JSON.parse(readFileSync(join(out, path), "utf8"));
const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false }) // strictRequired trips on "required" inside if/then;
ajv.addSchema(schema);
const check = (def: string, body: unknown) => {
  const valid = ajv.validate(`${schema.$id}#/$defs/${def}`, body);
  return valid ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`);
};

describe("the API contract", () => {
  it("is published beside the data", () => {
    expect(read("api/v1/schema.json")).toEqual(schema);
  });

  it("every file the build writes matches its shape in the schema", () => {
    expect(check("competitions", read("api/v1/competitions.json"))).toEqual([]);
    expect(check("meta", read("api/v1/meta.json"))).toEqual([]);
    for (const { id, seasons } of read("api/v1/competitions.json").competitions) {
      for (const season of seasons) {
        expect(check("matches", read(`api/v1/${id}/${season}/matches.json`)), `${id} matches`).toEqual([]);
        expect(check("table", read(`api/v1/${id}/${season}/table.json`)), `${id} table`).toEqual([]);
        expect(check("teams", read(`api/v1/${id}/${season}/teams.json`)), `${id} teams`).toEqual([]);
      }
    }
  });

  it("catches a broken file", () => {
    const table = read("api/v1/it-1/2025-26/table.json");
    table.table[0].points = "87";
    expect(check("table", table).join(" ")).toMatch(/points/);
    const matches = read("api/v1/it-1/2025-26/matches.json");
    matches.matches[0].status = "live";
    expect(check("matches", matches).length).toBeGreaterThan(0);
  });

  it("meta lists every file with its sha256", () => {
    const { files } = read("api/v1/meta.json");
    const paths = Object.keys(files).sort();
    expect(paths).toContain("api/v1/competitions.json");
    expect(paths).toContain("api/v1/it-1/2025-26/table.json");
    expect(paths).not.toContain("api/v1/meta.json");
    for (const path of paths) {
      expect(files[path], path).toBe(createHash("sha256").update(readFileSync(join(out, path))).digest("hex"));
    }
  });
});
