<script setup lang="ts">
import { computed } from "vue";
import { api } from "../api";
import { COMPETITIONS } from "../competitions";
import { phase } from "../format";
import { useResource } from "../useResource";
import type { Match } from "../types";
import DataNote from "../components/DataNote.vue";
import MatchCard from "../components/MatchCard.vue";
import StateBox from "../components/StateBox.vue";

const { data, error, loading } = useResource(api.today, { refreshMs: 60_000 });

const ORDER = { live: 0, finished: 1, upcoming: 2, off: 3 };

const groups = computed(() => {
  const matches = data.value?.matches ?? [];
  const byCode = new Map<string, Match[]>();
  for (const m of matches) byCode.set(m.competition.code, [...(byCode.get(m.competition.code) ?? []), m]);
  const out = [...byCode.entries()].map(([code, list]) => ({
    code,
    name: COMPETITIONS.find((c) => c.code === code)?.name ?? list[0].competition.name,
    matches: [...list].sort(
      (a, b) => ORDER[phase(a.status)] - ORDER[phase(b.status)] || a.utcDate.localeCompare(b.utcDate),
    ),
  }));
  const rank = (code: string) => COMPETITIONS.findIndex((c) => c.code === code);
  const live = (g: (typeof out)[number]) => g.matches.some((m) => phase(m.status) === "live");
  return out.sort((a, b) => Number(live(b)) - Number(live(a)) || rank(a.code) - rank(b.code));
});
</script>

<template>
  <section aria-labelledby="today-title">
    <h1 id="today-title">Today</h1>
    <p class="lede">Updated every minute. Scores can lag a little behind the match.</p>

    <StateBox v-if="loading" kind="loading" message="Loading today's matches..." />
    <StateBox v-else-if="!data" kind="error" :message="error ?? ''" />
    <template v-else>
      <DataNote :stale="data.stale" :partial="false" :age="data.age" :error="error" />
      <StateBox v-if="!groups.length" kind="empty" message="No matches today in these competitions." />
      <section v-for="g in groups" :key="g.code" class="group" :aria-label="g.name">
        <h2>{{ g.name }}</h2>
        <MatchCard v-for="m in g.matches" :key="m.id" :match="m" />
      </section>
    </template>
  </section>
</template>
