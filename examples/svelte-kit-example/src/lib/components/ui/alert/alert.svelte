<script lang="ts">
import type { HTMLAttributes } from "svelte/elements";
import { alertVariants, type Variant } from ".";
import { cn } from "$lib/utils";

type $$Props = HTMLAttributes<HTMLDivElement> & {
	variant?: Variant;
};

let className: $$Props["class"] = undefined;
export let variant: $$Props["variant"] = "default";
export { className as class };
</script>

<div class={cn(alertVariants({ variant }), className)} {...$$restProps} role="alert">
	<slot />
</div>
