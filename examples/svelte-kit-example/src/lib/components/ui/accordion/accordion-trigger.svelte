<script lang="ts">
	import { Accordion as AccordionPrimitive } from "bits-ui";
	import ChevronDown from "svelte-radix/ChevronDown.svelte";
	import { cn } from "$lib/utils.js";

	type $$Props = AccordionPrimitive.TriggerProps;
	type $$Events = AccordionPrimitive.TriggerEvents;

	let className: $$Props["class"] = undefined;
	export let level: AccordionPrimitive.HeaderProps["level"] = 3;
	export { className as class };
</script>

<AccordionPrimitive.Header {level} class="flex">
	<AccordionPrimitive.Trigger
		class={cn(
			"flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
			className
		)}
		{...$$restProps}
		on:click
	>
		<slot />
		<ChevronDown
			class="text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200"
		/>
	</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>
