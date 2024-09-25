<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	type $$Props = ContextMenuPrimitive.RadioGroupProps;

	export let value: $$Props["value"] = undefined;
</script>

<ContextMenuPrimitive.RadioGroup {...$$restProps} bind:value>
	<slot />
</ContextMenuPrimitive.RadioGroup>
