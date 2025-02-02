<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type AlertDialogCancelProps } from "radix-vue";

const props = defineProps<
	AlertDialogCancelProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <AlertDialogCancel v-bind="delegatedProps" :class="cn(buttonVariants({ variant: 'outline' }), 'mt-2 sm:mt-0', props.class)">
    <slot />
  </AlertDialogCancel>
</template>
