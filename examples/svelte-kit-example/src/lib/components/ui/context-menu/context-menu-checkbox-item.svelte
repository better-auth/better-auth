<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import Check from "svelte-radix/Check.svelte";
	import { cn } from "$lib/utils.js";

	type $$Props = ContextMenuPrimitive.CheckboxItemProps;
	type $$Events = ContextMenuPrimitive.CheckboxItemEvents;

	let className: $$Props["class"] = undefined;
	export { className as class };
	export let checked: $$Props["checked"] = undefined;
</script>

<ContextMenuPrimitive.CheckboxItem
	bind:checked
	class={cn(
		"data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
		className
	)}
	{...$$restProps}
	on:click
	on:keydown
	on:focusin
	on:focusout
	on:pointerdown
	on:pointerleave
	on:pointermove
>
	<span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
		<ContextMenuPrimitive.CheckboxIndicator>
			<Check class="h-4 w-4" />
		</ContextMenuPrimitive.CheckboxIndicator>
	</span>
	<slot />
</ContextMenuPrimitive.CheckboxItem>
