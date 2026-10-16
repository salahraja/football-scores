<script setup lang="ts">
import { computed } from "vue";
import { chipTitle, type FormItem } from "../format";

const props = defineProps<{ items: FormItem[] }>();
const summary = computed(() => "Recent form: " + props.items.map(chipTitle).join(", "));
</script>

<template>
  <span v-if="items.length" class="form" role="img" :aria-label="summary">
    <span
      v-for="(item, i) in items"
      :key="i"
      class="chip"
      :class="`chip-${item.result}`"
      :title="chipTitle(item)"
      aria-hidden="true"
      >{{ item.result }}</span
    >
  </span>
  <span v-else class="muted">-</span>
</template>
