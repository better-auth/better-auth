<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import type { HeadingLevel } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = HTMLAttributes<HTMLHeadingElement> & {
		tag?: HeadingLevel;
	};

	let className: $$Props["class"] = undefined;
	export let tag: $$Props["tag"] = "h3";
	export { className as class };
</script>

<svelte:element
	this={tag}
	class={cn("font-semibold leading-none tracking-tight", className)}
	{...$$restProps}
>
	<slot />
</svelte:element>
