<script lang="ts">
import * as FormPrimitive from "formsnap";

type $$Props = FormPrimitive.DescriptionProps;
let className: $$Props["class"] = undefined;
export { className as class };
</script>

<FormPrimitive.Description
	class={cn("text-muted-foreground text-[0.8rem]", className)}
	{...$$restProps}
	let:descriptionAttrs
>
	<slot {descriptionAttrs} />
</FormPrimitive.Description>
