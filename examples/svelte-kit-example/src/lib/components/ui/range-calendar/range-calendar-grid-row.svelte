<script lang="ts">
import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";

type $$Props = RangeCalendarPrimitive.GridRowProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<RangeCalendarPrimitive.GridRow class={cn("flex", className)} {...$$restProps}>
	<slot />
</RangeCalendarPrimitive.GridRow>
