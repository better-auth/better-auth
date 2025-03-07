<script lang="ts">
import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
import { cn, flyAndScale } from "$lib/utils.js";
import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
import AlertDialogPortal from "./alert-dialog-portal.svelte";

type $$Props = AlertDialogPrimitive.ContentProps;

let className: $$Props["class"] = undefined;
export let transition: $$Props["transition"] = flyAndScale;
export let transitionConfig: $$Props["transitionConfig"] = undefined;
export { className as class };
</script>

<AlertDialogPortal>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		{transition}
		{transitionConfig}
		class={cn(
			"bg-background fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg  sm:rounded-lg md:w-full",
			className
		)}
		{...$$restProps}
	>
		<slot />
	</AlertDialogPrimitive.Content>
</AlertDialogPortal>
