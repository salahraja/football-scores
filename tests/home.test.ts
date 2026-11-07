import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import HomeView from "../src/views/HomeView.vue";
import { getResultRounds, getStandings } from "../src/data";

// The homepage as a matchday board (Salah, 2026-10-30: "Stadio clay"): the latest result as the hero, the table, the round's results,
// and places for top scorers and headlines that stay empty until their data exists (nothing invented).
const home = () => mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });

describe("home", () => {
  it("leads with a result from the newest round, Juventus's when they played", () => {
    const newest = getResultRounds()[0];
    const featured = newest.events.find((e) => [e.homeTeam.name, e.awayTeam.name].includes("Juventus")) ?? newest.events[0];
    const hero = home().get('[data-test="hero"]');
    expect(hero.text()).toContain(featured.homeTeam.name);
    expect(hero.text()).toContain(`${featured.homeScore.current}–${featured.awayScore.current}`);
    expect(hero.text()).toContain(`Matchday ${newest.round}`);
  });

  it("shows the whole table with points, Juventus marked", () => {
    const wrapper = home();
    const rows = wrapper.findAll('[data-test="table"] tbody tr');
    expect(rows).toHaveLength(getStandings().length);
    const juve = rows.find((r) => r.text().includes("Juventus"));
    expect(juve?.classes()).toContain("mine");
  });

  it("lists every match of the newest round", () => {
    expect(home().findAll('[data-test="round"] .match')).toHaveLength(getResultRounds()[0].events.length);
  });

  it("links to the full table and all results, and invents no scorers or headlines", () => {
    const wrapper = home();
    const links = wrapper.findAll("a").map((a) => a.attributes("href")); // plain links since the move to Astro (2026-11-07)
    expect(links).toEqual(expect.arrayContaining(["/standings", "/results"]));
    expect(wrapper.get('[data-test="scorers"]').text()).toMatch(/live build/i);
    expect(wrapper.get('[data-test="headlines"]').text()).toMatch(/to choose/i);
  });
});

// Salah, 2026-11-07: swiping through the games left the league's name sliding too. Only what changed moves.
describe("the poster's arrows", () => {
  it("move only the game when the game changes, and leave the league still", async () => {
    const wrapper = home();
    await wrapper.get('[data-test="game-next"]').trigger("click");
    expect(wrapper.get(".poster__result").classes()).toContain("from-right");
    expect(wrapper.get(".poster__titlebar").classes()).not.toContain("from-right");
    await wrapper.get('[data-test="game-prev"]').trigger("click");
    expect(wrapper.get(".poster__result").classes()).toContain("from-left");
    expect(wrapper.get(".poster__titlebar").classes()).not.toContain("from-left");
  });
});
