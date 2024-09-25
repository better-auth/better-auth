<script lang="ts">
	import ArrowRight from "svelte-radix/ArrowRight.svelte";
	import type { VariantProps } from "tailwind-variants";
	import { getEmblaContext } from "./context.js";
	import { cn } from "$lib/utils.js";
	import {
		Button,
		type Props,
		type buttonVariants,
	} from "$lib/components/ui/button/index.js";

	type $$Props = Props;

	let className: $$Props["class"] = undefined;
	export { className as class };
	export let variant: VariantProps<typeof buttonVariants>["variant"] = "outline";
	export let size: VariantProps<typeof buttonVariants>["size"] = "icon";

	const { orientation, canScrollNext, scrollNext, handleKeyDown } =
		getEmblaContext("<Carousel.Next/>");
</script>

<Button
	{variant}
	{size}
	class={cn(
		"absolute h-8 w-8 touch-manipulation rounded-full",
		$orientation === "horizontal"
			? "-right-12 top-1/2 -translate-y-1/2"
			: "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
		className
	)}
	disabled={!$canScrollNext}
	on:click={scrollNext}
	on:keydown={handleKeyDown}
	{...$$restProps}
>
	<ArrowRight class="h-4 w-4" />
	<span class="sr-only">Next slide</span>
</Button>
