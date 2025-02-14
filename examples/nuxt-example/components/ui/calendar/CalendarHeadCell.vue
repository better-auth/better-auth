<script lang="ts" setup>
import { type HTMLAttributes, computed } from "vue";
import { type CalendarHeadCellProps, useForwardProps } from "radix-vue";

const props = defineProps<
	CalendarHeadCellProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarHeadCell :class="cn('w-8 rounded-md text-[0.8rem] font-normal text-muted-foreground', props.class)" v-bind="forwardedProps">
    <slot />
  </CalendarHeadCell>
</template>
