// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { buildNews } from "../scripts/api/news.mjs";
import { pages } from "../scripts/api/pages.mjs";
import { inlineScripts } from "../scripts/csp.mjs";

// Salah, 2026-11-14, his first pick for golboard: "spoiler-free mode (scores hidden until tapped, per team)". You mark a club "Hide scores"
// (kept on the device, like Following). Wherever that club has a score, a live state or its goals, the page shows a Show button instead,
// and a tap shows that one game for the rest of the visit. Headlines that name the club are covered the same way. The league table is
// not hidden: it cannot be without hiding everyone's.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-hide-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function site() {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  buildNews({ api: join(out, "api/v1"), raw: tmp(), now: "2026-11-13T10:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  return out;
}
const OUT = site();
const read = (path: string) => readFileSync(join(OUT, path), "utf8");

describe("the pages", () => {
  it("every game on a page says which two teams and which day it is: a scored one in data-game, an unscored one as before", () => {
    const doc = new DOMParser().parseFromString(read("leagues/it-1/index.html"), "text/html");
    const games = [...doc.querySelectorAll(".games > li, .feature")];
    expect(games.length).toBeGreaterThan(10);
    for (const el of games) {
      const scored = /\d–\d/.test(el.querySelector(".mid")!.textContent!);
      if (scored) expect(el.getAttribute("data-game")).toMatch(/^[a-z0-9-]+ [a-z0-9-]+ \d{4}-\d{2}-\d{2}$/);
      else expect([el.getAttribute("data-home"), el.getAttribute("data-away"), el.getAttribute("data-date")].every(Boolean)).toBe(true);
      expect(scored && el.hasAttribute("data-home")).toBe(false);  // data-home still means "no score yet", which the live script reads
    }
    expect(games.some((el) => el.hasAttribute("data-game"))).toBe(true);
  });

  it("a club page has a Hide scores button beside Follow", () => {
    const html = read("leagues/it-1/juventus/index.html");
    expect(html).toMatch(/<button class="hide" type="button" data-hide="juventus" data-name="Juventus" aria-pressed="false">Hide scores<\/button>/);
  });

  it("the Following page has a place for the hide switches of the clubs you follow", () => {
    const html = read("following/index.html");
    expect(html).toContain('<ul class="clubs" id="hide-clubs"></ul>');
    expect(html).toContain("Hide scores");
  });

  it("rides in follow.js, so no page loads a third script or runs an inline one", () => {
    for (const page of ["leagues/it-1/index.html", "leagues/it-1/juventus/index.html", "following/index.html", "news/index.html", "leagues/index.html"]) {
      const html = read(page);
      expect(html, page).toContain('<script src="/leagues/follow.js" defer></script>');
      expect(html, page).not.toContain("hide.js");
      expect(inlineScripts(html), page).toEqual([]);
    }
    expect(read("leagues/follow.js")).toContain("golboard.hideScores");
  });
});

// ---- the script, run against a page made like the real ones
const SCRIPT = read("leagues/follow.js");
const run = () => { (0, eval)(SCRIPT); };
const settle = () => new Promise((r) => setTimeout(r, 0));
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const row = (home: string, away: string, mid: string, extra = "") =>
  `<li data-game="${home} ${away} 2026-11-12"><span class="home">${home}</span><span class="mid">${mid}</span><span class="away">${away}</span>${extra}<span class="when">12 · Thu 12 Nov</span></li>`;
const PAGE = `
<div class="feature" data-game="juventus milan 2026-11-12"><span class="home">Juventus</span><span class="mid">2–1</span><span class="away">Milan</span><span class="state">Full time</span><span class="when">12</span></div>
<ul class="games" id="played">${row("juventus", "milan", "2–1", '<span class="state">Full time</span><ul class="events"><li>12\' Goal</li></ul>')}${row("roma", "lazio", "0–0")}</ul>
<ul class="games" id="next"><li data-date="2026-11-15" data-home="inter" data-away="juventus"><span class="home">Inter</span><span class="mid">20:45</span><span class="away">Juventus</span><span class="when">13 · Sun 15 Nov</span></li></ul>
<button class="hide" type="button" data-hide="juventus" data-name="Juventus" aria-pressed="false">Hide scores</button>
<ul class="news"><li data-clubs="juventus milan"><a class="story" href="https://a.test/1"><span class="t">Juventus 2-1 Milan</span></a></li><li data-clubs="roma"><a class="story" href="https://a.test/2"><span class="t">Roma draw</span></a></li></ul>`;
const masked = (sel: string) => [...document.querySelectorAll(sel)].map((el) => el.classList.contains("masked"));

const local = new Map<string, string>(), session = new Map<string, string>();
const store = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), clear: () => m.clear() });
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: store(local), configurable: true });
  Object.defineProperty(window, "sessionStorage", { value: store(session), configurable: true });
  local.clear();
  session.clear();
  document.body.innerHTML = "";
});

// the script watches the page for changes; it is stopped after each test, as leaving the page stops it in a browser
afterEach(() => { (window as unknown as { __golboardHide?: { stop(): void } }).__golboardHide?.stop(); });

describe("hide.js", () => {
  it("does nothing until a club is marked", () => {
    document.body.innerHTML = PAGE;
    run();
    expect(document.querySelectorAll(".masked, .reveal").length).toBe(0);
    expect(document.querySelector(".hide")!.textContent).toBe("Hide scores");
  });

  it("covers a marked club's score, state and goals with a Show button, in the list and on the poster, and leaves other games alone", () => {
    local.set("golboard.hideScores", '["juventus"]');
    document.body.innerHTML = PAGE;
    run();
    expect(masked("#played > li")).toEqual([true, false]);
    expect(masked(".feature")).toEqual([true]);
    const first = document.querySelector("#played > li")!;
    expect(first.querySelector(".reveal")!.textContent).toBe("Show");
    expect(first.querySelector(".reveal")!.getAttribute("aria-label")).toBe("Show the score of juventus against milan");
    expect(first.querySelector(".mid")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".hide")!.textContent).toBe("Scores hidden");
    expect(document.querySelector(".hide")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not cover a game that has no score yet", () => {
    local.set("golboard.hideScores", '["juventus"]');
    document.body.innerHTML = PAGE;
    run();
    expect(masked("#next > li")).toEqual([false]);
  });

  it("a tap shows that one game everywhere on the page, and it stays shown for the visit", () => {
    local.set("golboard.hideScores", '["juventus"]');
    document.body.innerHTML = PAGE;
    run();
    click(document.querySelector("#played .reveal")!);
    expect(masked("#played > li")).toEqual([false, false]);
    expect(masked(".feature")).toEqual([false]);
    expect(document.querySelectorAll(".reveal").length).toBe(1);  // only the headline is still covered
    expect(document.querySelector("#played .mid")!.hasAttribute("aria-hidden")).toBe(false);
    expect(JSON.parse(session.get("golboard.shown")!)).toEqual(["juventus milan 2026-11-12"]);
    document.body.innerHTML = PAGE;  // the next page of the same visit
    run();
    expect(masked("#played > li")).toEqual([false, false]);
  });

  it("covers a score that arrives later, as a live game's does", async () => {
    local.set("golboard.hideScores", '["juventus"]');
    document.body.innerHTML = PAGE;
    run();
    const live = document.querySelector("#next > li") as HTMLElement;
    live.querySelector(".mid")!.textContent = "0–1";
    live.dataset.state = "live";
    await settle();
    expect(masked("#next > li")).toEqual([true]);
  });

  it("covers the poster again when it moves to another marked game", async () => {
    local.set("golboard.hideScores", '["juventus"]');
    document.body.innerHTML = PAGE;
    run();
    click(document.querySelector(".feature .reveal")!);
    const poster = document.querySelector(".feature") as HTMLElement;
    poster.setAttribute("data-game", "juventus napoli 2026-11-08");  // what the arrows do: the poster takes another game's marks and score
    poster.querySelector(".mid")!.textContent = "3–0";
    await settle();
    expect(masked(".feature")).toEqual([true]);
  });

  it("reads a live game by its own marks, even on a poster that still carries the last game's", async () => {
    local.set("golboard.hideScores", '["roma"]');
    document.body.innerHTML = PAGE;
    run();
    expect(masked(".feature")).toEqual([false]);  // Juventus v Milan: neither is marked
    const poster = document.querySelector(".feature") as HTMLElement;
    Object.assign(poster.dataset, { home: "roma", away: "lazio", date: "2026-11-15", state: "live" });
    poster.querySelector(".mid")!.textContent = "1–0";
    await settle();
    expect(masked(".feature")).toEqual([true]);
    expect(poster.querySelector(".reveal")!.getAttribute("data-key")).toBe("roma lazio 2026-11-15");
  });

  it("the button on a club page marks and unmarks the club, and the page follows at once", () => {
    document.body.innerHTML = PAGE;
    run();
    click(document.querySelector(".hide")!);
    expect(JSON.parse(local.get("golboard.hideScores")!)).toEqual(["juventus"]);
    expect(masked("#played > li")).toEqual([true, false]);
    click(document.querySelector(".hide")!);
    expect(JSON.parse(local.get("golboard.hideScores")!)).toEqual([]);
    expect(document.querySelectorAll(".masked, .reveal").length).toBe(0);
  });

  it("covers a headline that names a marked club, with its own Show button", () => {
    local.set("golboard.hideScores", '["juventus"]');
    document.body.innerHTML = PAGE;
    run();
    expect(masked(".news > li")).toEqual([true, false]);
    const cover = document.querySelector(".news .reveal")!;
    expect(cover.textContent).toBe("A headline about a club whose scores you hide. Show");
    click(cover);
    expect(masked(".news > li")).toEqual([false, false]);
  });

  it("lists the clubs you follow on the Following page, each with its own switch", () => {
    local.set("golboard.following", '["juventus", "roma"]');
    local.set("golboard.hideScores", '["roma"]');
    document.body.innerHTML = '<input type="checkbox" data-club="juventus" data-name="Juventus"><input type="checkbox" data-club="roma" data-name="Roma"><ul class="clubs" id="hide-clubs"></ul>';
    run();
    const boxes = [...document.querySelectorAll<HTMLInputElement>("#hide-clubs input")];
    expect(boxes.map((b) => [b.getAttribute("data-hide"), b.checked, b.parentElement!.textContent!.trim()])).toEqual([["juventus", false, "Juventus"], ["roma", true, "Roma"]]);
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event("change", { bubbles: true }));
    expect(JSON.parse(local.get("golboard.hideScores")!).sort()).toEqual(["juventus", "roma"]);
  });

  it("ignores a damaged store", () => {
    local.set("golboard.hideScores", "{not json");
    session.set("golboard.shown", "nope");
    document.body.innerHTML = PAGE;
    run();
    expect(document.querySelectorAll(".masked").length).toBe(0);
  });
});
