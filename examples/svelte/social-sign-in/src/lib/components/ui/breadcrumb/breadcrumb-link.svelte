<script lang="ts">
	import type { HTMLAnchorAttributes } from "svelte/elements";
	import { cn } from "$lib/utils.js";

	type $$Props = HTMLAnchorAttributes & {
		el?: HTMLAnchorElement;
		asChild?: boolean;
	};

	export let href: $$Props["href"] = undefined;
	export let el: $$Props["el"] = undefined;
	export let asChild: $$Props["asChild"] = false;
	let className: $$Props["class"] = undefined;
	export { className as class };

	let attrs: Record<string, unknown>;

	$: attrs = {
		class: cn("hover:text-foreground transition-colors", className),
		href,
		...$$restProps,
	};
</script>

{#if asChild}
	<slot {attrs} />
{:else}
	<a bind:this={el} {...attrs} {href}>
		<slot {attrs} />
	</a>
{/if}
