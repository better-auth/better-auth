<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type AccordionItemProps, useForwardProps } from "radix-vue";

const props = defineProps<
	AccordionItemProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <AccordionItem
    v-bind="forwardedProps"
    :class="cn('border-b', props.class)"
  >
    <slot />
  </AccordionItem>
</template>
