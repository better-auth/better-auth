<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import { type PaginationEllipsisProps } from "radix-vue";

const props = defineProps<
	PaginationEllipsisProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;

	return delegated;
});
</script>

<template>
  <PaginationEllipsis v-bind="delegatedProps" :class="cn('w-9 h-9 flex items-center justify-center', props.class)">
    <slot>
      <DotsHorizontalIcon />
    </slot>
  </PaginationEllipsis>
</template>
