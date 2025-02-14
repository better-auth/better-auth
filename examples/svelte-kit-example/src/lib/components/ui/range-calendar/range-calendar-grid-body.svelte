<script lang="ts">
import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";

type $$Props = RangeCalendarPrimitive.GridBodyProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<RangeCalendarPrimitive.GridBody class={cn(className)} {...$$restProps}>
	<slot />
</RangeCalendarPrimitive.GridBody>
