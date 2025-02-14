<script setup lang="ts">
defineProps<{
	required?: boolean;
}>();
</script>

<template>
  <FormLabel>
    <slot />
    <span v-if="required" class="text-destructive"> *</span>
  </FormLabel>
</template>
