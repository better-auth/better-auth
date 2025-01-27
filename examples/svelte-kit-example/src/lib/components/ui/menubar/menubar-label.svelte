<script lang="ts">
import { Menubar as MenubarPrimitive } from "bits-ui";

type $$Props = MenubarPrimitive.LabelProps & {
	inset?: boolean;
};
let className: $$Props["class"] = undefined;
export let inset: $$Props["inset"] = undefined;
export { className as class };
</script>

<MenubarPrimitive.Label
	class={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
	{...$$restProps}
>
	<slot />
</MenubarPrimitive.Label>
