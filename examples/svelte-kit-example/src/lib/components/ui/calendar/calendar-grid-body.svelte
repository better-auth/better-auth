<script lang="ts">
import { cn } from "$lib/utils";
import { Calendar as CalendarPrimitive } from "bits-ui";

type $$Props = CalendarPrimitive.GridBodyProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<CalendarPrimitive.GridBody class={cn(className)} {...$$restProps}>
	<slot />
</CalendarPrimitive.GridBody>
