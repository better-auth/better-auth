<script lang="ts" setup>
import { type HTMLAttributes, computed } from "vue";
import { type RangeCalendarGridRowProps, useForwardProps } from "radix-vue";

const props = defineProps<
	RangeCalendarGridRowProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <RangeCalendarGridRow :class="cn('flex', props.class)" v-bind="forwardedProps">
    <slot />
  </RangeCalendarGridRow>
</template>
