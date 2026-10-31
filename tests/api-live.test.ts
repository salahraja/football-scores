// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { liveScript, pages } from "../scripts/api/pages.mjs";
import { teamId } from "../scripts/api/teams.mjs";

// Live scores on the league pages: a small script asks SportScore's free API (CORS open, cached 60 s; its terms ask for a visible
// "Powered by SportScore" link) once a minute for today's games of that league and writes the score into the matching row. Measured on
// 31 October 2026: goals showed there a median 0.2 min after ESPN. The page is complete without it.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-live-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); vi.useRealTimers(); });

function siteWithGamesToPlay() {
  // 2025-26 with the last matchday unscored, built that morning: those games are today's
  const input = tmp(), out = tmp();
  const season = JSON.parse(readFileSync("tests/fixtures/openfootball/2025-26/it.1.json", "utf8"));
  const lastDay = season.matches.at(-1).date;
  for (const m of season.matches) if (m.date === lastDay) delete m.score;
  mkdirSync(join(input, "2025-26"), { recursive: true });
  writeFileSync(join(input, "2025-26", "it.1.json"), JSON.stringify(season));
  writeFileSync(join(input, "2025-26", "pt.1.json"), readFileSync("tests/fixtures/openfootball/2025-26/pt.1.json"));
  build({ input, wikipedia: tmp(), out, seasons: ["2025-26"], now: `${lastDay}T09:00:00Z` });
  pages({ api: join(out, "api/v1"), out });
  return { out, lastDay };
}

describe("the live script names clubs the way the API does", () => {
  it("for every club in the fixtures and for SportScore's own spellings", () => {
    const win = { document: { querySelectorAll: () => [] } } as never;
    const live = new Function("window", "document", `${liveScript()}; return window.golboardLive;`)(win, (win as { document: unknown }).document);
    const names = new Set<string>();
    for (const code of ["it.1", "en.1", "es.1", "de.1", "fr.1", "nl.1", "pt.1", "en.2"]) {
      for (const m of JSON.parse(readFileSync(`tests/fixtures/openfootball/2025-26/${code}.json`, "utf8")).matches) names.add(m.team1);
    }
    for (const n of ["Inter Milan", "AC Milan", "AS Roma", "Borussia Monchengladbach", "Real Betis", "Paris Saint-Germain", "Brighton & Hove Albion"]) names.add(n);
    for (const n of names) expect(live.teamId(n), n).toBe(teamId(n));
  });
});

describe("pages with games to play", () => {
  it("load the script, mark today's rows, and credit SportScore; a league SportScore does not cover gets neither", () => {
    const { out, lastDay } = siteWithGamesToPlay();
    const html = readFileSync(join(out, "leagues/it-1/index.html"), "utf8");
    expect(html).toContain('<script src="/leagues/live.js" defer></script>');
    expect(html).toContain('data-sportscore="italian-serie-a"');
    expect(html).toMatch(new RegExp(`<li data-date="${lastDay}" data-home="[a-z-]+" data-away="[a-z-]+">`));
    expect(html).toContain('Live scores <a href="https://sportscore.com/">powered by SportScore</a>');
    const pt = readFileSync(join(out, "leagues/pt-1/index.html"), "utf8");
    expect(pt).not.toContain("<script");
    expect(pt).not.toContain("SportScore");
  });
});

describe("in the browser", () => {
  const row = (home: string, away: string, date: string) =>
    `<li data-date="${date}" data-home="${home}" data-away="${away}"><span class="home">H</span><span class="mid">20:45</span><span class="away">A</span><span class="when">Matchday 38</span></li>`;
  const reply = (matches: unknown[]) => ({ ok: true, json: async () => ({ matches }) });

  it("writes live and final scores into the rows, says the state, and stops once every game has finished", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T19:30:00Z"));
    document.body.dataset.sportscore = "italian-serie-a";
    document.body.innerHTML = `<ul class="games" aria-live="polite">${row("milan", "inter", "2026-05-24")}${row("roma", "napoli", "2026-05-24")}${row("lazio", "torino", "2026-05-31")}</ul>`;
    const asked: string[] = [];
    let call = 0;
    const fetchFn = vi.fn(async (url: string) => {
      asked.push(url);
      call += 1;
      return reply(call === 1
        ? [{ home: "AC Milan", away: "Inter Milan", home_score: "1", away_score: "0", status: "live", status_text: "2nd half" },
          { home: "AS Roma", away: "SSC Napoli", home_score: "2", away_score: "2", status: "finished", status_text: "Finished" }]
        : [{ home: "AC Milan", away: "Inter Milan", home_score: "1", away_score: "1", status: "finished", status_text: "Finished" },
          { home: "AS Roma", away: "SSC Napoli", home_score: "2", away_score: "2", status: "finished", status_text: "Finished" }]);
    });
    (window as unknown as { fetch: unknown }).fetch = fetchFn;
    new Function(liveScript())();
    await vi.advanceTimersByTimeAsync(10);
    const rows = [...document.querySelectorAll("li")];
    expect(rows[0].querySelector(".mid")!.textContent).toBe("1–0");
    expect(rows[0].querySelector(".state")!.textContent).toBe("Live · 2nd half");
    expect(rows[1].querySelector(".mid")!.textContent).toBe("2–2");
    expect(rows[1].querySelector(".state")!.textContent).toBe("Full time");
    expect(rows[2].querySelector(".mid")!.textContent).toBe("20:45");  // another day: untouched
    expect(asked[0]).toBe("https://sportscore.com/api/v1/fixtures/?sport=football&date=2026-05-24&competition=italian-serie-a");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(rows[0].querySelector(".mid")!.textContent).toBe("1–1");
    expect(rows[0].querySelector(".state")!.textContent).toBe("Full time");
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);  // every game finished: no more calls
  });

  it("does nothing on a day with no games on the page", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T19:30:00Z"));
    document.body.dataset.sportscore = "italian-serie-a";
    document.body.innerHTML = `<ul class="games">${row("milan", "inter", "2026-05-24")}</ul>`;
    const fetchFn = vi.fn();
    (window as unknown as { fetch: unknown }).fetch = fetchFn;
    new Function(liveScript())();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
