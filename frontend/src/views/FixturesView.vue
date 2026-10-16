<script setup lang="ts">
import { computed, ref } from "vue";
import { api } from "../api";
import { COMPETITIONS, selectedCompetition } from "../competitions";
import { kickoffDay } from "../format";
import { useResource } from "../useResource";
import CompetitionSwitcher from "../components/CompetitionSwitcher.vue";
import DataNote from "../components/DataNote.vue";
import MatchCard from "../components/MatchCard.vue";
import StateBox from "../components/StateBox.vue";

// A matchday picked by hand belongs to the competition it was picked in.
const picked = ref<{ code: string; matchday: number } | null>(null);
const matchday = computed(() => (picked.value?.code === selectedCompetition.value ? picked.value.matchday : null));

const { data, error, loading } = useResource(() => api.matches(selectedCompetition.value, matchday.value), {
  watch: [selectedCompetition, matchday],
});

const total = computed(() => COMPETITIONS.find((c) => c.code === selectedCompetition.value)?.matchdays ?? 38);
const shown = computed(() => data.value?.matchday ?? matchday.value);
const options = computed(() => Array.from({ length: total.value }, (_, i) => i + 1));

function go(n: number) {
  if (n >= 1 && n <= total.value) picked.value = { code: selectedCompetition.value, matchday: n };
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
      <button type="button" class="btn" aria-label="Previous matchday" :disabled="!shown || shown <= 1" @click="go((shown ?? 1) - 1)">
        &lsaquo;
      </button>
      <label class="picker-label">
        <span>Matchday</span>
        <select :value="shown ?? ''" :disabled="!shown" @change="go(Number(($event.target as HTMLSelectElement).value))">
          <option v-if="!shown" value="">-</option>
          <option v-for="n in options" :key="n" :value="n">
            {{ n }}{{ n === data?.currentMatchday ? " (current)" : "" }}
          </option>
        </select>
      </label>
      <button type="button" class="btn" aria-label="Next matchday" :disabled="!shown || shown >= total" @click="go((shown ?? 0) + 1)">
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
