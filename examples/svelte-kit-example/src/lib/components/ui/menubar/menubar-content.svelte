<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn, flyAndScale } from "$lib/utils.js";

	type $$Props = MenubarPrimitive.ContentProps;
	let className: $$Props["class"] = undefined;
	export let align: $$Props["align"] = "start";
	export let alignOffset: $$Props["alignOffset"] = -4;
	export let sideOffset: $$Props["sideOffset"] = 8;
	export let transition: $$Props["transition"] = flyAndScale;
	export let transitionConfig: $$Props["transitionConfig"] = undefined;
	export { className as class };
</script>

<MenubarPrimitive.Content
	{transition}
	{transitionConfig}
	{sideOffset}
	{align}
	{alignOffset}
	class={cn(
		"bg-popover text-popover-foreground z-50 min-w-[12rem] rounded-md border p-1 shadow-md focus:outline-none",
		className
	)}
	{...$$restProps}
>
	<slot />
</MenubarPrimitive.Content>
