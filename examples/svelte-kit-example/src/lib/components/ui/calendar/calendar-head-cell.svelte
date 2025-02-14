<script lang="ts">
import { Calendar as CalendarPrimitive } from "bits-ui";

type $$Props = CalendarPrimitive.HeadCellProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<CalendarPrimitive.HeadCell
	class={cn("text-muted-foreground w-8 rounded-md text-[0.8rem] font-normal", className)}
	{...$$restProps}
>
	<slot />
</CalendarPrimitive.HeadCell>
