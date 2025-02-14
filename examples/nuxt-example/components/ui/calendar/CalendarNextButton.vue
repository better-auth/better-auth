<script lang="ts" setup>
import { type HTMLAttributes, computed } from "vue";
import { type CalendarNextProps, useForwardProps } from "radix-vue";

const props = defineProps<
	CalendarNextProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarNext
    :class="cn(
      buttonVariants({ variant: 'outline' }),
      'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
      props.class,
    )"
    v-bind="forwardedProps"
  >
    <slot>
      <ChevronRightIcon class="h-4 w-4" />
    </slot>
  </CalendarNext>
</template>
