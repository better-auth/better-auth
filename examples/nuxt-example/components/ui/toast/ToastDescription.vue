<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type ToastDescriptionProps } from "radix-vue";

const props = defineProps<
	ToastDescriptionProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <ToastDescription :class="cn('text-sm opacity-90', props.class)" v-bind="delegatedProps">
    <slot />
  </ToastDescription>
</template>
