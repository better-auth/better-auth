<script lang="ts">
import { cn } from "$lib/utils";
import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

type $$Props = AlertDialogPrimitive.TitleProps;

let className: $$Props["class"] = undefined;
export let level: $$Props["level"] = "h3";
export { className as class };
</script>

<AlertDialogPrimitive.Title class={cn("text-lg font-semibold", className)} {level} {...$$restProps}>
	<slot />
</AlertDialogPrimitive.Title>
