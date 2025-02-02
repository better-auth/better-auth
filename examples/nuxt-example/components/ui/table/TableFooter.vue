<script setup lang="ts">
import type { HTMLAttributes } from "vue";

const props = defineProps<{
	class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <tfoot :class="cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', props.class)">
    <slot />
  </tfoot>
</template>
