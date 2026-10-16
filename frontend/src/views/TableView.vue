<script setup lang="ts">
import { api } from "../api";
import { selectedCompetition } from "../competitions";
import { parseForm } from "../format";
import { useResource } from "../useResource";
import type { Zone } from "../types";
import CompetitionSwitcher from "../components/CompetitionSwitcher.vue";
import Crest from "../components/Crest.vue";
import DataNote from "../components/DataNote.vue";
import FormChips from "../components/FormChips.vue";
import StateBox from "../components/StateBox.vue";
import ZoneLegend from "../components/ZoneLegend.vue";

const { data, error, loading } = useResource(() => api.standings(selectedCompetition.value), {
  watch: [selectedCompetition],
});

function zoneOf(zones: Record<string, Zone>, position: number) {
  const hit = Object.entries(zones).find(([, z]) => position >= z.from && position <= z.to);
  return hit ? { key: hit[0], label: hit[1].label } : null;
}
</script>

<template>
  <section aria-labelledby="table-title">
    <h1 id="table-title">Table</h1>
    <CompetitionSwitcher />

    <StateBox v-if="loading" kind="loading" message="Loading the table..." />
    <StateBox v-else-if="!data" kind="error" :message="error ?? ''" />
    <template v-else>
      <DataNote :stale="data.stale" :partial="data.partial" :age="data.age" :error="error" />
      <p v-if="data.season.label" class="lede">Season {{ data.season.label }}</p>
      <StateBox v-if="!data.table.length" kind="empty" message="No table yet for this competition." />
      <template v-else>
        <div class="table-scroll" tabindex="0" role="region" aria-label="League table, scrolls sideways on small screens">
          <table class="standings">
            <thead>
              <tr>
                <th scope="col" class="num">#</th>
                <th scope="col" class="team-col">Team</th>
                <th scope="col" class="num" title="Played">P</th>
                <th scope="col" class="num" title="Won">W</th>
                <th scope="col" class="num" title="Drawn">D</th>
                <th scope="col" class="num" title="Lost">L</th>
                <th scope="col" class="num" title="Goals for">GF</th>
                <th scope="col" class="num" title="Goals against">GA</th>
                <th scope="col" class="num" title="Goal difference">GD</th>
                <th scope="col" class="num" title="Points">Pts</th>
                <th scope="col">Form</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.table" :key="row.team.id">
                <td class="num pos" :class="zoneOf(data.zones, row.position) && `zone-${zoneOf(data.zones, row.position)!.key}`">
                  {{ row.position }}
                  <span v-if="zoneOf(data.zones, row.position)" class="sr-only">, {{ zoneOf(data.zones, row.position)!.label }}</span>
                </td>
                <td class="team-col">
                  <router-link class="team-link" :to="`/club/${row.team.id}`">
                    <Crest :src="row.team.crest" :name="row.team.name" :size="24" />
                    <span>{{ row.team.shortName }}</span>
                  </router-link>
                </td>
                <td class="num">{{ row.played }}</td>
                <td class="num">{{ row.won }}</td>
                <td class="num">{{ row.draw }}</td>
                <td class="num">{{ row.lost }}</td>
                <td class="num">{{ row.goalsFor }}</td>
                <td class="num">{{ row.goalsAgainst }}</td>
                <td class="num">{{ row.goalDifference > 0 ? "+" : "" }}{{ row.goalDifference }}</td>
                <td class="num pts">{{ row.points }}</td>
                <td><FormChips :items="parseForm(row.form)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <ZoneLegend :zones="data.zones" />
      </template>
    </template>
  </section>
</template>
