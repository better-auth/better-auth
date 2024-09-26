export { default as Calendar } from './Calendar.vue'
import type { CalendarSlotName } from 'v-calendar/dist/types/src/components/Calendar/CalendarSlot.vue.d.ts'

export function isVCalendarSlot(slotName: string): slotName is CalendarSlotName {
  const validSlots: CalendarSlotName[] = [
    'day-content',
    'day-popover',
    'dp-footer',
    'footer',
    'header-title-wrapper',
    'header-title',
    'header-prev-button',
    'header-next-button',
    'nav',
    'nav-prev-button',
    'nav-next-button',
    'page',
    'time-header',
  ]

  return validSlots.includes(slotName as CalendarSlotName)
}
