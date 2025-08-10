<script lang="ts">
import { cn } from "$lib/utils";
import ChevronRight from "svelte-radix/ChevronRight.svelte";
import type { HTMLLiAttributes } from "svelte/elements";

type $$Props = HTMLLiAttributes & {
	el?: HTMLLIElement;
};

export let el: $$Props["el"] = undefined;
let className: $$Props["class"] = undefined;
export { className as class };
</script>

<li
	role="presentation"
	aria-hidden="true"
	class={cn("[&>svg]:size-3.5", className)}
	bind:this={el}
	{...$$restProps}
>
	<slot>
		<ChevronRight />
	</slot>
</li>
