import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import App from "../src/App.vue";
import { selectCompetition } from "../src/competitions";
import { makeRouter } from "../src/router";
import { RETRY_MS } from "../src/useResource";
import ClubView from "../src/views/ClubView.vue";
import FixturesView from "../src/views/FixturesView.vue";
import TableView from "../src/views/TableView.vue";
import TodayView from "../src/views/TodayView.vue";
import FormChips from "../src/components/FormChips.vue";
import ZoneLegend from "../src/components/ZoneLegend.vue";
import { meta, route, standingsSA, teamJuve, today } from "./fixtures";
import { mockFetch, mountAt } from "./helpers";

beforeEach(() => {
  localStorage.clear();
  selectCompetition("SA");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Today", () => {
  it("groups by competition, live first, with minute and injury time", async () => {
    mockFetch();
    const { wrapper } = await mountAt("/", TodayView);
    const groups = wrapper.findAll("section.group");
    // Serie A has a live match, so it comes before the Champions League group.
    expect(groups.map((g) => g.find("h2").text())).toEqual(["Serie A", "UEFA Champions League"]);
    const serieA = groups[0].findAll("article");
    expect(serieA[0].text()).toContain("90+3'");
    expect(serieA[0].find('[data-test="score"]').text()).toBe("1–0");
    expect(serieA[1].text()).toContain("FT");
    expect(serieA[2].find('[data-test="time"]').exists()).toBe(true); // kick-off time for the one to come
    const cl = groups[1].text();
    expect(cl).toContain("AET");
    expect(cl).toContain("pens 6-5");
    expect(wrapper.text()).toContain("Updated every minute");
    expect(wrapper.find('[data-test="stale"]').exists()).toBe(false);
  });

  it("refreshes every 60 seconds", async () => {
    vi.useFakeTimers();
    const { calls } = mockFetch();
    await mountAt("/", TodayView);
    expect(calls.filter((c) => c === "/api/today")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.filter((c) => c === "/api/today")).toHaveLength(2);
  });

  it("says how old stale data is", async () => {
    mockFetch(() => [200, { ...today, stale: true, age: 12 * 60 }]);
    const { wrapper } = await mountAt("/", TodayView);
    expect(wrapper.find('[data-test="stale"]').text()).toContain("12 minutes old");
  });

  it("shows an empty state", async () => {
    mockFetch(() => [200, { ...today, matches: [] }]);
    const { wrapper } = await mountAt("/", TodayView);
    expect(wrapper.text()).toContain("No matches today");
  });

  it("shows a loading state first", async () => {
    mockFetch(() => new Promise(() => {}));
    const router = makeRouter(createMemoryHistory());
    const wrapper = mount(TodayView, { global: { plugins: [router] } });
    expect(wrapper.find('[role="status"]').text()).toContain("Loading");
  });

  it("explains a busy service and retries", async () => {
    vi.useFakeTimers();
    let n = 0;
    mockFetch(() => (n++ === 0 ? [503, { error: "x" }] : [200, today]));
    const { wrapper } = await mountAt("/", TodayView);
    expect(wrapper.find('[role="alert"]').text()).toBe("The data service is busy, trying again shortly.");
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll("article").length).toBeGreaterThan(0);
  });

  it("keeps the last data when a refresh fails", async () => {
    vi.useFakeTimers();
    let n = 0;
    mockFetch(() => (n++ === 0 ? [200, today] : [503, {}]));
    const { wrapper } = await mountAt("/", TodayView);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(wrapper.findAll("article").length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("busy");
  });
});

describe("Fixtures", () => {
  it("defaults to Serie A and the current matchday, with crests and alt text", async () => {
    const { calls } = mockFetch();
    const { wrapper } = await mountAt("/fixtures", FixturesView);
    expect(calls).toContain("/api/competitions/SA/matches");
    expect(wrapper.find("select").element.value).toBe("md:8");
    // The team name is written next to each crest, so the crest is decoration for screen readers.
    expect(wrapper.find("img.crest").exists()).toBe(true);
    expect(wrapper.findAll("img.crest").every((i) => i.attributes("alt") === "")).toBe(true);
    expect(wrapper.find('button[aria-pressed="true"]').text()).toBe("Serie A");
  });

  it("remembers the competition and asks for a picked matchday", async () => {
    const { calls } = mockFetch();
    const { wrapper } = await mountAt("/fixtures", FixturesView);
    const pl = wrapper.findAll("button.pill").find((b) => b.text() === "Premier League")!;
    await pl.trigger("click");
    await flushPromises();
    expect(localStorage.getItem("football.competition")).toBe("PL");
    expect(calls).toContain("/api/competitions/PL/matches");
    await wrapper.find('button[aria-label="Previous matchday"]').trigger("click");
    await flushPromises();
    expect(calls).toContain("/api/competitions/PL/matches?matchday=7");
  });

  it("lists a day's matches by kick-off time, whatever order the API sends them", async () => {
    const { matchesSA } = await import("./fixtures");
    mockFetch();
    const { wrapper } = await mountAt("/fixtures", FixturesView);
    const labels = wrapper.findAll("article").map((a) => a.attributes("aria-label"));
    const times = [...matchesSA.matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    expect(labels).toEqual(times.map((m) => expect.stringContaining(m.homeTeam.name)));
    expect(matchesSA.matches.map((m) => m.utcDate)).not.toEqual(times.map((m) => m.utcDate)); // the API order was not sorted
  });

  it("shows pens and AET on the cards", async () => {
    const { pens, matchesSA, aet } = await import("./fixtures");
    mockFetch(() => [200, { ...matchesSA, matches: [pens, aet] }]);
    const { wrapper } = await mountAt("/fixtures", FixturesView);
    expect(wrapper.text()).toContain("pens 6-5");
    expect(wrapper.text()).toContain("AET");
  });

  it("lists Champions League rounds in plain words and asks for the one picked", async () => {
    const { calls } = mockFetch();
    const { wrapper } = await mountAt("/fixtures", FixturesView);
    await wrapper.findAll("button.pill").find((b) => b.text() === "Champions League")!.trigger("click");
    await flushPromises();
    const labels = wrapper.findAll("select option").map((o) => o.text());
    expect(labels).toContain("League phase, matchday 8 (current)");
    expect(labels.slice(-4)).toEqual(["Knockout play-offs", "Round of 16", "Quarter-finals", "Final"]);
    expect(labels.filter((l) => l.startsWith("League phase"))).toHaveLength(8);
    await wrapper.find("select").setValue("stage:LAST_16");
    await flushPromises();
    expect(calls).toContain("/api/competitions/CL/matches?stage=LAST_16");
    // Next steps on to the following round, and says round, not matchday.
    expect(wrapper.find('button[aria-label="Previous matchday"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Previous round"]').exists()).toBe(true);
    await wrapper.find('button[aria-label="Next round"]').trigger("click");
    await flushPromises();
    expect(calls).toContain("/api/competitions/CL/matches?stage=QUARTER_FINALS");
  });

  it("shows partial and empty and error states", async () => {
    const { matchesSA } = await import("./fixtures");
    mockFetch(() => [200, { ...matchesSA, matches: [], partial: true }]);
    let { wrapper } = await mountAt("/fixtures", FixturesView);
    expect(wrapper.text()).toContain("No matches on this matchday");
    expect(wrapper.find('[data-test="partial"]').exists()).toBe(true);
    mockFetch(() => [500, {}]);
    ({ wrapper } = await mountAt("/fixtures", FixturesView));
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
});

describe("Table", () => {
  it("renders every column, zone bars and the legend", async () => {
    mockFetch();
    const { wrapper } = await mountAt("/table", TableView);
    const heads = wrapper.findAll("th").map((h) => h.text());
    expect(heads).toEqual(["#", "Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts", "Form"]);
    const rows = wrapper.findAll("tbody tr");
    expect(rows).toHaveLength(7);
    expect(rows[0].find("td.pos").classes()).toContain("zone-championsLeague");
    expect(rows[4].find("td.pos").classes()).toContain("zone-europaLeague");
    expect(rows[0].findAll(".chip")).toHaveLength(5);
    expect(rows[0].find(".chip-D").attributes("title")).toBe("Draw");
    expect(wrapper.find(".table-scroll").exists()).toBe(true);
    expect(wrapper.findAll(".legend li")).toHaveLength(4);
  });

  it("shows busy, stale and empty states", async () => {
    mockFetch(() => [503, {}]);
    let { wrapper } = await mountAt("/table", TableView);
    expect(wrapper.text()).toContain("The data service is busy, trying again shortly");
    mockFetch(() => [200, { ...standingsSA, stale: true, age: 300 }]);
    ({ wrapper } = await mountAt("/table", TableView));
    expect(wrapper.find('[data-test="stale"]').text()).toContain("5 minutes old");
    mockFetch(() => [200, { ...standingsSA, table: [], stale: false }]);
    ({ wrapper } = await mountAt("/table", TableView));
    expect(wrapper.text()).toContain("No table yet");
  });
});

describe("zone legend", () => {
  it("lists zones in table order, including Champions League qualifying", () => {
    const w = mount(ZoneLegend, {
      props: {
        zones: {
          relegation: { label: "Relegation", from: 17, to: 18 },
          championsLeagueQualifying: { label: "Champions League qualifying (league path)", from: 4, to: 4 },
          championsLeague: { label: "Champions League", from: 1, to: 3 },
        },
      },
    });
    const items = w.findAll("li");
    expect(items.map((i) => i.attributes("data-zone"))).toEqual([
      "championsLeague",
      "championsLeagueQualifying",
      "relegation",
    ]);
    expect(items[0].text()).toContain("(1-3)");
  });
});

describe("form chips component", () => {
  it("puts the shootout in the chip title", () => {
    const w = mount(FormChips, { props: { items: [{ result: "D", shootout: "W" }, { result: "D", shootout: "L" }, { result: "W" }] } });
    expect(w.findAll(".chip").map((c) => c.attributes("title"))).toEqual(["Draw, won on pens", "Draw, lost on pens", "Win"]);
    expect(w.attributes("aria-label")).toContain("won on pens");
  });
});

describe("Club", () => {
  it("shows the club, next match, last five with shootout, positions", async () => {
    mockFetch();
    const { wrapper } = await mountAt("/club/109", ClubView);
    expect(wrapper.find("h1").text()).toBe("Juventus FC");
    expect(wrapper.text()).toContain("Allianz Stadium");
    expect(wrapper.text()).toContain("Founded 1897");
    expect(wrapper.find('section[aria-label="Next match"] article').exists()).toBe(true);
    const recent = wrapper.findAll(".recent li");
    expect(recent).toHaveLength(5);
    expect(recent.map((r) => r.find(".chip").text())).toEqual(["W", "D", "W", "L", "W"]);
    // Five different dates, newest first, about a week apart.
    const days = recent.map((r) => r.find(".muted").text().split(",")[0]);
    expect(new Set(days).size).toBe(5);
    expect(wrapper.findAll(".positions li").map((l) => l.text())).toEqual([
      expect.stringContaining("Serie A"),
      expect.stringContaining("UEFA Champions League"),
    ]);
    expect(wrapper.find('[data-test="partial"]').exists()).toBe(false);
  });

  it("says won or lost on pens for a shootout in the last five", async () => {
    const { teamJuveShootout } = await import("./fixtures");
    mockFetch(() => [200, teamJuveShootout]);
    const { wrapper } = await mountAt("/club/109", ClubView);
    const first = wrapper.findAll(".recent li")[0];
    expect(first.find(".chip").attributes("title")).toBe("Draw, won on pens");
    expect(first.text()).toContain("won on pens");
  });

  it("notes when data was left out", async () => {
    mockFetch(() => [200, { ...teamJuve, partial: true, positions: [], nextMatch: null }]);
    const { wrapper } = await mountAt("/club/109", ClubView);
    expect(wrapper.find('[data-test="partial"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("No upcoming match");
    expect(wrapper.text()).toContain("No league position");
  });

  it("shows not found", async () => {
    mockFetch(() => [404, { error: "Unknown team" }]);
    const { wrapper } = await mountAt("/club/5", ClubView);
    expect(wrapper.find('[role="alert"]').text()).toContain("could not find");
  });
});

describe("App", () => {
  it("pins Juventus in the nav, found by name in the Serie A table", async () => {
    mockFetch();
    const router = makeRouter(createMemoryHistory());
    router.push("/");
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();
    const link = wrapper.find("nav a.pinned");
    expect(link.text()).toBe("Juventus");
    expect(link.attributes("href")).toBe("/club/109");
    expect(wrapper.find("footer").text()).toContain("football-data.org");
  });
});

void meta;
void route;
