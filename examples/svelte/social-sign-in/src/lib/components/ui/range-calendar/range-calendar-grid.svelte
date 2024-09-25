<script lang="ts">
	import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type $$Props = RangeCalendarPrimitive.GridProps;

	let className: $$Props["class"] = undefined;
	export { className as class };
</script>

<RangeCalendarPrimitive.Grid
	class={cn("w-full border-collapse space-y-1", className)}
	{...$$restProps}
>
	<slot />
</RangeCalendarPrimitive.Grid>
