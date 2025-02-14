<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type AlertDialogDescriptionProps } from "radix-vue";

const props = defineProps<
	AlertDialogDescriptionProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <AlertDialogDescription
    v-bind="delegatedProps"
    :class="cn('text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </AlertDialogDescription>
</template>
