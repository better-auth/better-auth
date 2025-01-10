<script setup lang="ts">
import { type ToastProviderProps } from "radix-vue";

const props = defineProps<ToastProviderProps>();
</script>

<template>
  <ToastProvider v-bind="props">
    <slot />
  </ToastProvider>
</template>
