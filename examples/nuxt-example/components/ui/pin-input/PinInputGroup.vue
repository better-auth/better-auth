<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type PrimitiveProps, useForwardProps } from "radix-vue";

const props = defineProps<
	PrimitiveProps & { class?: HTMLAttributes["class"] }
>();
const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;
	return delegated;
});
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <Primitive v-bind="forwardedProps" :class="cn('flex items-center', props.class)">
    <slot />
  </primitive>
</template>
