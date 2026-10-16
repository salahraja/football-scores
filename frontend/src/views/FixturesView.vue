<script setup lang="ts">
import { computed, ref } from "vue";
import { api } from "../api";
import { COMPETITIONS, LEAGUE_STAGES, STAGE_LABELS, selectedCompetition } from "../competitions";
import { kickoffDay } from "../format";
import { useResource } from "../useResource";
import CompetitionSwitcher from "../components/CompetitionSwitcher.vue";
import DataNote from "../components/DataNote.vue";
import MatchCard from "../components/MatchCard.vue";
import StateBox from "../components/StateBox.vue";

// One entry per thing the picker can show: a matchday ("md:3") or a knockout round ("stage:LAST_16").
interface Option {
  key: string;
  label: string;
  matchday: number | null;
  stage: string | null;
}

// What was picked by hand belongs to the competition it was picked in.
const picked = ref<{ code: string; key: string } | null>(null);
const pickedKey = computed(() => (picked.value?.code === selectedCompetition.value ? picked.value.key : null));

const options = computed<Option[]>(() => {
  const code = selectedCompetition.value;
  const total = COMPETITIONS.find((c) => c.code === code)?.matchdays ?? 38;
  const current = data.value?.currentMatchday;
  const matchdays = (prefix: string): Option[] =>
    Array.from({ length: total }, (_, i) => i + 1).map((n) => ({
      key: `md:${n}`,
      label: `${prefix}${n}${n === current ? " (current)" : ""}`,
      matchday: n,
      stage: null,
    }));
  if (code !== "CL") return matchdays("");
  // Champions League: the league phase by matchday, then each knockout round that has matches.
  const stages = data.value?.stages.length ? data.value.stages : ["LEAGUE_STAGE"];
  return stages.flatMap((s) =>
    LEAGUE_STAGES.includes(s)
      ? matchdays(`${STAGE_LABELS[s] ?? "League phase"}, matchday `)
      : [{ key: `stage:${s}`, label: STAGE_LABELS[s] ?? s, matchday: null, stage: s }],
  );
});

// The request comes from the key alone: the option list is rebuilt from the data being reloaded.
function load() {
  const [kind, value] = (pickedKey.value ?? "").split(":");
  return api.matches(
    selectedCompetition.value,
    kind === "md" ? Number(value) : null,
    kind === "stage" ? value : null,
  );
}
const { data, error, loading } = useResource(load, { watch: [selectedCompetition, pickedKey] });

const shownKey = computed(() => pickedKey.value ?? (data.value?.matchday ? `md:${data.value.matchday}` : ""));
const at = computed(() => options.value.findIndex((o) => o.key === shownKey.value));

function go(key: string) {
  picked.value = { code: selectedCompetition.value, key };
}
function step(by: number) {
  const next = options.value[at.value + by];
  if (next) go(next.key);
}

const days = computed(() => {
  const out: { day: string; matches: NonNullable<typeof data.value>["matches"] }[] = [];
  for (const m of data.value?.matches ?? []) {
    const day = kickoffDay(m.utcDate);
    const last = out[out.length - 1];
    if (last && last.day === day) last.matches.push(m);
    else out.push({ day, matches: [m] });
  }
  return out;
});
</script>

<template>
  <section aria-labelledby="fixtures-title">
    <h1 id="fixtures-title">Fixtures &amp; results</h1>
    <CompetitionSwitcher />

    <div class="picker">
      <button type="button" class="btn" aria-label="Previous matchday" :disabled="at <= 0" @click="step(-1)">
        &lsaquo;
      </button>
      <label class="picker-label">
        <span>{{ selectedCompetition === "CL" ? "Round" : "Matchday" }}</span>
        <select :value="shownKey" :disabled="at < 0" @change="go(($event.target as HTMLSelectElement).value)">
          <option v-if="at < 0" value="">-</option>
          <option v-for="o in options" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
      </label>
      <button type="button" class="btn" aria-label="Next matchday" :disabled="at < 0 || at >= options.length - 1" @click="step(1)">
        &rsaquo;
      </button>
    </div>

    <StateBox v-if="loading" kind="loading" message="Loading matches..." />
    <StateBox v-else-if="!data" kind="error" :message="error ?? ''" />
    <template v-else>
      <DataNote :stale="data.stale" :partial="data.partial" :age="data.age" :error="error" />
      <StateBox v-if="!data.matches.length" kind="empty" message="No matches on this matchday." />
      <section v-for="d in days" :key="d.day" class="group" :aria-label="d.day">
        <h2>{{ d.day }}</h2>
        <MatchCard v-for="m in d.matches" :key="m.id" :match="m" />
      </section>
    </template>
  </section>
</template>
