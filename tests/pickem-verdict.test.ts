import { describe, expect, it } from "vitest";
import { pickemScript, verdict } from "../scripts/api/pickem.mjs";

// Salah, 2026-11-17, on AFCON Group K (picked Cape Verde and Mali through; Mali and Rwanda went): "When the group stages are set, it should
// update to say you got it wrong." Once a group's games are all played (bracket.done), the card grades the teams you sent through
// against the teams that went through.
const B = {
  groups: { K: ["cpv", "mli", "rwa", "lbr"] }, rounds: [], format: { advance: 2, thirds: 0, thirdsVs: [], table: {} }, hosts: [], advance: {},
  done: { K: true }, now: { groups: { K: ["mli", "rwa"] }, final: false },
};
const pick = (order: string[]) => ({ groups: { K: order }, at: {}, thirds: [], ko: {} });

describe("grading a group once it is set", () => {
  it("says you got it wrong when none of your teams went through", () => {
    expect(verdict(B, pick(["cpv", "lbr", "mli", "rwa"]), "K")).toEqual({ right: 0, of: 2, text: "You got it wrong", state: "wrong" });
  });
  it("says how many you got when some went through", () => {
    expect(verdict(B, pick(["cpv", "mli", "rwa", "lbr"]), "K")).toEqual({ right: 1, of: 2, text: "You got 1 of 2 right", state: "part" });
  });
  it("says you got it right when all of them went through, in any order", () => {
    expect(verdict(B, pick(["rwa", "mli", "cpv", "lbr"]), "K")).toEqual({ right: 2, of: 2, text: "You got it right", state: "right" });
  });
  it("says nothing while the group is still being played, or when you never picked it", () => {
    expect(verdict({ ...B, done: {} }, pick(["cpv", "mli"]), "K")).toBeNull();
    expect(verdict(B, pick([]), "K")).toBeNull();
  });
  it("the page's script grades the cards with the same function", () => {
    expect(pickemScript()).toContain("var verdict = ");
    expect(pickemScript()).toMatch(/class="verdict /);
  });
});
