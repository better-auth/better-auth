<script lang="ts">
	import { LinkPreview as HoverCardPrimitive } from "bits-ui";
	import { cn, flyAndScale } from "$lib/utils.js";

	type $$Props = HoverCardPrimitive.ContentProps;

	let className: $$Props["class"] = undefined;
	export let align: $$Props["align"] = "center";
	export let sideOffset: $$Props["sideOffset"] = 4;
	export let transition: $$Props["transition"] = flyAndScale;
	export let transitionConfig: $$Props["transitionConfig"] = undefined;
	export { className as class };
</script>

<HoverCardPrimitive.Content
	{transition}
	{transitionConfig}
	{sideOffset}
	{align}
	class={cn(
		"bg-popover text-popover-foreground z-50 w-64 rounded-md border p-4 shadow-md outline-none",
		className
	)}
	{...$$restProps}
>
	<slot />
</HoverCardPrimitive.Content>
