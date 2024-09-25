<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type $$Props = MenubarPrimitive.SeparatorProps;
	let className: $$Props["class"] = undefined;
	export { className as class };
</script>

<MenubarPrimitive.Separator class={cn("bg-muted -mx-1 my-1 h-px", className)} {...$$restProps} />
