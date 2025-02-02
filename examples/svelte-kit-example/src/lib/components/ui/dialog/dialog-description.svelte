<script lang="ts">
import { Dialog as DialogPrimitive } from "bits-ui";

type $$Props = DialogPrimitive.DescriptionProps;

let className: $$Props["class"] = undefined;
export { className as class };
</script>

<DialogPrimitive.Description
	class={cn("text-muted-foreground text-sm", className)}
	{...$$restProps}
>
	<slot />
</DialogPrimitive.Description>
