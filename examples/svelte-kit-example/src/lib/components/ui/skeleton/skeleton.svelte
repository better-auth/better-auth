<script lang="ts">
import { cn } from "$lib/utils";
import type { HTMLAttributes } from "svelte/elements";

type $$Props = HTMLAttributes<HTMLDivElement>;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<div class={cn("bg-primary/10 animate-pulse rounded-md", className)} {...$$restProps}></div>
