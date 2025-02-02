<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type DialogTitleProps } from "radix-vue";

const props = defineProps<
	DialogTitleProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <DialogTitle
    :class="cn('text-lg font-semibold text-foreground', props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </DialogTitle>
</template>
