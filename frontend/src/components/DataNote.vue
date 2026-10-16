<script setup lang="ts">
import { computed } from "vue";
import { ageText } from "../format";

const props = defineProps<{ stale: boolean; partial: boolean; age: number; error?: string | null }>();
const staleText = computed(() => `Showing saved data: the data is ${ageText(props.age)}.`);
</script>

<template>
  <div v-if="error" class="note note-warn" role="status">{{ error }} Showing the last data we had.</div>
  <p v-if="stale" class="note note-warn" data-test="stale">{{ staleText }}</p>
  <p v-if="partial" class="note" data-test="partial">
    Some details were left out to stay within the data limits. Reload in a minute for the full picture.
  </p>
</template>
