// @vitest-environment node
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { tournaments } from "../scripts/api/config.mjs";
import { computeTable } from "../scripts/api/table.mjs";
import { teamId } from "../scripts/api/teams.mjs";
import { groupTables, matchText, pageGames } from "../scripts/api/tournament.mjs";
import { parseResults } from "../scripts/api/wikipedia.mjs";

// Cups and international tournaments, from English Wikipedia (data/api/tournaments.json): AFCON qualifying (12 groups of four), the
// Champions, Europa and Conference League league phases (one table of 36 each) and the Nations League (14 groups in Leagues A to D).
// Each game is one match box. The fixtures are the real pages as of 14 November 2026, cut to their headings and match boxes.
const FIX = "tests/fixtures/wikipedia/2026-27";
const TODAY = "2026-11-14";
const all = tournaments();
const byId = (id: string) => all.find((t) => t.id === id)!;
const saved = (id: string) => JSON.parse(readFileSync(`${FIX}/${id}.json`, "utf8"));
const games = (id: string) => { const t = byId(id), s = saved(id); return t.pages.flatMap((p) => pageGames(s.pages[p.title].wikitext, p, t, TODAY).games); };
const tablesOf = (id: string) => groupTables(byId(id), games(id));
const order = (id: string) => Object.fromEntries(tablesOf(id).map((g) => [g.group, g.table.map((r) => r.team)]));
const box = (fields: Record<string, string>) => `{{Football box\n${Object.entries(fields).map(([k, v]) => `|${k} = ${v}`).join("\n")}\n}}`;
const AFCON_PAGE = { title: "x", group: "A", name: "Group A" };
const one = (fields: Record<string, string>, page: object = AFCON_PAGE, t: object = byId("afcon")) => pageGames(box(fields), page as never, t as never, TODAY).games[0];

describe("reading match boxes", () => {
  it("a played AFCON game: date, local kick-off with its offset, the two nations and the score", () => {
    expect(one({ date: "{{Start date|2026|9|29|df=y}}", time: "{{UTZ|15:00|2}}", team1: "{{fb-rt|LES}}", score: "0–2", team2: "{{fb|MAR}}" })).toEqual({
      id: "afcon:2026-09-29:lesotho-morocco", round: "Group A", stage: "group", group: "A", name: "Group A", division: null, date: "2026-09-29", time: "15:00",
      kickoff: "2026-09-29T15:00:00+02:00", home: "lesotho", away: "morocco", status: "finished", score: { ft: [0, 2], ht: null }, source: "wikipedia" });
  });

  it("reads offsets written +2, −1 (a minus sign) and 0", () => {
    const at = (t: string) => one({ date: "{{Start date|2026|9|25|df=y}}", time: `{{UTZ|${t}}}`, team1: "{{fb-rt|NIG}}", score: "2–1", team2: "{{fb|LES}}" }).kickoff;
    expect(at("15:00|+2")).toBe("2026-09-25T15:00:00+02:00");
    expect(at("15:00|−1")).toBe("2026-09-25T15:00:00-01:00");
    expect(at("19:00|0")).toBe("2026-09-25T19:00:00+00:00");
  });

  it("a game not played yet has no score and, without a kick-off time, no kickoff", () => {
    expect(one({ date: "{{Start date|2027|3|24|df=y}}", time: "", team1: "{{fb-rt|GAB}}", score: "", team2: "{{fb|MAR}}" }))
      .toMatchObject({ date: "2027-03-24", time: null, kickoff: null, status: "scheduled", score: null });
  });

  it("does not trust a score on a game dated today or later: editors fill it in while the game is on", () => {
    expect(one({ date: "{{Start date|2026|11|14|df=y}}", time: "{{UTZ|16:00|0}}", team1: "{{fb-rt|ANG}}", score: "1–0", team2: "{{fb|SSD}}" }))
      .toMatchObject({ status: "scheduled", score: null });
  });

  it("stops on a nation it cannot name, so it gets a name, not a gap", () => {
    expect(() => one({ date: "{{Start date|2026|9|25|df=y}}", time: "", team1: "{{fb-rt|XYZ}}", score: "", team2: "{{fb|MAR}}" })).toThrow(/XYZ.*nations\.json/);
  });

  it("a club game: the linked article is the club's id and the link text its name; a plain time is in the tournament's clock", () => {
    const ucl = byId("champions-league");
    const g = one({ date: "{{Start date|2026|9|8|df=y}}", time: "18:45&nbsp;{{small|(19:45 [[UTC+03:00|UTC+3]])}}", team1: "[[AEK Athens F.C.|AEK Athens]] {{fbaicon|GRE}}",
      score: "1–0", team2: "{{fbaicon|AUT}} [[LASK]]" }, ucl.pages[0], ucl);
    expect(g).toMatchObject({ home: teamId("AEK Athens F.C."), away: "lask", time: "18:45", kickoff: "2026-09-08T18:45:00+02:00" });
    const names = pageGames(box({ date: "{{Start date|2026|11|4|df=y}}", time: "21:00", team1: "[[FC Porto|Porto]] {{fbaicon|POR}}", score: "1−0",
      team2: "{{fbaicon|ENG}} [[Manchester City F.C.|Manchester City]]" }), ucl.pages[0] as never, ucl as never, TODAY);
    expect(names.games[0]).toMatchObject({ kickoff: "2026-11-04T21:00:00+01:00", score: { ft: [1, 0], ht: null } });  // a minus sign in the score too
    expect(names.names).toEqual({ [teamId("FC Porto")]: "Porto", [teamId("Manchester City F.C.")]: "Manchester City" });
  });

  it("groups and matchdays from the page's headings; games below the groups (the quarter-finals) are left out", () => {
    const nl = byId("nations-league");
    const g = (team1: string, team2: string) => box({ date: "{{Start date|2026|9|25|df=y}}", time: "20:45", team1: `{{fb-rt|${team1}}}`, score: "0–2", team2: `{{fb|${team2}}}` });
    const text = `===Group 1===\n${g("ITA", "BEL")}\n===Group 2===\n${g("NED", "GER")}\n===Quarter-finals===\n${g("ESP", "POR")}`;
    const read = pageGames(text, nl.pages[0], nl, TODAY).games;
    expect(read.map((m) => [m.group, m.name, m.division, m.round])).toEqual([["A1", "League A, Group 1", "A", "League A, Group 1"], ["A2", "League A, Group 2", "A", "League A, Group 2"]]);
    const ucl = byId("champions-league");
    expect(pageGames(`===Matchday 3===\n${box({ date: "{{Start date|2026|10|21|df=y}}", time: "21:00", team1: "[[LASK]]", score: "", team2: "[[Arsenal F.C.|Arsenal]]" })}`,
      ucl.pages[0], ucl, TODAY).games[0]).toMatchObject({ group: "league", name: "League phase", round: "Matchday 3" });
  });

  it("keeps only a page's headings and its match boxes, cut to the fields we read", () => {
    const page = `Intro {{cite web|x}}\n==Matches==\n===Matchday 1===\n{{#invoke:Football box|main\n|date = {{Start date|2026|9|8|df=y}}\n|time = 21:00\n|team1 = [[LASK]]\n|score = 1–0\n|team2 = [[Arsenal F.C.|Arsenal]]\n|goals1 = {{goal|3}}\n|stadium = [[Linz]]\n}}\n==Notes==`;
    expect(matchText(page)).toBe("===Matchday 1===\n{{Football box\n|date = {{Start date|2026|9|8|df=y}}\n|time = 21:00\n|team1 = [[LASK]]\n|score = 1–0\n|team2 = [[Arsenal F.C.|Arsenal]]\n}}");
  });

  it("the real pages: every game, every team the right number of times", () => {
    const count = (id: string) => { const n = new Map<string, number>(); for (const m of games(id)) for (const t of [m.home, m.away]) n.set(t, (n.get(t) ?? 0) + 1); return n; };
    for (const [id, total, teams, each] of [["afcon", 144, 48, [6]], ["champions-league", 144, 36, [8]], ["europa-league", 144, 36, [8]],
      ["conference-league", 108, 36, [6]], ["nations-league", 156, 54, [6, 4]]] as const) {
      expect(games(id), id).toHaveLength(total);
      expect(new Set(games(id).map((m) => m.id)).size, id).toBe(total);
      expect(count(id).size, id).toBe(teams);
      expect([...count(id).values()].every((n) => (each as readonly number[]).includes(n)), id).toBe(true);
    }
    expect(tablesOf("nations-league").map((g) => g.group)).toEqual(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2"]);
  });
});

describe("the tables", () => {
  it("AFCON: all twelve groups in the order Wikipedia's own tables had on 13 November 2026", () => {
    const wikipedia = {"A": ["morocco", "gabon", "niger", "lesotho"], "B": ["egypt", "angola", "malawi", "south-sudan"], "C": ["ivory-coast", "gambia", "ghana", "somalia"], "D": ["south-africa", "guinea", "kenya", "eritrea"], "E": ["dr-congo", "zimbabwe", "equatorial-guinea", "sierra-leone"], "F": ["benin", "burkina-faso", "mauritania", "central-african-republic"], "G": ["cameroon", "comoros", "namibia", "congo"], "H": ["uganda", "libya", "botswana", "tunisia"], "I": ["algeria", "zambia", "togo", "burundi"], "J": ["senegal", "mozambique", "sudan", "ethiopia"], "K": ["mali", "rwanda", "cape-verde", "liberia"], "L": ["guinea-bissau", "nigeria", "madagascar", "tanzania"]};
    expect(order("afcon")).toEqual(wikipedia);
  });

  it("AFCON: the top two go through; in a host's group the host plus the best of the rest", () => {
    const t = tablesOf("afcon");
    expect(t.find((g) => g.group === "A")!.table.map((r) => r.status)).toEqual(["qualify", "qualify", null, null]);
    const d = t.find((g) => g.group === "D")!;
    expect(d.table.find((r) => r.team === "kenya")!.status).toBe("host");
    expect(d.table.filter((r) => r.status === "qualify").map((r) => r.position)).toEqual([d.table[0].team === "kenya" ? 2 : 1]);
  });

  it("Champions League: every one of our 72 scores equals Wikipedia's separate results grid", () => {
    const grid = new Map(parseResults(readFileSync(`${FIX}/champions-league-grid.wikitext`, "utf8")).map((r: { home: string; away: string; ft: number[] }) =>
      [`${teamId(r.home)}|${teamId(r.away)}`, r.ft]));
    const played = games("champions-league").filter((m) => m.score);
    expect(played).toHaveLength(72);
    for (const m of played) expect(grid.get(`${m.home}|${m.away}`), m.id).toEqual(m.score!.ft);
  });

  it("the club league phases: one table of 36; 1st to 8th to the round of 16, 9th to 24th to the play-offs", () => {
    for (const id of ["champions-league", "europa-league", "conference-league"]) {
      const [g] = tablesOf(id);
      expect(g).toMatchObject({ group: "league", name: "League phase" });
      expect(g.table.map((r) => r.status)).toEqual([...Array(8).fill("r16"), ...Array(16).fill("playoff"), ...Array(12).fill(null)]);
    }
  });

  it("Nations League: groups A4, B1, B2 and B4 in the order Wikipedia's editors typed on 12-13 November", () => {
    const o = order("nations-league");
    expect(o.A4).toEqual(["portugal", "denmark", "wales", "norway"]);
    expect(o.B1).toEqual(["switzerland", "slovenia", "scotland", "north-macedonia"]);
    expect(o.B2).toEqual(["northern-ireland", "hungary", "ukraine", "georgia"]);
    expect(o.B4).toEqual(["sweden", "bosnia-herzegovina", "poland", "romania"]);
  });

  it("Nations League: what each place leads to depends on the league", () => {
    const status = (group: string) => tablesOf("nations-league").find((g) => g.group === group)!.table.map((r) => r.status);
    expect(status("A1")).toEqual(["qf", "qf", null, "rel"]);
    expect(status("B1")).toEqual(["promo", "promo_po", null, "rel_po"]);
    expect(status("C1")).toEqual(["promo", "promo_po", null, null]);
    expect(status("D1")).toEqual([null, null, null]);
  });
});

describe("tie-break rules", () => {
  const g = (home: string, away: string, h: number, a: number) => ({ id: `${home}-${away}`, round: null, stage: "group" as const, date: "2026-09-25", time: null,
    home, away, status: "finished" as const, score: { ft: [h, a] as [number, number], ht: null }, source: "test" });

  it("CAF: away goals between the teams still level on head-to-head points, goal difference and goals", () => {
    // a 2-3 b, then b 0-1 a: three points each, head-to-head 3-3; b scored 3 away from home, a scored 1
    const table = computeTable([g("a", "b", 2, 3), g("b", "a", 0, 1)], { tiebreak: ["points", "h2h_points", "h2h_gd", "h2h_gf", "h2h_away_gf", "gd"] });
    expect(table.map((r) => r.team)).toEqual(["b", "a"]);
  });

  it("UEFA: away wins, after wins", () => {
    // a and b: one win each, same goals; a won away, b won at home
    const table = computeTable([g("c", "a", 0, 1), g("b", "d", 1, 0), g("a", "e", 0, 1), g("f", "b", 1, 0)],
      { tiebreak: ["points", "gd", "gf", "away_gf", "wins", "away_wins"] }).filter((r) => r.team === "a" || r.team === "b");
    expect(table.map((r) => r.team)).toEqual(["a", "b"]);
  });
});

describe("Israel is left out", () => {
  // Salah, 2026-11-14: "Omit Israel from competitions, if they're playing we automatically don't show their games."
  const site = () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-cups-")), wiki = mkdtempSync(join(tmpdir(), "golboard-cups-wiki-"));
    mkdirSync(join(wiki, "2026-27"));
    for (const t of all) copyFileSync(`${FIX}/${t.id}.json`, join(wiki, "2026-27", `${t.id}.json`));
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: `${TODAY}T03:00:00Z` });
    return { out, done: () => { rmSync(out, { recursive: true, force: true }); rmSync(wiki, { recursive: true, force: true }); } };
  };
  const read = (out: string, p: string) => JSON.parse(readFileSync(join(out, p), "utf8"));

  it("no Israeli team, row or game in the API, while every other team's record still counts its games against them", () => {
    const { out, done } = site();
    try {
      for (const [id, israeli] of [["nations-league", "israel"], ["europa-league", teamId("Hapoel Be'er Sheva F.C.")]]) {
        const text = [read(out, `api/v1/${id}/2026-27/matches.json`), read(out, `api/v1/${id}/2026-27/groups.json`), read(out, `api/v1/${id}/2026-27/teams.json`)].map((x) => JSON.stringify(x)).join();
        expect(text, id).not.toContain(israeli);
        expect(text, id).not.toMatch(/Israel|Hapoel|Maccabi/);
      }
      const b3 = read(out, "api/v1/nations-league/2026-27/groups.json").groups.find((x: { group: string }) => x.group === "B3");
      const full = games("nations-league");
      for (const r of b3.table) expect(r.played, r.team).toBe(full.filter((m) => m.score && (m.home === r.team || m.away === r.team)).length);
    } finally { done(); }
  });

  it("the pages never name them", async () => {
    const { pages } = await import("../scripts/api/pages.mjs");
    const { out, done } = site();
    try {
      pages({ api: join(out, "api/v1"), out });
      for (const id of ["nations-league", "europa-league", "conference-league", "champions-league"])
        expect(readFileSync(join(out, "leagues", id, "index.html"), "utf8"), id).not.toMatch(/Israel|Hapoel|Maccabi|Be&#39;er Sheva/);
    } finally { done(); }
  });
});

describe("the API and the pages", () => {
  const make = () => {
    const out = mkdtempSync(join(tmpdir(), "golboard-cups-")), wiki = mkdtempSync(join(tmpdir(), "golboard-cups-wiki-"));
    mkdirSync(join(wiki, "2026-27"));
    for (const t of all) copyFileSync(`${FIX}/${t.id}.json`, join(wiki, "2026-27", `${t.id}.json`));
    build({ input: "tests/fixtures/openfootball", wikipedia: wiki, out, seasons: ["2025-26"], now: `${TODAY}T03:00:00Z` });
    return { out, done: () => { rmSync(out, { recursive: true, force: true }); rmSync(wiki, { recursive: true, force: true }); } };
  };
  const read = (out: string, p: string) => JSON.parse(readFileSync(join(out, p), "utf8"));

  it("writes tournaments.json and each one's matches, groups and teams, and leaves the club leagues' list alone", () => {
    const { out, done } = make();
    try {
      expect(read(out, "api/v1/tournaments.json").tournaments.map((t: { id: string }) => t.id)).toEqual(["afcon", "champions-league", "europa-league", "conference-league", "nations-league"]);
      expect(read(out, "api/v1/tournaments.json").tournaments[0]).toEqual({ id: "afcon", name: "AFCON qualifying", full: "Africa Cup of Nations qualifying",
        region: "Africa", teams: "nations", season: "2026-27", finals: "Kenya, Tanzania and Uganda, from 19 June 2027" });
      expect(read(out, "api/v1/competitions.json").competitions.map((c: { id: string }) => c.id)).not.toContain("afcon");
      expect(read(out, "api/v1/afcon/2026-27/matches.json").matches).toHaveLength(144);
      const groups = read(out, "api/v1/afcon/2026-27/groups.json");
      expect(groups.groups).toHaveLength(12);
      expect(groups.zones).toEqual([{ kind: "qualify", label: "Top 2 in each group go to the finals", from: 1, to: 2, division: null }]);
      expect(read(out, "api/v1/afcon/2026-27/teams.json").teams.morocco).toBe("Morocco");
      expect(read(out, "api/v1/champions-league/2026-27/teams.json").teams[teamId("Manchester City F.C.")]).toBe("Manchester City");
      const meta = read(out, "api/v1/meta.json");
      expect(meta.tournaments.afcon["2026-27"]).toMatchObject({ scheduled: expect.any(Number), lastResult: expect.stringMatching(/^2026-11-1/) });
      expect(Object.keys(meta.files)).toContain("api/v1/nations-league/2026-27/groups.json");
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
      for (const t of all) {
        expect(check("tournamentMatches", read(out, `api/v1/${t.id}/2026-27/matches.json`)), t.id).toEqual([]);
        expect(check("groups", read(out, `api/v1/${t.id}/2026-27/groups.json`)), t.id).toEqual([]);
        expect(check("tournamentTeams", read(out, `api/v1/${t.id}/2026-27/teams.json`)), t.id).toEqual([]);
      }
      expect(check("meta", read(out, "api/v1/meta.json"))).toEqual([]);
      const today = read(out, "api/v1/today.json");
      expect(today.matches.some((m: { league: string }) => m.league === "nations-league")).toBe(true);  // built on 14 November
      expect(check("today", today)).toEqual([]);
    } finally { done(); }
  });

  it("api:check names a tournament whose results have stalled, as it does a league", async () => {
    const { check } = await import("../scripts/api/check-fresh.mjs");
    const meta = { leagues: {}, tournaments: { afcon: { "2026-27": { finished: 80, scheduled: 64, lastResult: "2026-11-13", overdue: 3 } } } };
    expect(check(meta)).toEqual(["afcon 2026-27: 3 results more than 3 days late (newest result 2026-11-13)"]);
    meta.tournaments.afcon["2026-27"].overdue = 0;
    expect(check(meta)).toEqual([]);
  });

  it("AFCON's page: twelve real tables, the places that go through marked, in order", async () => {
    const { pages } = await import("../scripts/api/pages.mjs");
    const { out, done } = make();
    try {
      pages({ api: join(out, "api/v1"), out });
      const html = readFileSync(join(out, "leagues/afcon/index.html"), "utf8");
      expect(html).toContain("<title>AFCON qualifying groups, results and fixtures | golboard</title>");
      expect((html.match(/<table class="standings">/g) ?? []).length).toBe(12);
      for (const g of "ABCDEFGHIJKL") expect(html).toContain(`<h3 id="group-${g.toLowerCase()}">Group ${g}</h3>`);
      const a = html.slice(html.indexOf('id="group-a"'), html.indexOf('id="group-b"'));
      expect([...a.matchAll(/<th scope="row" class="left">([^<]+)<\/th>/g)].map((m) => m[1])).toEqual(["Morocco", "Gabon", "Niger", "Lesotho"]);
      expect((html.match(/<tr class="row" data-zone="host"/g) ?? []).length).toBe(3);
      expect(html).toContain("Top 2 in each group go to the finals");
      expect(html).toMatch(/Kenya, Tanzania and Uganda are in the finals already as hosts/);
      expect(html).toMatch(/<span class="when">Group [A-L] · Tue 17 Nov<\/span>/);
      expect(html).toContain("Kick-offs are local time at each ground.");
      expect(html).toMatch(/<div class="titlebar solo"><span aria-hidden="true"><\/span><h1 style="--n: 10">AFCON qualifying<\/h1><span aria-hidden="true"><\/span><\/div>/);
      expect(html).toContain('<section class="glass wide" id="table">');
    } finally { done(); }
  });

  it("the Champions League page: one table of 36 with its zones, Central European kick-offs; the Nations League's 14 groups under their leagues", async () => {
    const { pages } = await import("../scripts/api/pages.mjs");
    const { out, done } = make();
    try {
      pages({ api: join(out, "api/v1"), out });
      const ucl = readFileSync(join(out, "leagues/champions-league/index.html"), "utf8");
      expect(ucl).toContain("<title>Champions League table, results and fixtures | golboard</title>");
      expect((ucl.match(/<table class="standings">/g) ?? []).length).toBe(1);
      expect((ucl.match(/<tr class="row"/g) ?? []).length).toBe(36);
      expect((ucl.match(/<tr class="row" data-zone="r16"/g) ?? []).length).toBe(8);
      expect(ucl).toContain("<b>Round of 16</b>");
      expect(ucl).toContain("Kick-offs are Central European time.");
      expect(ucl).toContain('<section class="glass" id="table">');  // one table sits beside the results, as a league's does; groups go full width
      const nl = readFileSync(join(out, "leagues/nations-league/index.html"), "utf8");
      expect((nl.match(/<table class="standings">/g) ?? []).length).toBe(14);
      expect(nl).toContain('<h3 id="group-a1">League A, Group 1</h3>');
      expect(nl).toContain("All of League D moves up to League C");
      const css = readFileSync(join(out, "leagues/site.css"), "utf8");
      for (const kind of ["qualify", "host", "r16", "playoff", "qf"]) expect(css, kind).toContain(`[data-zone="${kind}"]`);
      expect(css).toMatch(/\.titlebar\.solo h1 \{[^}]*100vw - 40px/);
      expect(css).toMatch(/\.groups \.standings \{ table-layout: fixed;/);
      expect(css).toMatch(/@media \(min-width: 861px\) \{ \.board > \.wide \{ grid-column: 1 \/ -1; order: 3; \} \.board:has\(> \.wide\) > footer \{ order: 4; \} \}/);
    } finally { done(); }
  });

  it("the leagues index: European cups and International sections; the club leagues' arrows still go round the leagues only", async () => {
    const { pages } = await import("../scripts/api/pages.mjs");
    const { out, done } = make();
    try {
      pages({ api: join(out, "api/v1"), out });
      const index = readFileSync(join(out, "leagues/index.html"), "utf8");
      expect(index.indexOf("<h2>European cups</h2>")).toBeLessThan(index.indexOf('href="/leagues/champions-league/"'));
      expect(index.indexOf("<h2>International</h2>")).toBeLessThan(index.indexOf('href="/leagues/afcon/"'));
      expect(index.indexOf('href="/leagues/afcon/"')).toBeGreaterThan(index.indexOf('href="/leagues/conference-league/"'));
      expect(index).toContain('href="/leagues/nations-league/"');
      expect(readFileSync(join(out, "leagues/en-2/index.html"), "utf8")).not.toContain('href="/leagues/afcon/"');
      expect(readFileSync(join(out, "sitemap.xml"), "utf8")).toContain("/leagues/champions-league/</loc>");
    } finally { done(); }
  });
});

describe("downloading a tournament's pages", () => {
  const reply = (title: string, revid: number, text: string) => ({ ok: true, status: 200,
    json: async () => ({ query: { pages: [{ title, revisions: [{ revid, timestamp: "2026-11-14T00:00:00Z", slots: { main: { content: text } } }] }] } }) });
  const b = box({ date: "{{Start date|2026|9|25|df=y}}", time: "", team1: "{{fb-rt|NIG}}", score: "2–1", team2: "{{fb|LES}}" });
  const two = { ...byId("afcon"), pages: byId("afcon").pages.slice(0, 2) };

  it("saves every page's headings and match boxes, with its revision, in one file", async () => {
    const { fetchTournament } = await import("../scripts/api/fetch-wikipedia.mjs");
    const out = mkdtempSync(join(tmpdir(), "golboard-cups-fetch-"));
    try {
      const report = await fetchTournament({ out, tournament: two, fetchFn: async (url: string) => {
        const a = decodeURIComponent(url).includes("Group A");
        return reply(a ? two.pages[0].title : two.pages[1].title, a ? 11 : 12, `Intro text\n${b}\n==Goalscorers==`) as never;
      } });
      expect(report).toEqual({ saved: ["2026-27/afcon"], kept: [] });
      const file = JSON.parse(readFileSync(join(out, "2026-27", "afcon.json"), "utf8"));
      expect(file.pages[two.pages[0].title]).toMatchObject({ revid: 11, wikitext: b });
      expect(file.pages[two.pages[1].title].revid).toBe(12);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });

  it("keeps the whole saved file when any page fails, so the tables never mix two days", async () => {
    const { fetchTournament } = await import("../scripts/api/fetch-wikipedia.mjs");
    const out = mkdtempSync(join(tmpdir(), "golboard-cups-fetch-"));
    try {
      mkdirSync(join(out, "2026-27"));
      writeFileSync(join(out, "2026-27", "afcon.json"), JSON.stringify({ kept: true }));
      const report = await fetchTournament({ out, tournament: two, fetchFn: async (url: string) =>
        (decodeURIComponent(url).includes("Group B") ? { ok: false, status: 503 } : reply("A", 1, b)) as never });
      expect(report.kept).toEqual([`2026-27/afcon (${two.pages[1].title}: HTTP 503)`]);
      expect(JSON.parse(readFileSync(join(out, "2026-27", "afcon.json"), "utf8"))).toEqual({ kept: true });
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});
