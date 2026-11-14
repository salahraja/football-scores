// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeTable } from "../scripts/api/table.mjs";
import { footballBoxes, groupTables, parseBoxes } from "../scripts/api/tournament.mjs";

// AFCON qualifying: 48 nations in 12 groups of four, home and away, September 2026 to March 2027. Each group's Wikipedia page has one
// {{Football box}} per game with the date, the local kick-off and its UTC offset, and the score once played. The fixture is the real
// twelve pages as of 14 November 2026 (boxes only).
const saved = JSON.parse(readFileSync("tests/fixtures/wikipedia/2026-27/afcon.json", "utf8"));
const afcon = JSON.parse(readFileSync("data/api/tournaments.json", "utf8")).tournaments[0];
const box = (fields: Record<string, string>) => `{{Football box\n${Object.entries(fields).map(([k, v]) => `|${k} = ${v}`).join("\n")}\n}}`;

describe("reading a group page's match boxes", () => {
  it("reads a played game: date, local kick-off with its offset, the two nations and the score", () => {
    const [m] = parseBoxes(box({ id: "LES v MAR", date: "{{Start date|2026|9|29|df=y}}", time: "{{UTZ|15:00|2}}", team1: "{{fb-rt|LES}}", score: "0–2", team2: "{{fb|MAR}}" }), "A", "2026-11-14");
    expect(m).toEqual({ id: "afcon:2026-09-29:lesotho-morocco", round: "Group A", stage: "group", group: "A", date: "2026-09-29", time: "15:00",
      kickoff: "2026-09-29T15:00:00+02:00", home: "lesotho", away: "morocco", status: "finished", score: { ft: [0, 2], ht: null }, source: "wikipedia" });
  });

  it("reads offsets written +2, −1 (a minus sign) and 0", () => {
    const at = (t: string) => parseBoxes(box({ date: "{{Start date|2026|9|25|df=y}}", time: `{{UTZ|${t}}}`, team1: "{{fb-rt|NIG}}", score: "2–1", team2: "{{fb|LES}}" }), "A", "2026-11-14")[0].kickoff;
    expect(at("15:00|+2")).toBe("2026-09-25T15:00:00+02:00");
    expect(at("15:00|−1")).toBe("2026-09-25T15:00:00-01:00");
    expect(at("19:00|0")).toBe("2026-09-25T19:00:00+00:00");
  });

  it("a game not played yet has no score and, without a kick-off time, no kickoff", () => {
    const [m] = parseBoxes(box({ date: "{{Start date|2027|3|24|df=y}}", time: "", team1: "{{fb-rt|GAB}}", score: "", team2: "{{fb|MAR}}" }), "A", "2026-11-14");
    expect(m).toMatchObject({ date: "2027-03-24", time: null, kickoff: null, status: "scheduled", score: null });
  });

  it("does not trust a score on a game dated today or later: editors fill it in while the game is on", () => {
    const [m] = parseBoxes(box({ date: "{{Start date|2026|11|14|df=y}}", time: "{{UTZ|16:00|0}}", team1: "{{fb-rt|ANG}}", score: "1–0", team2: "{{fb|SSD}}" }), "B", "2026-11-14");
    expect(m).toMatchObject({ status: "scheduled", score: null });
  });

  it("stops on a nation it cannot name, so it gets a name, not a gap", () => {
    expect(() => parseBoxes(box({ date: "{{Start date|2026|9|25|df=y}}", time: "", team1: "{{fb-rt|XYZ}}", score: "", team2: "{{fb|MAR}}" }), "A", "2026-11-14"))
      .toThrow(/XYZ.*nations\.json/);
  });

  it("keeps only the match boxes from a page, braces balanced", () => {
    const page = `Intro {{cite web|x}}\n${box({ id: "A v B", stadium: "{{flagicon|KEN}} Nairobi" })}\nmore\n${box({ id: "C v D" })}\n==Goalscorers==`;
    expect(footballBoxes(page)).toBe(`${box({ id: "A v B", stadium: "{{flagicon|KEN}} Nairobi" })}\n${box({ id: "C v D" })}`);
  });

  it("the real pages: 12 groups of four, 12 games each, every nation playing six", () => {
    const all = afcon.groups.flatMap((g: string) => parseBoxes(saved.groups[g].wikitext, g, "2026-11-14"));
    expect(all).toHaveLength(144);
    const games = new Map<string, number>();
    for (const m of all) for (const t of [m.home, m.away]) games.set(t, (games.get(t) ?? 0) + 1);
    expect(games.size).toBe(48);
    expect([...games.values()].every((n) => n === 6)).toBe(true);
    expect(new Set(all.map((m: { id: string }) => m.id)).size).toBe(144);
  });
});

describe("the group tables", () => {
  const today = "2026-11-14";
  const tables = groupTables(afcon, Object.fromEntries(afcon.groups.map((g: string) => [g, parseBoxes(saved.groups[g].wikitext, g, today)])));

  it("Group A as Wikipedia's own table has it (13 November): Morocco, Gabon, Niger, Lesotho", () => {
    const a = tables.find((t: { group: string }) => t.group === "A")!;
    expect(a.table.map((r: { team: string }) => r.team)).toEqual(["morocco", "gabon", "niger", "lesotho"]);
    expect(a.table[0]).toMatchObject({ played: 3, won: 3, gf: 9, ga: 1, points: 9 });
  });

  it("all twelve groups in the order Wikipedia's own tables had on 13 November 2026 (Template:2027 Africa Cup of Nations qualification group tables)", () => {
    const wikipedia = {"A": ["morocco", "gabon", "niger", "lesotho"], "B": ["egypt", "angola", "malawi", "south-sudan"], "C": ["ivory-coast", "gambia", "ghana", "somalia"], "D": ["south-africa", "guinea", "kenya", "eritrea"], "E": ["dr-congo", "zimbabwe", "equatorial-guinea", "sierra-leone"], "F": ["benin", "burkina-faso", "mauritania", "central-african-republic"], "G": ["cameroon", "comoros", "namibia", "congo"], "H": ["uganda", "libya", "botswana", "tunisia"], "I": ["algeria", "zambia", "togo", "burundi"], "J": ["senegal", "mozambique", "sudan", "ethiopia"], "K": ["mali", "rwanda", "cape-verde", "liberia"], "L": ["guinea-bissau", "nigeria", "madagascar", "tanzania"]};
    expect(Object.fromEntries(tables.map((t: { group: string; table: { team: string }[] }) => [t.group, t.table.map((r) => r.team)]))).toEqual(wikipedia);
  });

  it("marks who is in line to qualify: the top two; in a host's group the host plus the best of the rest", () => {
    const a = tables.find((t: { group: string }) => t.group === "A")!;
    expect(a.table.map((r: { status: string | null }) => r.status)).toEqual(["qualify", "qualify", null, null]);
    const d = tables.find((t: { group: string }) => t.group === "D")!;
    const kenya = d.table.find((r: { team: string }) => r.team === "kenya")!;
    expect(kenya.status).toBe("host");
    expect(d.table.filter((r: { status: string | null }) => r.status === "qualify")).toHaveLength(1);
    expect(d.table.find((r: { status: string | null }) => r.status === "qualify")!.position).toBe(d.table[0].team === "kenya" ? 2 : 1);
  });
});

describe("CAF's head-to-head rules", () => {
  const g = (home: string, away: string, h: number, a: number) => ({ id: `${home}-${away}`, round: null, stage: "group" as const, date: "2026-09-25", time: null,
    home, away, status: "finished" as const, score: { ft: [h, a] as [number, number], ht: null }, source: "test" });

  it("away goals between the teams still level on head-to-head points, goal difference and goals", () => {
    // a 2-3 b, then b 0-1 a: three points each, head-to-head 3-3; b scored 3 away from home, a scored 1
    const table = computeTable([g("a", "b", 2, 3), g("b", "a", 0, 1)], { tiebreak: ["points", "h2h_points", "h2h_gd", "h2h_gf", "h2h_away_gf", "gd"] });
    expect(table.map((r: { team: string }) => r.team)).toEqual(["b", "a"]);
  });
});

describe("the API for a tournament", () => {
  const { mkdtempSync, rmSync, mkdirSync, copyFileSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const { build } = require("../scripts/api/build.mjs");
  const make = () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-afcon-")), wiki = mkdtempSync(join(tmpdir(), "golboard-afcon-wiki-"));
    mkdirSync(join(wiki, "2026-27"));
    copyFileSync("tests/fixtures/wikipedia/2026-27/afcon.json", join(wiki, "2026-27", "afcon.json"));
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-11-14T03:00:00Z" });
    return { out, done: () => { rmSync(out, { recursive: true, force: true }); rmSync(wiki, { recursive: true, force: true }); } };
  };
  const read = (out: string, p: string) => JSON.parse(readFileSync(join(out, p), "utf8"));

  it("writes tournaments.json and the tournament's matches, groups and teams, and leaves the club leagues' list alone", () => {
    const { out, done } = make();
    try {
      expect(read(out, "api/v1/tournaments.json").tournaments).toEqual([{ id: "afcon", name: "AFCON qualifying", full: "Africa Cup of Nations qualifying",
        region: "Africa", season: "2026-27", finals: "Kenya, Tanzania and Uganda, from 19 June 2027" }]);
      expect(read(out, "api/v1/competitions.json").competitions.map((c: { id: string }) => c.id)).not.toContain("afcon");
      expect(read(out, "api/v1/afcon/2026-27/matches.json").matches).toHaveLength(144);
      const groups = read(out, "api/v1/afcon/2026-27/groups.json");
      expect(groups.groups).toHaveLength(12);
      expect(groups.qualify).toBe(2);
      expect(read(out, "api/v1/afcon/2026-27/teams.json").teams.morocco).toBe("Morocco");
      const meta = read(out, "api/v1/meta.json");
      expect(meta.tournaments.afcon["2026-27"]).toMatchObject({ scheduled: expect.any(Number), lastResult: expect.stringMatching(/^2026-11-1/) });
      expect(Object.keys(meta.files)).toContain("api/v1/afcon/2026-27/groups.json");
    } finally { done(); }
  });

  it("every file matches its shape in the schema", async () => {
    const Ajv = (await import("ajv/dist/2020")).default;
    const schema = JSON.parse(readFileSync("data/api/schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    ajv.addSchema(schema);
    const check = (def: string, body: unknown) => (ajv.validate(`${schema.$id}#/$defs/${def}`, body) ? [] : ajv.errors!.map((e) => `${e.instancePath} ${e.message}`));
    const { out, done } = make();
    try {
      expect(check("tournaments", read(out, "api/v1/tournaments.json"))).toEqual([]);
      expect(check("tournamentMatches", read(out, "api/v1/afcon/2026-27/matches.json"))).toEqual([]);
      expect(check("groups", read(out, "api/v1/afcon/2026-27/groups.json"))).toEqual([]);
      expect(check("tournamentTeams", read(out, "api/v1/afcon/2026-27/teams.json"))).toEqual([]);
      expect(check("meta", read(out, "api/v1/meta.json"))).toEqual([]);
    } finally { done(); }
  });
});

describe("downloading a tournament's group pages", () => {
  const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const reply = (title: string, revid: number, text: string) => ({ ok: true, status: 200,
    json: async () => ({ query: { pages: [{ title, revisions: [{ revid, timestamp: "2026-11-14T00:00:00Z", slots: { main: { content: text } } }] }] } }) });
  const box = "{{Football box\n|date = {{Start date|2026|9|25|df=y}}\n|team1 = {{fb-rt|NIG}}\n|score = 2–1\n|team2 = {{fb|LES}}\n}}";

  it("saves every group's match boxes, with each page's revision, in one file", async () => {
    const { fetchTournament } = await import("../scripts/api/fetch-wikipedia.mjs");
    const out = mkdtempSync(join(tmpdir(), "golboard-afcon-fetch-"));
    try {
      const asked: string[] = [];
      const report = await fetchTournament({ out, tournament: { ...afcon, groups: ["A", "B"] }, fetchFn: async (url: string) => {
        asked.push(decodeURIComponent(url));
        return reply(url.includes("Group%20A") ? "2027 Africa Cup of Nations qualification Group A" : "2027 Africa Cup of Nations qualification Group B",
          url.includes("Group%20A") ? 11 : 12, `Intro text\n${box}\n==Goalscorers==`) as never;
      } });
      expect(report).toEqual({ saved: ["2026-27/afcon"], kept: [] });
      const saved = JSON.parse(readFileSync(join(out, "2026-27", "afcon.json"), "utf8"));
      expect(saved.groups.A).toMatchObject({ title: "2027 Africa Cup of Nations qualification Group A", revid: 11, wikitext: box });
      expect(saved.groups.B.revid).toBe(12);
      expect(asked.some((u) => u.includes("titles=2027 Africa Cup of Nations qualification Group A"))).toBe(true);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });

  it("keeps the whole saved file when any group fails, so a table never mixes two days", async () => {
    const { fetchTournament } = await import("../scripts/api/fetch-wikipedia.mjs");
    const out = mkdtempSync(join(tmpdir(), "golboard-afcon-fetch-"));
    try {
      mkdirSync(join(out, "2026-27"));
      writeFileSync(join(out, "2026-27", "afcon.json"), JSON.stringify({ kept: true }));
      const report = await fetchTournament({ out, tournament: { ...afcon, groups: ["A", "B"] }, fetchFn: async (url: string) =>
        (url.includes("Group%20B") ? { ok: false, status: 503 } : reply("A", 1, box)) as never });
      expect(report.kept).toEqual(["2026-27/afcon (Group B: HTTP 503)"]);
      expect(JSON.parse(readFileSync(join(out, "2026-27", "afcon.json"), "utf8"))).toEqual({ kept: true });
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe("the tournament's page", () => {
  const { mkdtempSync, rmSync, mkdirSync, copyFileSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const { build } = require("../scripts/api/build.mjs");
  const site = async () => {
    const { pages } = await import("../scripts/api/pages.mjs");
    const out = mkdtempSync(join(tmpdir(), "golboard-afcon-site-")), wiki = mkdtempSync(join(tmpdir(), "golboard-afcon-wiki-"));
    mkdirSync(join(wiki, "2026-27"));
    copyFileSync("tests/fixtures/wikipedia/2026-27/afcon.json", join(wiki, "2026-27", "afcon.json"));
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: "2026-11-14T03:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    const page = (p: string) => readFileSync(join(out, p), "utf8");
    return { page, done: () => { rmSync(out, { recursive: true, force: true }); rmSync(wiki, { recursive: true, force: true }); } };
  };

  it("shows all twelve groups as real tables, the places that go through marked, in order", async () => {
    const { page, done } = await site();
    try {
      const html = page("leagues/afcon/index.html");
      expect(html).toContain("<title>AFCON qualifying groups, results and fixtures | golboard</title>");
      expect((html.match(/<table class="standings">/g) ?? []).length).toBe(12);
      for (const g of "ABCDEFGHIJKL") expect(html).toContain(`<h3 id="group-${g.toLowerCase()}">Group ${g}</h3>`);
      expect((html.match(/<tr class="row"/g) ?? []).length).toBe(48);
      const a = html.slice(html.indexOf('id="group-a"'), html.indexOf('id="group-b"'));
      expect([...a.matchAll(/<th scope="row" class="left">([^<]+)<\/th>/g)].map((m) => m[1])).toEqual(["Morocco", "Gabon", "Niger", "Lesotho"]);
      expect((html.match(/data-zone="qualify"/g) ?? []).length).toBeGreaterThanOrEqual(21);  // 12 x 2, less one per host group, plus the legend
      expect((html.match(/<tr class="row" data-zone="host"/g) ?? []).length).toBe(3);
      expect(html).toContain("Top 2 in each group go to the finals");
      expect(html).toMatch(/Kenya, Tanzania and Uganda are in the finals already as hosts/);
    } finally { done(); }
  });

  it("the title is the big block, with the arrows' slots kept so it centres like a league's; the groups section is the wide one", async () => {
    const { page, done } = await site();
    try {
      const html = page("leagues/afcon/index.html");
      expect(html).toMatch(/<div class="titlebar solo"><span aria-hidden="true"><\/span><h1 style="--n: 10">AFCON qualifying<\/h1><span aria-hidden="true"><\/span><\/div>/);
      expect(html).toContain('<section class="glass wide" id="table">');
      const css = page("leagues/site.css");
      expect(css).toMatch(/\.titlebar\.solo h1 \{[^}]*100vw - 40px/);
      expect(css).toMatch(/\.groups \.standings \{ table-layout: fixed;/);
      expect(css).toMatch(/@media \(min-width: 861px\) \{ \.board > \.wide \{ grid-column: 1 \/ -1; order: 3; \} \.board:has\(> \.wide\) > footer \{ order: 4; \} \}/);
    } finally { done(); }
  });

  it("lists the latest results and the next fixtures, with the date, the group and local kick-off times", async () => {
    const { page, done } = await site();
    try {
      const html = page("leagues/afcon/index.html");
      expect(html).toContain("<h2>Latest results</h2>");
      expect(html).toContain("<h2>Next fixtures</h2>");
      expect(html).toMatch(/<span class="when">Group [A-L] · Tue 17 Nov<\/span>/);
      expect(html).toContain("Kick-offs are local time at each ground.");
      expect(html).toMatch(/Results from <a href="https:\/\/en\.wikipedia\.org\/[^"]*">Wikipedia<\/a>/);
    } finally { done(); }
  });

  it("the leagues index has an International section, and the club leagues' arrows still go round the leagues only", async () => {
    const { page, done } = await site();
    try {
      const index = page("leagues/index.html");
      expect(index).toContain("<h2>International</h2>");
      expect(index).toContain('href="/leagues/afcon/"');
      expect(page("leagues/en-2/index.html")).not.toContain('href="/leagues/afcon/"');
      expect(page("sitemap.xml")).toContain("/leagues/afcon/</loc>");
    } finally { done(); }
  });
});

describe("late results in a tournament", () => {
  it("api:check names a tournament whose results have stalled, as it does a league", async () => {
    const { check } = await import("../scripts/api/check-fresh.mjs");
    const meta = { leagues: {}, tournaments: { afcon: { "2026-27": { finished: 80, scheduled: 64, lastResult: "2026-11-13", overdue: 3, wikipedia: {} } } } };
    expect(check(meta)).toEqual(["afcon 2026-27: 3 results more than 3 days late (newest result 2026-11-13)"]);
    meta.tournaments.afcon["2026-27"].overdue = 0;
    expect(check(meta)).toEqual([]);
  });
});
