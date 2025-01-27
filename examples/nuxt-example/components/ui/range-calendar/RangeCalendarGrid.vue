<script lang="ts" setup>
import { type HTMLAttributes, computed } from "vue";
import { type RangeCalendarGridProps, useForwardProps } from "radix-vue";

const props = defineProps<
	RangeCalendarGridProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <RangeCalendarGrid
    :class="cn('w-full border-collapse space-y-1', props.class)"
    v-bind="forwardedProps"
  >
    <slot />
  </RangeCalendarGrid>
</template>
