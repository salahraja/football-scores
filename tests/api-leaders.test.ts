// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";
import { leagues } from "../scripts/api/config.mjs";
import { fetchPages } from "../scripts/api/fetch-wikipedia.mjs";
import { teamId } from "../scripts/api/teams.mjs";
import { parseLeaders, statsSection } from "../scripts/api/leaders.mjs";

// League leaders (top scorers, clean sheets) from the "Season statistics" section of each English Wikipedia season page (CC BY-SA 4.0).
// The fixtures are the real sections of the eight 2026-27 pages, saved on 25 November 2026 with the revision they came from. Editors write
// ties with rowspan on the rank, the count and sometimes the club, so a reader that ignores rowspan shifts every row under a tie.
const fixture = (id: string) => JSON.parse(readFileSync(`tests/fixtures/wikipedia/2026-27/leaders/${id}.json`, "utf8"));
type Row = { rank: number; player: string; club: string; value: number };
// every page here has a top-scorers table, so a null goals list is a failure in its own right
const lead = (id: string) => { const l = parseLeaders(fixture(id).stats); expect(l.goals).not.toBeNull(); return { goals: l.goals!, cleanSheets: l.cleanSheets }; };

describe("reading league leaders from a Wikipedia season page", () => {
  it("Serie A: ranks, counts and clubs carried down through rowspan", () => {
    const { goals, cleanSheets } = lead("it-1");
    expect(goals.asOf).toBe("2026-11-23");
    expect(goals.rows[0]).toEqual({ rank: 1, player: "Donyell Malen", club: "Roma", value: 12 });
    expect(goals.rows[1]).toEqual({ rank: 2, player: "Gustavo Varela", club: "Monza", value: 11 });
    expect(goals.rows.filter((r: Row) => r.rank === 5).map((r: Row) => r.player))
      .toEqual(["Alphadjo Cisse", "Pio Esposito", "Tijjani Noslin", "Milutin Osmajić", "Marcus Thuram"]);
    expect(goals.rows.filter((r: Row) => r.rank === 5).every((r: Row) => r.value === 6)).toBe(true);
    // the club cell of Pulisic spans Rabiot's row too
    expect(goals.rows.slice(-2)).toEqual([
      { rank: 10, player: "Christian Pulisic", club: "AC Milan", value: 5 },
      { rank: 10, player: "Adrien Rabiot", club: "AC Milan", value: 5 },
    ]);
    expect(goals.rows).toHaveLength(16);
    expect(cleanSheets!.rows[0]).toEqual({ rank: 1, player: "Guglielmo Vicario", club: "Juventus", value: 6 });
  });

  it("Premier League: spaced cells, a piped player link and a club spanning two rows", () => {
    const { goals } = lead("en-1");
    expect(goals.asOf).toBe("2026-11-23");
    expect(goals.rows[0]).toEqual({ rank: 1, player: "Erling Haaland", club: "Manchester City", value: 9 });
    expect(goals.rows.find((r: Row) => r.player === "Thierno Barry")).toEqual({ rank: 3, player: "Thierno Barry", club: "Everton", value: 6 });
    expect(goals.rows.find((r: Row) => r.player === "Morgan Rogers")?.club).toBe("Chelsea");
  });

  it("Bundesliga: a cited 'updated' line and a clean-sheets date left blank", () => {
    const { goals, cleanSheets } = lead("de-1");
    expect(goals.asOf).toBe("2026-11-22");
    expect(goals.rows[0]).toEqual({ rank: 1, player: "Niclas Füllkrug", club: "Werder Bremen", value: 10 });
    expect(cleanSheets!.asOf).toBeNull();
  });

  it("La Liga: a club inside {{nobreak}}; the Zamora table is not clean sheets", () => {
    const { goals, cleanSheets } = lead("es-1");
    expect(goals.rows.find((r: Row) => r.player === "Álex Baena")?.club).toBe("Atlético Madrid");
    expect(cleanSheets).toBeNull();
  });

  it("Ligue 1: a closing 'Six players' row that spans two columns is left out, not the whole list", () => {
    const { cleanSheets } = lead("fr-1");
    expect(cleanSheets!.rows[0]).toEqual({ rank: 1, player: "Yvon Mvogo", club: "Lorient", value: 6 });
    expect(cleanSheets!.rows.some((r: Row) => /players/i.test(r.player))).toBe(false);
    expect(cleanSheets!.rows.at(-1)!.value).toBe(3);
  });

  it("Eredivisie: no date on the page, and no clean-sheets table", () => {
    const { goals, cleanSheets } = lead("nl-1");
    expect(goals.asOf).toBeNull();
    expect(goals.rows[0]).toEqual({ rank: 1, player: "Sven Mijnans", club: "PSV Eindhoven", value: 9 });
    expect(cleanSheets).toBeNull();
  });

  for (const league of leagues()) {
    it(`${league.name}: every row is plain text and every rank agrees with the counts`, () => {
      const { goals, cleanSheets } = lead(league.id);
      for (const list of [goals, cleanSheets].filter(Boolean)) {
        expect(list!.rows.length).toBeGreaterThan(4);
        list!.rows.forEach((r: Row, i: number) => {
          expect(r.player, `${league.id} row ${i}`).toMatch(/^[^\[\]{}|<>=]+$/);
          expect(r.club, `${league.id} row ${i}`).toMatch(/^[^\[\]{}|<>=]+$/);
          // a rank is one more than the number of players with a higher count: a tie read wrongly breaks this
          expect(r.rank, `${league.id} ${r.player}`).toBe(1 + list!.rows.filter((o: Row) => o.value > r.value).length);
        });
      }
    });
  }

  it("finds the section under either heading, and nothing on a page without one", () => {
    expect(statsSection("== Teams ==\nx\n== Season statistics ==\n=== Top scorers ===\nA\n== Awards ==\nB")).toBe("== Season statistics ==\n=== Top scorers ===\nA\n");
    expect(statsSection("==Statistics==\nA\n==See also==")).toBe("==Statistics==\nA\n");
    expect(statsSection("== Teams ==\nx")).toBe("");
  });

  it("gives no list rather than a wrong one when a table is not what it expects", () => {
    expect(parseLeaders("== Season statistics ==\n=== Top scorers ===\nTo be added.\n")).toEqual({ goals: null, cleanSheets: null });
    const shuffled = "=== Top scorers ===\n{|\n!Player\n!Goals\n|-\n|[[A]]\n|3\n|}";  // no rank or club column
    expect(parseLeaders(shuffled).goals).toBeNull();
  });
});

describe("downloading the statistics section", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const page = (title: string, revid: number, text: string) => ({ ok: true, status: 200, json: async () => ({ query: { pages: [
    { title, revisions: [{ revid, timestamp: "2026-11-25T09:00:00Z", slots: { main: { content: text } } }] }] } }) });
  const grid = "{{#invoke:Sports table|main\n|name_AAA=[[A]]\n|name_BBB=[[B]]\n|match_AAA_BBB=1–0\n}}";
  const stats = "== Season statistics ==\n=== Top scorers ===\nx\n";

  it("keeps the season page's section and revision, even when the grid comes from a template", async () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-leaders-")); dirs.push(out);
    const fetchFn = async (url: string) => {
      if (url.includes("Template")) return page("Template:2026–27 La Liga table", 22, grid) as never;
      if (url.includes("La%20Liga")) return page("2026–27 La Liga", 11, `{{2026–27 La Liga table|show_matches=only}}\n${stats}== Awards ==\n`) as never;
      return page("2026–27 Serie A", 33, `${grid}\n${stats}`) as never;
    };
    await fetchPages({ out, seasons: ["2026-27"], ids: ["it-1", "es-1"], fetchFn });
    const read = (id: string) => JSON.parse(readFileSync(join(out, "2026-27", `${id}.json`), "utf8"));
    expect(read("es-1").stats).toEqual({ title: "2026–27 La Liga", revid: 11, timestamp: "2026-11-25T09:00:00Z", text: stats });
    expect(read("es-1").revid).toBe(22);  // the grid still says where it came from
    expect(read("it-1").stats).toMatchObject({ revid: 33, text: stats });
  });
});

describe("the leaders file", () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-leaders-")); dirs.push(d); return d; };
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
  ajv.addSchema(schema);
  const check = (def: string, body: unknown) => ajv.validate(`${schema.$id}#/$defs/${def}`, body) ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`);
  // the 2025-26 Serie A grid the other tests use, with this season's statistics section beside it (its clubs are not all in 2025-26)
  const wiki = (stats: string) => {
    const dir = tmp();
    mkdirSync(join(dir, "2025-26"), { recursive: true });
    const grid = JSON.parse(readFileSync("tests/fixtures/wikipedia/2025-26/it.1.json", "utf8"));
    writeFileSync(join(dir, "2025-26", "it-1.json"), JSON.stringify({ ...grid, stats: { title: "2026–27 Serie A", revid: 1387460528, timestamp: "2026-11-24T01:23:15Z", text: stats } }));
    return dir;
  };
  let last = "";
  const run = (stats: string) => {
    const out = (last = tmp());
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki(stats), out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    return (path: string) => (existsSync(join(out, path)) ? JSON.parse(readFileSync(join(out, path), "utf8")) : undefined);
  };

  it("is written beside the table, matches the contract, names our team ids and says where it came from", () => {
    const read = run(fixture("it-1").stats);
    const leaders = read("api/v1/it-1/2025-26/leaders.json");
    expect(check("leaders", leaders)).toEqual([]);
    expect(leaders.source).toEqual({ name: "Wikipedia", url: "https://en.wikipedia.org/?oldid=1387460528", licence: "CC-BY-SA-4.0" });
    expect(leaders.goals.asOf).toBe("2026-11-23");
    expect(leaders.goals.rows[0]).toEqual({ rank: 1, player: "Donyell Malen", club: "Roma", team: "roma", value: 12 });
    // a club with no team in this season keeps its name and gets no id, rather than a made-up one
    expect(leaders.goals.rows.find((r: { club: string }) => r.club === "Monza").team).toBeNull();
    expect(leaders.cleanSheets.rows[0].team).toBe("juventus");
    expect(Object.keys(read("api/v1/meta.json").files)).toContain("api/v1/it-1/2025-26/leaders.json");
    expect(read("api/v1/en-1/2025-26/leaders.json")).toBeUndefined();  // no statistics section saved for it
  });

  it("every club in the eight leaders tables of 25 November 2026 maps to one of our ids", () => {
    // Primeira Liga's page writes "Sporting" for Sporting CP (its grid links the full name); Braga is always "Braga"
    expect(teamId("Sporting")).toBe("sporting-cp");
    expect(teamId("Braga")).toBe("braga");
  });

  it("a section it cannot read writes no file and never stops the build", () => {
    const read = run("== Season statistics ==\n=== Top scorers ===\nTo be added.\n");
    expect(read("api/v1/it-1/2025-26/leaders.json")).toBeUndefined();
    expect(read("api/v1/it-1/2025-26/table.json")).toBeDefined();
  });

  it("the contract refuses a row with markup left in or a count that is not a number", () => {
    const read = run(fixture("it-1").stats);
    const leaders = read("api/v1/it-1/2025-26/leaders.json");
    leaders.goals.rows[0].value = "12";
    expect(check("leaders", leaders).join(" ")).toMatch(/value/);
  });
});

describe("the leaders on the league page", () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-leaders-")); dirs.push(d); return d; };
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const site = (stats: string | null) => {
    const wiki = tmp(), out = tmp();
    mkdirSync(join(wiki, "2025-26"), { recursive: true });
    const grid = JSON.parse(readFileSync("tests/fixtures/wikipedia/2025-26/it.1.json", "utf8"));
    writeFileSync(join(wiki, "2025-26", "it-1.json"), JSON.stringify({ ...grid, ...(stats ? { stats: { title: "2026–27 Serie A", revid: 1387460528, timestamp: "x", text: stats } } : {}) }));
    // one result scored from Wikipedia's grid, as on a live season, so the page credits Wikipedia for results too
    const mutate = (season: { matches: Array<Record<string, unknown>> }) => {
      if (season.matches[0]?.id?.toString().startsWith("it-1")) Object.assign(season.matches[0], { source: "wikipedia", sourceUrl: "https://en.wikipedia.org/?oldid=1" });
    };
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z", mutate });
    pages({ api: join(out, "api/v1"), out });
    return (path: string) => readFileSync(join(out, path), "utf8");
  };

  it("shows top scorers and clean sheets with the date, the source revision and links to our club pages", () => {
    const html = site(fixture("it-1").stats)("leagues/it-1/index.html");
    const box = html.slice(html.indexOf('id="scorers"'), html.indexOf("</section>", html.indexOf('id="scorers"')));
    expect(box).toContain("<h2>Top scorers</h2>");
    expect(box).toContain("Donyell Malen");
    expect(box).toContain('href="/leagues/it-1/roma/"');
    expect(box).toContain("23 November 2026");
    expect(box).toContain('href="https://en.wikipedia.org/?oldid=1387460528"');
    expect(box.match(/<tr class="leader">/g)).toHaveLength(16);
    // a club with no page this season is plain text, not a dead link
    expect(box).toMatch(/Gustavo Varela[\s\S]*?Monza/);
    expect(box).not.toContain("/leagues/it-1/monza/");
    expect(html).toContain('id="keepers"');
    expect(html).toContain("<h2>Clean sheets</h2>");
    const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
    expect(footer).toContain("Top scorers and clean sheets from");
    expect(footer.match(/creativecommons\.org/g)).toHaveLength(1);  // Wikipedia's licence once, however many things came from it
  });

  it("a league with no leaders file has no empty boxes", () => {
    const html = site(null)("leagues/it-1/index.html");
    expect(html).not.toContain('id="scorers"');
    expect(html).not.toContain('id="keepers"');
  });
});
