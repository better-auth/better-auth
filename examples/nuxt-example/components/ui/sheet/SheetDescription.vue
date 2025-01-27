<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type DialogDescriptionProps } from "radix-vue";

const props = defineProps<
	DialogDescriptionProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <DialogDescription
    :class="cn('text-sm text-muted-foreground', props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </DialogDescription>
</template>
