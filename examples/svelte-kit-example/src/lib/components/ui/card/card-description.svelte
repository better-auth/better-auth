<script lang="ts">
import { cn } from "$lib/utils.js";
import type { HTMLAttributes } from "svelte/elements";

type $$Props = HTMLAttributes<HTMLParagraphElement>;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<p class={cn("text-muted-foreground text-sm", className)} {...$$restProps}>
	<slot />
</p>
