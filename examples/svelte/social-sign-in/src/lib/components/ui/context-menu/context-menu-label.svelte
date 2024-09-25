<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type $$Props = ContextMenuPrimitive.LabelProps & {
		inset?: boolean;
	};

	let className: $$Props["class"] = undefined;
	export let inset: $$Props["inset"] = undefined;
	export { className as class };
</script>

<ContextMenuPrimitive.Label
	class={cn("text-foreground px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
	{...$$restProps}
>
	<slot />
</ContextMenuPrimitive.Label>
