<script setup lang="ts">
import { ref } from "vue";

// A crest always sits beside the team's written name, so it is decoration: empty alt, hidden from screen readers.
defineProps<{ src: string | null | undefined; name: string; size?: number }>();
const broken = ref(false);
</script>

<template>
  <img
    v-if="src && !broken"
    class="crest"
    :src="src"
    alt=""
    :width="size ?? 28"
    :height="size ?? 28"
    loading="lazy"
    @error="broken = true"
  />
  <span
    v-else
    class="crest crest-fallback"
    aria-hidden="true"
    :style="{ width: (size ?? 28) + 'px', height: (size ?? 28) + 'px' }"
    >{{ name.charAt(0) }}</span
  >
</template>
