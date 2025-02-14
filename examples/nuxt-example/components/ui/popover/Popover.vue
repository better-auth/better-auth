<script setup lang="ts">
import { useForwardPropsEmits } from "radix-vue";
import type { PopoverRootEmits, PopoverRootProps } from "radix-vue";

const props = defineProps<PopoverRootProps>();
const emits = defineEmits<PopoverRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <PopoverRoot v-bind="forwarded">
    <slot />
  </PopoverRoot>
</template>
