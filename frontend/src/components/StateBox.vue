<script setup lang="ts">
defineProps<{ kind: "loading" | "error" | "empty"; message?: string }>();
</script>

<template>
  <div v-if="kind === 'loading'" class="state" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    {{ message ?? "Loading..." }}
  </div>
  <div v-else-if="kind === 'error'" class="state state-error" role="alert">{{ message }}</div>
  <div v-else class="state">{{ message }}</div>
</template>
