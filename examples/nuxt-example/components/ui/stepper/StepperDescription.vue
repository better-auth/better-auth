<script lang="ts" setup>
import { type HTMLAttributes, computed } from "vue";
import type { StepperDescriptionProps } from "radix-vue";
import { useForwardProps } from "radix-vue";

const props = defineProps<
	StepperDescriptionProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <StepperDescription v-slot="slotProps" v-bind="forwarded" :class="cn('text-xs text-muted-foreground', props.class)">
    <slot v-bind="slotProps" />
  </StepperDescription>
</template>
