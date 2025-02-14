<script lang="ts">
import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";

type $$Props = RangeCalendarPrimitive.HeadingProps;

let className: string | undefined | null = undefined;
export { className as class };
</script>

<RangeCalendarPrimitive.Heading
	let:headingValue
	class={cn("text-sm font-medium", className)}
	{...$$restProps}
>
	<slot {headingValue}>
		{headingValue}
	</slot>
</RangeCalendarPrimitive.Heading>
