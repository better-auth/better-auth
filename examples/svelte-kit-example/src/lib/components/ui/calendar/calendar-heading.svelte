<script lang="ts">
import { cn } from "$lib/utils";
import { Calendar as CalendarPrimitive } from "bits-ui";

type $$Props = CalendarPrimitive.HeadingProps & {
	class?: string | null | undefined;
};

let className: string | undefined | null = undefined;
export { className as class };
</script>

<CalendarPrimitive.Heading
	let:headingValue
	class={cn("text-sm font-medium", className)}
	{...$$restProps}
>
	<slot {headingValue}>
		{headingValue}
	</slot>
</CalendarPrimitive.Heading>
