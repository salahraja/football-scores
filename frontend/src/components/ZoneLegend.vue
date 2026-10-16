<script setup lang="ts">
import { computed } from "vue";
import type { Zone } from "../types";

const props = defineProps<{ zones: Record<string, Zone> }>();
const entries = computed(() =>
  Object.entries(props.zones)
    .map(([key, zone]) => ({ key, ...zone }))
    .sort((a, b) => a.from - b.from),
);
</script>

<template>
  <ul v-if="entries.length" class="legend" aria-label="Table zones">
    <li v-for="z in entries" :key="z.key" :data-zone="z.key">
      <span class="swatch" :class="`zone-${z.key}`" aria-hidden="true"></span>
      {{ z.label }} <span class="muted">({{ z.from === z.to ? z.from : `${z.from}-${z.to}` }})</span>
    </li>
  </ul>
</template>
