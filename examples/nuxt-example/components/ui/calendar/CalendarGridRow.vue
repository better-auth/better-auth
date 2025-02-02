<script lang="ts" setup>
import { type HTMLAttributes, computed } from "vue";
import { type CalendarGridRowProps, useForwardProps } from "radix-vue";

const props = defineProps<
	CalendarGridRowProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarGridRow :class="cn('flex', props.class)" v-bind="forwardedProps">
    <slot />
  </CalendarGridRow>
</template>
