<script setup lang="ts">
import { computed } from 'vue'
import { ToastRoot, type ToastRootEmits, useForwardPropsEmits } from 'radix-vue'
import { type ToastProps, toastVariants } from '.'
import { cn } from '@/lib/utils'

const props = defineProps<ToastProps>()

const emits = defineEmits<ToastRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ToastRoot
    v-bind="forwarded"
    :class="cn(toastVariants({ variant }), props.class)"
    @update:open="onOpenChange"
  >
    <slot />
  </ToastRoot>
</template>
