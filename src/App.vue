<script setup lang="ts">
import NavBar from "./components/NavBar.vue";
</script>

<template>
  <!-- The pressed edge of the clay boxes (base.css .clay::before): a low-frequency wobble, on the box body only. -->
  <svg width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false">
    <filter id="press" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
  <NavBar />
  <main class="page">
    <router-view />
  </main>
</template>
