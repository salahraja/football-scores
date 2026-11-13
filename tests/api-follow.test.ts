// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "../scripts/api/build.mjs";
import { buildNews } from "../scripts/api/news.mjs";
import { pages } from "../scripts/api/pages.mjs";
import { inlineScripts } from "../scripts/csp.mjs";

// News and Following: /news/ lists the headlines, /following/ shows the clubs you pick, their games and their headlines. The pages are plain
// HTML made from the API; one small script (/leagues/follow.js, from the site itself, so the content-security rules need nothing new) keeps
// the clubs on the device (localStorage) and shows or hides what is theirs.
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "golboard-follow-")); dirs.push(d); return d; };
afterAll(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const FEED = `<rss><channel><item><title>Napoli sign a defender</title><description>&lt;p&gt;A &amp;amp; B&lt;/p&gt;</description><link>https://a.test/n</link><pubDate>Fri, 13 Nov 2026 09:00:00 GMT</pubDate></item>
<item><title>Rain stops play somewhere</title><link>https://a.test/r</link><pubDate>Fri, 13 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>`;

function site({ withNews = true } = {}) {
  const out = tmp();
  build({ input: "tests/fixtures/openfootball", wikipedia: tmp(), out, seasons: ["2025-26"], now: "2026-10-31T17:00:00Z" });
  const raw = tmp();
  if (withNews) writeFileSync(join(raw, "bbc-sport.xml"), FEED);
  buildNews({ api: join(out, "api/v1"), raw, now: "2026-11-13T10:00:00Z" });
  pages({ api: join(out, "api/v1"), out });
  return out;
}
const read = (out: string, path: string) => readFileSync(join(out, path), "utf8");

describe("the pages", () => {
  const out = site();

  it("/news/ lists every headline, each marked with its clubs, links out, and credits the publishers", () => {
    const html = read(out, "news/index.html");
    expect(html).toContain("<title>News | golboard</title>");
    expect(html).toMatch(/<li data-clubs="napoli">\s*<a class="story" href="https:\/\/a\.test\/n"/);
    expect(html).toContain("Napoli sign a defender");
    expect(html).toContain("A &amp; B");
    expect(html).toMatch(/<li data-clubs="">\s*<a class="story" href="https:\/\/a\.test\/r"/);
    expect(html).toContain('data-scope="following"');
    expect(html).toMatch(/<ul class="news" id="mine-news" hidden>/);
    for (const source of ["BBC Sport", "The Guardian", "ESPN"]) expect(html).toContain(source);
    expect(html).toContain("13 Nov");  // when the headlines were gathered
  });

  it("/following/ lets you pick any club, league by league, and has places for their games and headlines", () => {
    const html = read(out, "following/index.html");
    expect(html).toContain("<title>Following | golboard</title>");
    expect(html).toMatch(/<details[^>]*>\s*<summary>Serie A<\/summary>/);
    expect(html).toMatch(/<input type="checkbox" data-club="napoli" data-name="Napoli">/);
    expect(html).toContain('id="following-games"');
    expect(html).toMatch(/<ul class="news" id="mine-news">/);   // filled by follow.js from the followed clubs' own news files
    expect((html.match(/data-club="/g) ?? []).length).toBeGreaterThan(100);  // every club of every league
  });

  it("puts a star beside each club in the league table and a Follow button on each club page", () => {
    const league = read(out, "leagues/it-1/index.html");
    expect(league).toMatch(/<button class="star" type="button" data-club="napoli" data-name="Napoli" aria-pressed="false" aria-label="Follow Napoli">☆<\/button><a href="\/leagues\/it-1\/napoli\/">Napoli<\/a>/);
    expect(read(out, "leagues/it-1/napoli/index.html")).toMatch(/<button class="follow" type="button" data-club="napoli" data-name="Napoli" aria-pressed="false">Follow<\/button>/);
  });

  it("links News and Following from every page, marking the one you are on", () => {
    expect(read(out, "leagues/index.html")).toMatch(/<a href="\/leagues\/" aria-current="page">Leagues<\/a><a href="\/news\/">News<\/a><a href="\/following\/">Following<\/a>/);
    expect(read(out, "leagues/it-1/index.html")).toContain('<a href="/news/">News</a>');
    expect(read(out, "news/index.html")).toContain('<a href="/news/" aria-current="page">News</a>');
    expect(read(out, "following/index.html")).toContain('<a href="/following/" aria-current="page">Following</a>');
  });

  it("loads follow.js from the site and runs no inline script, so the content-security policy needs nothing new", () => {
    for (const path of ["news/index.html", "following/index.html", "leagues/it-1/index.html", "leagues/it-1/napoli/index.html", "leagues/index.html"]) {
      const html = read(out, path);
      expect(html, path).toContain('<script src="/leagues/follow.js" defer></script>');
      expect(inlineScripts(html).filter((s: string) => !s.includes('"@context"')), path).toEqual([]);
    }
    expect(read(out, "leagues/follow.js")).toContain("golboard.following");
  });

  it("keeps a long headline inside the page and the five nav links inside a phone", () => {
    const css = read(out, "leagues/site.css");
    expect(css).toMatch(/\.story \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);       // a grid column is as wide as its longest text unless told it may shrink
    expect(css).toMatch(/@media \(max-width: 480px\) \{ \.nav \.jump \{ display: none; \}/);
    expect(read(out, "leagues/it-1/index.html")).toContain('<a class="jump" href="#table">Table</a>');
  });

  it("puts both pages in the sitemap", () => {
    const map = read(out, "sitemap.xml");
    expect(map).toContain("/news/</loc>");
    expect(map).toContain("/following/</loc>");
  });

  it("still builds when there are no headlines, and says so", () => {
    const empty = site({ withNews: false });
    expect(read(empty, "news/index.html")).toContain("No headlines yet");
    expect(read(empty, "following/index.html")).toContain('id="following-games"');
  });
});

// ---- the script, run against a page made like the real ones
const SCRIPT = readFileSync(join(site(), "leagues/follow.js"), "utf8");
const run = () => { (0, eval)(SCRIPT); };  // an indirect eval: the script runs in the page, as a <script> would
const flush = () => new Promise((r) => setTimeout(r, 0));
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const NEWS_PAGE = `
<button class="star" type="button" data-club="napoli" data-name="Napoli" aria-pressed="false" aria-label="Follow Napoli">☆</button>
<button class="follow" type="button" data-club="napoli" data-name="Napoli" aria-pressed="false">Follow</button>
<div role="group"><button type="button" data-scope="all" aria-pressed="true">All</button><button type="button" data-scope="following" aria-pressed="false">Following</button></div>
<p id="news-none" hidden>none</p>
<ul class="news" data-news="toggle"><li data-clubs="napoli inter"><a>A</a></li><li data-clubs=""><a>B</a></li><li data-clubs="inter"><a>C</a></li></ul>
<ul class="news" id="mine-news" hidden></ul>`;
const FOLLOWING_PAGE = `
<input type="checkbox" data-club="napoli" data-name="Napoli"><input type="checkbox" data-club="inter" data-name="Inter">
<p id="following-count"></p><p id="games-none" hidden></p><ul class="games" id="following-games"></ul>
<p id="news-none" hidden></p><ul class="news" id="mine-news"></ul>`;
const art = (title: string, url: string, at: string, clubs: string[] = [], source = "BBC Sport") => ({ title, summary: `About ${title}`, url, source, published: at, image: null, clubs });
const GENERAL = { articles: [art("General inter", "https://g.test/1", "2026-11-12T10:00:00.000Z", ["inter"]), art("General none", "https://g.test/2", "2026-11-12T11:00:00.000Z"),
  art("General napoli", "https://g.test/3?utm=x", "2026-11-12T09:00:00.000Z", ["napoli"])] };
const CLUB: Record<string, unknown> = {
  inter: { articles: [art("Club inter new", "https://c.test/new", "2026-11-12T12:00:00.000Z", ["inter"], "The Guardian"), art("General inter", "https://g.test/1?from=guardian", "2026-11-12T10:00:00.000Z", ["inter"], "The Guardian")] },
  napoli: { articles: [art("<img src=x onerror=alert(1)>", "https://c.test/evil", "2026-11-12T08:00:00.000Z", ["napoli"], "The Guardian")] },
};
/** A fetch that answers the news file, each club's file (a club with none answers 404) and today's games. */
const newsFetch = (extra: Record<string, unknown> = {}) => vi.fn(async (input: RequestInfo | URL) => {
  const key = String(input).replace("/api/v1/", "");
  const body = key === "news.json" ? GENERAL : key === "today.json" ? { matches: [] } : key.startsWith("news/") ? (CLUB[key.slice(5, -5)] ?? null) : extra[key] ?? null;
  return body ? new Response(JSON.stringify(body)) : new Response("", { status: 404 });
});
const TODAY = { matches: [
  { league: "it-1", home: "napoli", away: "roma", homeName: "Napoli", awayName: "Roma", kickoff: "2026-11-12T19:45:00+00:00" },
  { league: "it-1", home: "juventus", away: "milan", homeName: "Juventus", awayName: "AC Milan", kickoff: "2026-11-12T17:00:00+00:00", score: { ft: [2, 1] } },
  { league: "it-1", home: "evil", away: "lazio", homeName: "<img src=x onerror=alert(1)>", awayName: "Lazio", kickoff: "2026-11-12T20:00:00+00:00" },
] };
const visible = (sel: string) => [...document.querySelectorAll(`${sel} > li`)].filter((li) => !(li as HTMLElement).hidden).map((li) => li.textContent!.trim());

// Node 24 hides jsdom's localStorage behind its own experimental one (absent without a flag), so the page gets a plain stand-in
const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), clear: () => memory.clear() };
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  memory.clear();
  document.body.innerHTML = "";
});

describe("follow.js", () => {
  it("a star follows and unfollows a club, keeps it on the device, and every button for that club agrees", () => {
    document.body.innerHTML = NEWS_PAGE;
    run();
    const star = document.querySelector(".star")!, follow = document.querySelector(".follow")!;
    click(star);
    expect(JSON.parse(storage.getItem("golboard.following")!)).toEqual(["napoli"]);
    expect(star.getAttribute("aria-pressed")).toBe("true");
    expect(star.textContent).toBe("★");
    expect(star.getAttribute("aria-label")).toBe("Unfollow Napoli");
    expect(follow.textContent).toBe("Following");
    click(follow);
    expect(JSON.parse(storage.getItem("golboard.following")!)).toEqual([]);
    expect(star.textContent).toBe("☆");
  });

  it("starts from the clubs already followed, and ignores a damaged store", () => {
    storage.setItem("golboard.following", JSON.stringify(["napoli", 7, null]));
    document.body.innerHTML = NEWS_PAGE;
    run();
    expect(document.querySelector(".star")!.getAttribute("aria-pressed")).toBe("true");
    storage.setItem("golboard.following", "{not json");
    document.body.innerHTML = NEWS_PAGE;
    run();
    expect(document.querySelector(".star")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("News: All shows the general list; Following shows the followed clubs' own stories with the general ones that name them, newest first, each once", async () => {
    storage.setItem("golboard.following", JSON.stringify(["inter"]));
    document.body.innerHTML = NEWS_PAGE;
    window.fetch = newsFetch();
    run();
    expect(visible(".news[data-news]")).toEqual(["A", "B", "C"]);
    click(document.querySelector('[data-scope="following"]')!);
    await flush(); await flush();
    expect((document.querySelector('.news[data-news]') as HTMLElement).hidden).toBe(true);
    const titles = [...document.querySelectorAll("#mine-news .t")].map((t) => t.textContent);
    expect(titles).toEqual(["Club inter new", "General inter"]);     // the Guardian's twin of "General inter" is the same story
    expect(window.fetch).toHaveBeenCalledWith("/api/v1/news/inter.json");
    expect(storage.getItem("golboard.newsScope")).toBe("following");
    click(document.querySelector('[data-scope="all"]')!);
    expect((document.querySelector('.news[data-news]') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById("mine-news") as HTMLElement).hidden).toBe(true);
  });

  it("News: says what to do when no club is followed, or none has a story, and remembers the scope", async () => {
    storage.setItem("golboard.newsScope", "following");
    document.body.innerHTML = NEWS_PAGE;
    window.fetch = newsFetch();
    run();
    await flush(); await flush();
    expect(document.getElementById("news-none")!.textContent).toMatch(/not following any clubs/i);
    storage.setItem("golboard.following", JSON.stringify(["lazio"]));    // a club with no file and no general story
    document.body.innerHTML = NEWS_PAGE;
    run();
    await flush(); await flush();
    expect((document.getElementById("news-none") as HTMLElement).hidden).toBe(false);
    expect(document.getElementById("news-none")!.textContent).toMatch(/no headlines mention your clubs/i);
  });

  it("Following: shows the followed clubs' stories at once, and a club whose file is missing does not hide the others", async () => {
    storage.setItem("golboard.following", JSON.stringify(["inter", "lazio"]));
    document.body.innerHTML = FOLLOWING_PAGE;
    window.fetch = newsFetch();
    run();
    await flush(); await flush();
    expect([...document.querySelectorAll("#mine-news .t")].map((t) => t.textContent)).toEqual(["Club inter new", "General inter"]);
    const box = document.querySelector('input[data-club="napoli"]') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await flush(); await flush();
    expect([...document.querySelectorAll("#mine-news .t")].map((t) => t.textContent)).toEqual(["Club inter new", "General inter", "General napoli", "<img src=x onerror=alert(1)>"]);
    expect(document.querySelector("#mine-news img")).toBeNull();       // written as text
    expect(document.querySelector("#mine-news a")!.getAttribute("href")).toBe("https://c.test/new");
    expect(document.getElementById("following-count")!.textContent).toContain("3");
  });

  it("Following: lists the games of the followed clubs from today.json, and writes names as text, never as markup", async () => {
    storage.setItem("golboard.following", JSON.stringify(["napoli", "milan", "evil"]));
    document.body.innerHTML = FOLLOWING_PAGE;
    const fetchStub = vi.fn(async () => new Response(JSON.stringify(TODAY)));
    window.fetch = fetchStub;
    run();
    await flush(); await flush();
    expect(fetchStub).toHaveBeenCalledWith("/api/v1/today.json");
    const rows = [...document.querySelectorAll("#following-games > li")];
    expect(rows.map((r) => r.querySelector(".home")!.textContent)).toEqual(["Juventus", "Napoli", "<img src=x onerror=alert(1)>"]);  // by kick-off
    expect(rows[0].querySelector(".mid")!.textContent).toBe("2–1");
    expect(document.querySelector("#following-games img")).toBeNull();
    expect((document.getElementById("games-none") as HTMLElement).hidden).toBe(true);
  });

  it("Following: says what to do when no club is followed, or none has a game", async () => {
    document.body.innerHTML = FOLLOWING_PAGE;
    window.fetch = vi.fn(async () => new Response(JSON.stringify(TODAY)));
    run();
    await flush(); await flush();
    expect((document.getElementById("games-none") as HTMLElement).hidden).toBe(false);
    expect(document.getElementById("games-none")!.textContent).toMatch(/pick/i);
    storage.setItem("golboard.following", JSON.stringify(["inter"]));
    document.body.innerHTML = FOLLOWING_PAGE;
    run();
    await flush(); await flush();
    expect(document.getElementById("games-none")!.textContent).toMatch(/no games/i);
  });

  it("Following: a games file that cannot be read says so", async () => {
    storage.setItem("golboard.following", JSON.stringify(["napoli"]));
    document.body.innerHTML = FOLLOWING_PAGE;
    window.fetch = vi.fn(async () => new Response("", { status: 404 }));
    run();
    await flush(); await flush();
    expect(document.getElementById("games-none")!.textContent).toMatch(/could not/i);
  });
});
