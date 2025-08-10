<script lang="ts">
import { Command as CommandPrimitive } from "cmdk-sv";
import { cn } from "$lib/utils";

type $$Props = CommandPrimitive.SeparatorProps & {
	class?: string | null | undefined;
};
let className: string | undefined | null = undefined;
export { className as class };
</script>

<CommandPrimitive.Separator class={cn("bg-border -mx-1 h-px", className)} {...$$restProps} />
    