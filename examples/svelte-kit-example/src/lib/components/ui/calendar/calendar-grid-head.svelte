<script lang="ts">
import { cn } from "$lib/utils";
import { Calendar as CalendarPrimitive } from "bits-ui";

type $$Props = CalendarPrimitive.GridHeadProps & {
	class?: string | null | undefined;
};

let className: string | undefined | null = undefined;
export { className as class };
</script>

<CalendarPrimitive.GridHead class={cn(className)} {...$$restProps}>
	<slot />
</CalendarPrimitive.GridHead>
