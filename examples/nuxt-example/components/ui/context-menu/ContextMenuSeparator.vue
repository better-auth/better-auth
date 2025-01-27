<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type ContextMenuSeparatorProps } from "radix-vue";

const props = defineProps<
	ContextMenuSeparatorProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <ContextMenuSeparator v-bind="delegatedProps" :class="cn('-mx-1 my-1 h-px bg-border', props.class)" />
</template>
