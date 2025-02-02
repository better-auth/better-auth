<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type ContextMenuLabelProps } from "radix-vue";

const props = defineProps<
	ContextMenuLabelProps & { class?: HTMLAttributes["class"]; inset?: boolean }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <ContextMenuLabel
    v-bind="delegatedProps"
    :class="
      cn('px-2 py-1.5 text-sm font-semibold text-foreground',
         inset && 'pl-8', props.class,
      )"
  >
    <slot />
  </ContextMenuLabel>
</template>
