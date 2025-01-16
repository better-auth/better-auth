<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type SelectSeparatorProps } from "radix-vue";

const props = defineProps<
	SelectSeparatorProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <SelectSeparator v-bind="delegatedProps" :class="cn('-mx-1 my-1 h-px bg-muted', props.class)" />
</template>
