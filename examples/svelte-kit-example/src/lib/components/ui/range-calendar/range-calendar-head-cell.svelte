<script lang="ts">
import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";

type $$Props = RangeCalendarPrimitive.HeadCellProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<RangeCalendarPrimitive.HeadCell
	class={cn("text-muted-foreground w-8 rounded-md text-[0.8rem] font-normal", className)}
	{...$$restProps}
>
	<slot />
</RangeCalendarPrimitive.HeadCell>
