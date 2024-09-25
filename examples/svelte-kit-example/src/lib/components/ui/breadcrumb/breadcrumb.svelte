<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	type $$Props = HTMLAttributes<HTMLElement> & {
		el?: HTMLElement;
	};

	export let el: $$Props["el"] = undefined;
	let className: $$Props["class"] = undefined;
	export { className as class };
</script>

<nav class={className} bind:this={el} aria-label="breadcrumb" {...$$restProps}>
	<slot />
</nav>
