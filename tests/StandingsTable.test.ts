import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StandingsTable from "../src/components/StandingsTable.vue";
import { getStandings } from "../src/data";

describe("StandingsTable", () => {
  const rows = getStandings();
  const wrapper = mount(StandingsTable, { props: { rows } });

  it("renders the header columns", () => {
    const heads = wrapper.findAll("thead th").map((h) => h.text());
    expect(heads).toEqual(["Position", "Team", "P", "W", "D", "L", "Points"]);
  });
  it("renders one row per team in table order with its numbers", () => {
    const trs = wrapper.findAll("tbody tr");
    expect(trs).toHaveLength(rows.length);
    const first = trs[0].findAll("td, th").map((c) => c.text());
    const r = rows[0];
    expect(first).toEqual([String(r.position), r.team.name, String(r.matches), String(r.wins), String(r.draws), String(r.losses), String(r.points)]);
  });
  it("renders an empty body for no rows", () => {
    const empty = mount(StandingsTable, { props: { rows: [] } });
    expect(empty.findAll("tbody tr")).toHaveLength(0);
  });
});
