<script setup lang="ts">
import { useForwardPropsEmits } from "radix-vue";
import type { TabsRootEmits, TabsRootProps } from "radix-vue";

const props = defineProps<TabsRootProps>();
const emits = defineEmits<TabsRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <TabsRoot v-bind="forwarded">
    <slot />
  </TabsRoot>
</template>
