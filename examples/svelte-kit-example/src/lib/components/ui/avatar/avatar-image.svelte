<script lang="ts">
import { Avatar as AvatarPrimitive } from "bits-ui";

type $$Props = AvatarPrimitive.ImageProps;

let className: $$Props["class"] = undefined;
export let src: $$Props["src"] = undefined;
export let alt: $$Props["alt"] = undefined;
export { className as class };
</script>

<AvatarPrimitive.Image
	{src}
	{alt}
	class={cn("aspect-square h-full w-full", className)}
	{...$$restProps}
/>
