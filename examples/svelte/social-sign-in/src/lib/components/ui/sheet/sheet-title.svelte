<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type $$Props = SheetPrimitive.TitleProps;

	let className: $$Props["class"] = undefined;
	export { className as class };
</script>

<SheetPrimitive.Title
	class={cn("text-foreground text-lg font-semibold", className)}
	{...$$restProps}
>
	<slot />
</SheetPrimitive.Title>
