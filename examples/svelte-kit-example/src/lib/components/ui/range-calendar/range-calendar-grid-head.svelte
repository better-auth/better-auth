<script lang="ts">
import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";

type $$Props = RangeCalendarPrimitive.GridHeadProps;

let className: string | undefined | null = undefined;
export { className as class };
</script>

<RangeCalendarPrimitive.GridHead class={cn(className)} {...$$restProps}>
	<slot />
</RangeCalendarPrimitive.GridHead>
