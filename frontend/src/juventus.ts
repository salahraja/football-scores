import { ref } from "vue";
import { api } from "./api";

/** Juventus's id, found by name in the Serie A table (the API has no team list of its own). */
export const juventusId = ref<number | null>(null);

let started = false;

export async function findJuventus() {
  if (started) return;
  started = true;
  try {
    const table = await api.standings("SA");
    const row = table.table.find((r) => /juventus/i.test(r.team.name));
    juventusId.value = row ? row.team.id : null;
  } catch {
    started = false; // try again on the next page load; the link just stays hidden
  }
}
