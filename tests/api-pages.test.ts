// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { pages } from "../scripts/api/pages.mjs";

// One plain HTML page per league, made from the published API at the same time (no JavaScript: in our test on a throttled phone it
// showed in 376 ms against 912 ms for the Vue app). Each page says how far its results go and credits every source it used.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-pages-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const site = () => {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  return out;
};
const page = (out: string, path: string) => readFileSync(join(out, path), "utf8");

describe("league pages", () => {
  it("makes one page per league and an index that links them all", () => {
    const out = site();
    expect(readdirSync(join(out, "leagues")).filter((f) => !f.includes(".") && f !== "fonts").sort())
      .toEqual(["de-1", "en-1", "en-2", "es-1", "fr-1", "it-1", "nl-1", "pt-1"]);
    const index = page(out, "leagues/index.html");
    for (const id of ["it-1", "en-1", "pt-1"]) expect(index).toContain(`href="/leagues/${id}/"`);
    expect(index).toContain("<title>Leagues | golboard</title>");
  });

  it("shows the table in order with real table markup, and says how far the results go", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain("<title>Serie A table, results and fixtures | golboard</title>");
    expect(html).toMatch(/<meta property="og:title" content="Serie A[^"]*"/);
    expect(html).toContain('<table class="standings">');
    expect(html).toMatch(/<th scope="row" class="left"><button class="star"[^>]*>☆<\/button><a href="\/leagues\/it-1\/[a-z0-9-]+\/">Internazionale Milano<\/a><\/th>/);  // a star to follow it, then the link
    expect(html.indexOf(">Internazionale Milano<")).toBeLessThan(html.indexOf(">Napoli<"));
    expect(html).toContain("Results up to 24 May 2026");
    expect((html.match(/<tr class="row">/g) ?? []).length).toBe(20);
  });

  it("lists recent results and says each league's own time zone for kick-offs", () => {
    const html = page(site(), "leagues/en-1/index.html");
    expect(html).toContain("Latest results");
    expect(html).toMatch(/UK time/);
  });

  it("never shows a game from the build day or before as a fixture still to come: it waits for its result", () => {
    // 2025-26 with its last matchday unscored, built the day after: those games were played, the result is just not in yet
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay = season.matches.at(-1).date;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-05-25T09:00:00Z" });
    pages({ api: join(out, "api/v1"), out });
    const html = page(out, "leagues/it-1/index.html");
    expect(html).toContain("<h2>This week</h2>");
    expect(html.indexOf("<h2>This week</h2>")).toBeLessThan(html.indexOf('<table class="standings">'));  // first thing after the title
    expect(html).not.toContain("Next fixtures</h2>\n<ul");
    expect((html.match(/·[^<]*\d{2}:\d{2} Italy time/g) ?? []).length).toBe(0);  // a kick-off time is shown once, in the middle
  });

  it("has arrows to the previous and next league, going round", () => {
    const out = site();
    const it1 = page(out, "leagues/it-1/index.html"), en2 = page(out, "leagues/en-2/index.html");
    expect(it1).toMatch(/<a class="arrow prev" href="\/leagues\/en-2\/" aria-label="Previous league: Championship">/);
    expect(it1).toMatch(/<a class="arrow next" href="\/leagues\/en-1\/" aria-label="Next league: Premier League">/);
    expect(en2).toMatch(/<a class="arrow next" href="\/leagues\/it-1\/"/);
  });

  it("has arrows to step through the games on the poster", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain('<button class="arrow prev" type="button" data-step="-1" aria-label="Previous game" hidden>');
    expect(html).toContain('<button class="arrow next" type="button" data-step="1" aria-label="Next game" hidden>');
    expect(html).toContain('<script src="/leagues/live.js" defer></script>');  // the arrows need it, so every league page loads it
  });

  it("starts the poster on today's game, and puts an old game still without a result at the end of this week", () => {
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay = season.matches.at(-1).date;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    const old = season.matches.find((m: { date: string }) => m.date < "2026-05-10");
    delete old.score;  // a game from weeks ago that never got a result (postponed)
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: `${lastDay}T09:00:00Z` });
    pages({ api: join(out, "api/v1"), out });
    const html = page(out, "leagues/it-1/index.html");
    expect(html).toMatch(new RegExp(`<div class="feature" data-date="${lastDay}"`));
    const week = html.slice(html.indexOf('id="week"'), html.indexOf('id="table"'));
    expect(week.lastIndexOf(`data-date="${old.date}"`)).toBeGreaterThan(week.lastIndexOf(`data-date="${lastDay}"`));
    expect(week).toContain("result not in");
  });

  it("says vs, not a dash, between two teams when a game has no kick-off time", () => {
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const last = season.matches.at(-1);
    delete last.score; delete last.time;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: `${last.date}T09:00:00Z` });
    pages({ api: join(out, "api/v1"), out });
    const html = page(out, "leagues/it-1/index.html");
    expect(html).toContain('<span class="mid">vs</span>');
    expect(html).not.toContain('<span class="mid">–</span>');
  });

  it("sizes the poster's team names to their longest word, so a long one never runs under the score", () => {
    const html = page(site(), "leagues/de-1/index.html");
    const feature = html.match(/<div class="feature"[^>]*>/)![0];
    const names = [...html.slice(html.indexOf(feature)).matchAll(/<span class="(?:home|away)">([^<]*)<\/span>/g)].slice(0, 2).map((m) => m[1]);
    const longest = Math.max(...names.join(" ").split(/\s+/).map((w) => w.length));
    expect(feature).toContain(`style="--w: ${longest}"`);
  });

  it("credits the sources the page used, and no others", () => {
    const html = page(site(), "leagues/it-1/index.html");
    expect(html).toContain('href="https://github.com/openfootball/football.json"');
    expect(html).not.toContain("wikipedia.org");
  });

  it("has two small scripts, escapes names, and keeps each page small", () => {
    const out = site();
    for (const id of ["it-1", "en-2"]) {
      const html = page(out, `leagues/${id}/index.html`);
      expect(html.match(/<script[^>]*>/gi)).toEqual(['<script src="/leagues/live.js" defer>', '<script src="/leagues/follow.js" defer>']);  // arrows and live scores; following clubs
      expect(html.length).toBeLessThan(40_000);
    }
    expect(page(out, "leagues/en-1/index.html")).toContain("Brighton &amp; Hove Albion");
    expect(existsSync(join(out, "leagues/site.css"))).toBe(true);
  });
});

// What each table position leads to (data/api/zones.json). A season's table fills the next season's places, so 2026-27 holds the 2027-28
// European places. The fixtures are 2025-26, so the page tests pass their own zones in.
describe("table zones", () => {
  const data = JSON.parse(readFileSync("data/api/zones.json", "utf8"));
  const served = JSON.parse(readFileSync("data/api/leagues.json", "utf8")).leagues as { id: string; teams: number }[];

  it("gives every league the current season's zones: inside the table, in order, never overlapping, each with a note", () => {
    for (const league of served) {
      const entry = data.seasons["2026-27"][league.id];
      expect(entry, league.id).toBeTruthy();
      expect(entry.note.length, league.id).toBeGreaterThan(10);
      let last = 0;
      for (const z of entry.zones) {
        expect(data.kinds[z.kind], `${league.id} ${z.kind}`).toBeTruthy();
        expect(z.from, league.id).toBeGreaterThan(last);
        expect(z.to, league.id).toBeGreaterThanOrEqual(z.from);
        expect(z.to, league.id).toBeLessThanOrEqual(league.teams);
        last = z.to;
      }
    }
  });

  it("has the 2027-28 places of UEFA's 2026 country ranking (4 Champions League places to the top four, 3 and a qualifier to France)", () => {
    const cl = (id: string) => data.seasons["2026-27"][id].zones.find((z: { kind: string }) => z.kind === "cl");
    for (const id of ["en-1", "it-1", "es-1", "de-1"]) expect(cl(id).to, id).toBe(4);
    expect(cl("fr-1").to).toBe(3);
    expect(cl("pt-1").to).toBe(2);
    expect(cl("nl-1").to).toBe(1);
  });

  const zoned = () => {
    const out = tmp();
    build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
    const zones = (season: string, id: string) => (season === "2025-26" && id === "it-1"
      ? { zones: [{ kind: "cl", from: 1, to: 4 }, { kind: "el", from: 5, to: 5 }, { kind: "rel", from: 18, to: 20 }], note: "Cup winners can move these places." }
      : null);
    pages({ api: join(out, "api/v1"), out, zones });
    return out;
  };

  it("marks each row in a zone, with the zone's name for screen readers, and leaves the rest alone", () => {
    const html = page(zoned(), "leagues/it-1/index.html");
    expect((html.match(/<tr class="row" data-zone="cl">/g) ?? []).length).toBe(4);
    expect((html.match(/<tr class="row" data-zone="el">/g) ?? []).length).toBe(1);
    expect((html.match(/<tr class="row" data-zone="rel">/g) ?? []).length).toBe(3);
    expect((html.match(/<tr class="row">/g) ?? []).length).toBe(12);
    expect(html).toContain('<td class="pos">1<span class="sr-only">, Champions League</span></td>');
  });

  it("shows a legend with each zone's positions and the league's note under the table", () => {
    const html = page(zoned(), "leagues/it-1/index.html");
    const legend = html.slice(html.indexOf('<ul class="zones"'), html.indexOf("</ul>", html.indexOf('<ul class="zones"')));
    expect(legend).toContain('data-zone="cl"');
    expect(legend).toContain("Champions League</b> 1st–4th");
    expect(legend).toContain("Europa League</b> 5th");
    expect(legend).toContain("Relegation</b> 18th–20th");
    expect(html).toContain("Cup winners can move these places.");
    expect(html.indexOf('<ul class="zones"')).toBeGreaterThan(html.indexOf("</table>"));
  });

  it("shows no legend and no marks for a season without zones", () => {
    const html = page(zoned(), "leagues/en-1/index.html");
    expect(html).not.toContain('<ul class="zones"');
    expect(html).not.toContain("data-zone=");
  });
});

// One page per club (/leagues/<league>/<club>/): where it stands, its form, the next game, every result and fixture.
describe("club pages", () => {
  const api = (out: string, f: string) => JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26", f), "utf8"));

  it("makes a page for every club in the table, and the table links to it", () => {
    const out = site();
    const { table } = api(out, "table.json");
    for (const row of table) expect(existsSync(join(out, "leagues/it-1", row.team, "index.html")), row.team).toBe(true);
    const league = page(out, "leagues/it-1/index.html");
    expect(league).toContain(`<a href="/leagues/it-1/${table[0].team}/">`);
    expect((league.match(/<th scope="row" class="left"><button class="star"[^>]*>☆<\/button><a href="\/leagues\/it-1\//g) ?? []).length).toBe(table.length);
  });

  it("says where the club stands, from the table, and names it in the title", () => {
    const out = site();
    const { table } = api(out, "table.json");
    const { teams } = api(out, "teams.json");
    const second = table[1];
    const html = page(out, `leagues/it-1/${second.team}/index.html`);
    expect(html).toContain(`<title>${teams[second.team]}: Serie A results, fixtures and table place | golboard</title>`);
    expect(html).toContain(`<h1`);
    expect(html).toContain('2nd in <a href="/leagues/it-1/">Serie A</a>');
    expect(html).toContain(`${second.points} points`);
    expect(html).toContain(`Won ${second.won}, drawn ${second.drawn}, lost ${second.lost}`);
    expect(html).toContain('href="/leagues/it-1/"');
  });

  it("shows the last five league results as form, newest first, in words as well as letters", () => {
    const out = site();
    const { table } = api(out, "table.json");
    const { matches } = api(out, "matches.json");
    const team = table[0].team;
    const played = matches.filter((m: any) => m.stage === "league" && m.score && (m.home === team || m.away === team))
      .sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 5);
    const letter = (m: any) => { const [h, a] = m.score.ft; const us = m.home === team ? h : a, them = m.home === team ? a : h;
      return us > them ? "W" : us < them ? "L" : "D"; };
    const html = page(out, `leagues/it-1/${team}/index.html`);
    const form = html.slice(html.indexOf('<ol class="form"'), html.indexOf("</ol>", html.indexOf('<ol class="form"')));
    expect((form.match(/<li class="f-[wdl]"/g) ?? []).length).toBe(5);
    expect([...form.matchAll(/<li class="f-([wdl])"/g)].map((x) => x[1].toUpperCase())).toEqual(played.map(letter));
    expect(form).toMatch(/<span class="sr-only">(Won|Drew|Lost) \d+–\d+ (at|v) /);
  });

  it("puts the next game first when there is one, and none when the season is over", () => {
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay = season.matches.at(-1).date;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: `${lastDay}T08:00:00Z` });
    pages({ api: join(out, "api/v1"), out });
    const { matches } = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/matches.json"), "utf8"));
    const next = matches.find((m: any) => !m.score);
    const html = page(out, `leagues/it-1/${next.home}/index.html`);
    expect(html).toContain("<h2>Next game</h2>");
    expect(html.indexOf("<h2>Next game</h2>")).toBeLessThan(html.indexOf("<h2>Form</h2>"));
    expect(page(site(), `leagues/it-1/${next.home}/index.html`)).not.toContain("<h2>Next game</h2>");
  });
});

// Search and answer engines: absolute canonical links, a sitemap of every page, and schema.org data for the games and clubs.
describe("search engines", () => {
  const SITE = "https://football-scores-salah.netlify.app";
  const lastDayUnscored = () => {
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay = season.matches.at(-1).date;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: `${lastDay}T08:00:00Z` });
    pages({ api: join(out, "api/v1"), out });
    return out;
  };
  const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

  it("gives every page an absolute canonical link and og:url", () => {
    const out = site();
    for (const path of ["leagues/index.html", "leagues/it-1/index.html", "leagues/it-1/napoli/index.html"]) {
      const url = `${SITE}/${path.replace(/index\.html$/, "")}`;
      const html = page(out, path);
      expect(html, path).toContain(`<link rel="canonical" href="${url}">`);
      expect(html, path).toContain(`<meta property="og:url" content="${url}">`);
    }
  });

  it("writes a sitemap with the app, the league index, every league and every club, and a robots.txt that points to it", () => {
    const out = site();
    const xml = page(out, "sitemap.xml");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const u of [`${SITE}/`, `${SITE}/standings`, `${SITE}/results`, `${SITE}/leagues/`, `${SITE}/leagues/it-1/`, `${SITE}/leagues/en-2/`, `${SITE}/leagues/it-1/napoli/`]) expect(locs).toContain(u);
    const clubs = readdirSync(join(out, "leagues/it-1")).filter((f) => !f.includes("."));
    for (const c of clubs) expect(locs).toContain(`${SITE}/leagues/it-1/${c}/`);
    expect(new Set(locs).size).toBe(locs.length);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    expect(page(out, "robots.txt")).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  });

  it("describes each game still to play as a schema.org SportsEvent with its kick-off in the league's own time zone", () => {
    const out = lastDayUnscored();
    const html = page(out, "leagues/it-1/index.html");
    const { matches } = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/matches.json"), "utf8"));
    const { teams } = JSON.parse(readFileSync(join(out, "api/v1/it-1/2025-26/teams.json"), "utf8"));
    const open = matches.filter((m: any) => !m.score);
    const events = ld(html).flatMap((d) => d["@graph"] ?? [d]).filter((d) => d["@type"] === "SportsEvent");
    expect(events.length).toBe(open.length);
    const first = open[0];
    const e = events.find((x) => x.homeTeam.name === teams[first.home] && x.awayTeam.name === teams[first.away]);
    expect(e).toBeTruthy();
    expect(e.name).toBe(`${teams[first.home]} v ${teams[first.away]}`);
    // late May in Italy is summer time, two hours ahead of UTC
    expect(e.startDate).toBe(first.time ? `${first.date}T${first.time}:00+02:00` : first.date);
    expect(e.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(e.homeTeam["@type"]).toBe("SportsTeam");
    expect(e.superEvent.name).toBe("Serie A 2025-26");
  });

  it("describes each club page as a schema.org SportsTeam in its league", () => {
    const html = page(site(), "leagues/it-1/napoli/index.html");
    const team = ld(html).find((d) => d["@type"] === "SportsTeam");
    expect(team.name).toBe("Napoli");
    expect(team.url).toBe(`${SITE}/leagues/it-1/napoli/`);
    expect(team.memberOf).toEqual({ "@type": "SportsOrganization", name: "Serie A" });
  });

  it("keeps the structured data safe: no raw < inside it, so a name can never close the script", () => {
    const out = lastDayUnscored();
    const html = page(out, "leagues/it-1/index.html");
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) expect(m[1]).not.toContain("<");
  });
});

// A source can stall (openfootball's last result was 20 September 2026 for six weeks). The API counts the games more than three days
// past with no result, each league page says so in words, and `npm run api:check` fails, so a stall is seen, not silent.
describe("stale results", () => {
  const stalled = (daysAfter: number) => {
    const input = tmp(), out = tmp();
    const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
    const lastDay: string = season.matches.at(-1).date;
    const unscored = season.matches.filter((m: any) => m.date === lastDay).length;
    for (const m of season.matches) if (m.date === lastDay) delete m.score;
    mkdirSync(join(input, "2025-26"), { recursive: true });
    writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
    const now = new Date(Date.parse(`${lastDay}T12:00:00Z`) + daysAfter * 86_400_000).toISOString();
    build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now });
    pages({ api: join(out, "api/v1"), out });
    return { out, unscored, meta: JSON.parse(readFileSync(join(out, "api/v1/meta.json"), "utf8")) };
  };

  it("counts games more than three days past with no result, and none sooner", () => {
    expect(stalled(4).meta.leagues["it-1"]["2025-26"].overdue).toBe(stalled(4).unscored);
    expect(stalled(3).meta.leagues["it-1"]["2025-26"].overdue).toBe(0);
    expect(stalled(1).meta.leagues["it-1"]["2025-26"].overdue).toBe(0);
  });

  it("says on the league page how many results are late", () => {
    const { out, unscored } = stalled(5);
    expect(page(out, "leagues/it-1/index.html")).toContain(`${unscored} results from more than three days ago are not in yet.`);
    expect(page(stalled(1).out, "leagues/it-1/index.html")).not.toContain("are not in yet.");
  });

  it("api:check lists each league with late results, and passes when there are none", async () => {
    const { check } = await import("../scripts/api/check-fresh.mjs");
    const late = stalled(5).meta;
    expect(check(late)).toEqual([`it-1 2025-26: ${stalled(5).unscored} results more than 3 days late (newest result ${late.leagues["it-1"]["2025-26"].lastResult})`]);
    expect(check(stalled(1).meta)).toEqual([]);
  });
});

describe("postponed games", () => {
  it("lists only real match ids, each with why and a source", () => {
    const data = JSON.parse(readFileSync("data/api/postponed.json", "utf8"));
    for (const [season, leagues] of Object.entries<any>(data)) {
      if (season.startsWith("_")) continue;
      for (const [league, list] of Object.entries<any>(leagues)) for (const p of list) {
        expect(p.match.startsWith(`${league}:`), p.match).toBe(true);
        expect(p.why.length, p.match).toBeGreaterThan(10);
        expect(p.source, p.match).toMatch(/^https:\/\//);
      }
    }
  });
});
