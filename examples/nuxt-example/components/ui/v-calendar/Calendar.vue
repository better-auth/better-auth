<script setup lang="ts">
import { useVModel } from '@vueuse/core'
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-icons/vue'
import type { Calendar } from 'v-calendar'
import { DatePicker } from 'v-calendar'
import { computed, nextTick, onMounted, ref, useSlots } from 'vue'
import { isVCalendarSlot } from '.'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

/* Extracted from v-calendar */
type DatePickerModel = DatePickerDate | DatePickerRangeObject
type DateSource = Date | string | number
type DatePickerDate = DateSource | Partial<SimpleDateParts> | null
interface DatePickerRangeObject {
  start: Exclude<DatePickerDate, null>
  end: Exclude<DatePickerDate, null>
}
interface SimpleDateParts {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
  milliseconds: number
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  modelValue?: string | number | Date | DatePickerModel
  modelModifiers?: object
  columns?: number
  type?: 'single' | 'range'
}>(), {
  type: 'single',
  columns: 1,
})
const emits = defineEmits<{
  (e: 'update:modelValue', payload: typeof props.modelValue): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
})

const datePicker = ref<InstanceType<typeof DatePicker>>()
// @ts-expect-error in this current version of v-calendar has the calendaRef instance, which is required to handle arrow nav.
const calendarRef = computed<InstanceType<typeof Calendar>>(() => datePicker.value.calendarRef)

function handleNav(direction: 'prev' | 'next') {
  if (!calendarRef.value)
    return

  if (direction === 'prev')
    calendarRef.value.movePrev()
  else calendarRef.value.moveNext()
}

onMounted(async () => {
  await nextTick()
  if (modelValue.value instanceof Date && calendarRef.value)
    calendarRef.value.focusDate(modelValue.value)
})

const $slots = useSlots()
const vCalendarSlots = computed(() => {
  return Object.keys($slots)
    .filter(name => isVCalendarSlot(name))
    .reduce((obj: Record<string, any>, key: string) => {
      obj[key] = $slots[key]
      return obj
    }, {})
})
</script>

<template>
  <div class="relative">
    <div v-if="$attrs.mode !== 'time'" class="absolute flex justify-between w-full px-4 top-3 z-[1]">
      <button :class="cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')" @click="handleNav('prev')">
        <ChevronLeftIcon class="w-4 h-4" />
      </button>
      <button :class="cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')" @click="handleNav('next')">
        <ChevronRightIcon class="w-4 h-4" />
      </button>
    </div>

    <DatePicker
      ref="datePicker"
      v-model="modelValue"
      v-bind="$attrs"
      :model-modifiers="modelModifiers"
      class="calendar"
      trim-weeks
      :transition="'none'"
      :columns="columns"
    >
      <template v-for="(_, slot) of vCalendarSlots" #[slot]="scope">
        <slot :name="slot" v-bind="scope" />
      </template>

      <template #nav-prev-button>
        <ChevronLeftIcon />
      </template>

      <template #nav-next-button>
        <ChevronRightIcon />
      </template>
    </DatePicker>
  </div>
</template>

<style lang="css">
.calendar {
  @apply p-3 text-center;
}
.calendar .vc-pane-layout {
  @apply grid gap-4 max-sm:!grid-cols-1;
}
.calendar .vc-title {
  @apply text-sm font-medium relative z-20;
}
.vc-popover-content-wrapper .vc-popover-content {
  @apply mt-3 rounded-md max-w-xs border bg-background;
}
.vc-popover-content-wrapper .vc-nav-header {
  @apply flex justify-between items-center p-2;
}
.vc-popover-content-wrapper .vc-nav-items {
  @apply grid grid-cols-4 gap-2 p-2;
}
.vc-popover-content-wrapper .vc-nav-items .vc-nav-item {
  @apply rounded-md px-2 py-1;
}
.vc-popover-content-wrapper .vc-nav-items .vc-nav-item:hover {
  @apply text-muted-foreground bg-muted;
}
.vc-popover-content-wrapper .vc-nav-items .vc-nav-item.is-active {
  @apply bg-primary text-primary-foreground;
}
.calendar .vc-pane-header-wrapper {
  @apply hidden;
}
.calendar .vc-weeks {
  @apply mt-4;
}
.calendar .vc-weekdays {
  @apply justify-items-center;
}
.calendar .vc-weekday {
  @apply text-muted-foreground rounded-md font-normal text-[0.8rem];
}
.calendar .vc-weeks {
  @apply w-full space-y-2 flex flex-col [&>_div]:grid [&>_div]:grid-cols-7;
}
.calendar .vc-day:has(.vc-highlights) {
  @apply first:rounded-l-md last:rounded-r-md;
}
.calendar .vc-day.is-today:not(:has(.vc-day-layer)) .vc-day-content {
  @apply bg-secondary text-primary rounded-md;
}
.calendar .vc-day:has(.vc-highlight-base-start) {
  @apply rounded-l-md;
}
.calendar .vc-day:has(.vc-highlight-base-end) {
  @apply rounded-r-md;
}
.calendar .vc-day:has(.vc-highlight-bg-outline):not(:has(.vc-highlight-base-start)):not(:has(.vc-highlight-base-end)) {
  @apply rounded-md;
}
.calendar .vc-day-content  {
  @apply text-center text-sm p-0 relative focus-within:relative focus-within:z-20 inline-flex items-center justify-center ring-offset-background hover:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-9 w-9  font-normal aria-selected:opacity-100 select-none;
}
.calendar .vc-day-content:not(.vc-highlight-content-light) {
  @apply rounded-md;
}
.calendar .is-not-in-month:not(:has(.vc-highlight-content-solid)):not(:has(.vc-highlight-content-light)):not(:has(.vc-highlight-content-outline)),
.calendar .vc-disabled {
  @apply text-muted-foreground opacity-50;
}
.calendar .vc-highlight-content-solid, .calendar .vc-highlight-content-outline {
  @apply bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground;
}
.calendar .vc-highlight-content-light {
  @apply bg-accent text-accent-foreground;
}
.calendar .vc-pane-container.in-transition {
  @apply overflow-hidden;
}
.calendar .vc-pane-container {
  @apply w-full relative;
}
:root {
	--vc-slide-translate: 22px;
	--vc-slide-duration: 0.15s;
	--vc-slide-timing: ease;
}
.calendar .vc-fade-enter-active,
.calendar .vc-fade-leave-active,
.calendar .vc-slide-left-enter-active,
.calendar .vc-slide-left-leave-active,
.calendar .vc-slide-right-enter-active,
.calendar .vc-slide-right-leave-active,
.calendar .vc-slide-up-enter-active,
.calendar .vc-slide-up-leave-active,
.calendar .vc-slide-down-enter-active,
.calendar .vc-slide-down-leave-active,
.calendar .vc-slide-fade-enter-active,
.calendar .vc-slide-fade-leave-active {
	transition:
		opacity var(--vc-slide-duration) var(--vc-slide-timing),
		-webkit-transform var(--vc-slide-duration) var(--vc-slide-timing);
	transition:
		transform var(--vc-slide-duration) var(--vc-slide-timing),
		opacity var(--vc-slide-duration) var(--vc-slide-timing);
	transition:
		transform var(--vc-slide-duration) var(--vc-slide-timing),
		opacity var(--vc-slide-duration) var(--vc-slide-timing),
		-webkit-transform var(--vc-slide-duration) var(--vc-slide-timing);
	-webkit-backface-visibility: hidden;
	backface-visibility: hidden;
	pointer-events: none;
}
.calendar .vc-none-leave-active,
.calendar .vc-fade-leave-active,
.calendar .vc-slide-left-leave-active,
.calendar .vc-slide-right-leave-active,
.calendar .vc-slide-up-leave-active,
.calendar .vc-slide-down-leave-active {
	position: absolute !important;
	width: 100%;
}
.calendar .vc-none-enter-from,
.calendar .vc-none-leave-to,
.calendar .vc-fade-enter-from,
.calendar .vc-fade-leave-to,
.calendar .vc-slide-left-enter-from,
.calendar .vc-slide-left-leave-to,
.calendar .vc-slide-right-enter-from,
.calendar .vc-slide-right-leave-to,
.calendar .vc-slide-up-enter-from,
.calendar .vc-slide-up-leave-to,
.calendar .vc-slide-down-enter-from,
.calendar .vc-slide-down-leave-to,
.calendar .vc-slide-fade-enter-from,
.calendar .vc-slide-fade-leave-to {
	opacity: 0;
}
.calendar .vc-slide-left-enter-from,
.calendar .vc-slide-right-leave-to,
.calendar .vc-slide-fade-enter-from.direction-left,
.calendar .vc-slide-fade-leave-to.direction-left {
	-webkit-transform: translateX(var(--vc-slide-translate));
	transform: translateX(var(--vc-slide-translate));
}
.calendar .vc-slide-right-enter-from,
.calendar .vc-slide-left-leave-to,
.calendar .vc-slide-fade-enter-from.direction-right,
.calendar .vc-slide-fade-leave-to.direction-right {
	-webkit-transform: translateX(calc(-1 * var(--vc-slide-translate)));
	transform: translateX(calc(-1 * var(--vc-slide-translate)));
}
.calendar .vc-slide-up-enter-from,
.calendar .vc-slide-down-leave-to,
.calendar .vc-slide-fade-enter-from.direction-top,
.calendar .vc-slide-fade-leave-to.direction-top {
	-webkit-transform: translateY(var(--vc-slide-translate));
	transform: translateY(var(--vc-slide-translate));
}
.calendar .vc-slide-down-enter-from,
.calendar .vc-slide-up-leave-to,
.calendar .vc-slide-fade-enter-from.direction-bottom,
.calendar .vc-slide-fade-leave-to.direction-bottom {
	-webkit-transform: translateY(calc(-1 * var(--vc-slide-translate)));
	transform: translateY(calc(-1 * var(--vc-slide-translate)));
}
/**
 * Timepicker styles
 */
.vc-time-picker {
  @apply flex flex-col items-center p-2;
}
.vc-time-picker.vc-invalid {
  @apply pointer-events-none opacity-50;
}
.vc-time-picker.vc-attached {
  @apply border-t border-solid border-secondary mt-2;
}
.vc-time-picker > * + * {
  @apply mt-1;
}
.vc-time-header {
  @apply flex items-center text-sm font-semibold uppercase mt-1 px-1 leading-6;
}
.vc-time-select-group {
  @apply inline-flex items-center px-1 rounded-md bg-primary-foreground border border-solid border-secondary;
}
.vc-time-select-group .vc-base-icon {
  @apply mr-1 text-primary stroke-primary;
}
.vc-time-select-group select {
  @apply bg-primary-foreground p-1 appearance-none outline-none text-center;
}
.vc-time-weekday {
  @apply text-muted-foreground tracking-wide;
}
.vc-time-month {
  @apply text-primary ml-2;
}
.vc-time-day {
  @apply text-primary ml-1;
}
.vc-time-year {
  @apply text-muted-foreground ml-2;
}
.vc-time-colon {
  @apply mb-0.5;
}
.vc-time-decimal {
  @apply ml-0.5;
}
</style>
