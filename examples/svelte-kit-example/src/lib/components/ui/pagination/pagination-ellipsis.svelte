<script lang="ts">
import { cn } from "$lib/utils.js";
import DotsHorizontal from "svelte-radix/DotsHorizontal.svelte";
import type { HTMLAttributes } from "svelte/elements";

type $$Props = HTMLAttributes<HTMLSpanElement>;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<span
	role="presentation"
	aria-hidden="true"
	class={cn("flex h-9 w-9 items-center justify-center", className)}
	{...$$restProps}
>
	<DotsHorizontal class="h-4 w-4" />
	<span class="sr-only">More pages</span>
</span>
