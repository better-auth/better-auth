<script lang="ts">
	import { AspectRatio as AspectRatioPrimitive } from "bits-ui";

	type $$Props = AspectRatioPrimitive.Props;

	export let ratio: $$Props["ratio"] = 4 / 3;
</script>

<AspectRatioPrimitive.Root {ratio} {...$$restProps}>
	<slot />
</AspectRatioPrimitive.Root>
