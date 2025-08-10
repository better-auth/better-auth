<script lang="ts">
import { cn } from "$lib/utils";
import { Calendar as CalendarPrimitive } from "bits-ui";

type $$Props = CalendarPrimitive.GridRowProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<CalendarPrimitive.GridRow class={cn("flex", className)} {...$$restProps}>
	<slot />
</CalendarPrimitive.GridRow>
