<script lang="ts">
import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

type $$Props = AlertDialogPrimitive.DescriptionProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<AlertDialogPrimitive.Description
	class={cn("text-muted-foreground text-sm", className)}
	{...$$restProps}
>
	<slot />
</AlertDialogPrimitive.Description>
