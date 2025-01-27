<script lang="ts">
import type { HTMLLiAttributes } from "svelte/elements";

type $$Props = HTMLLiAttributes & {
	el?: HTMLLIElement;
};

export let el: $$Props["el"] = undefined;
let className: $$Props["class"] = undefined;
export { className as class };
</script>

<li bind:this={el} class={cn("inline-flex items-center gap-1.5", className)}>
	<slot />
</li>
