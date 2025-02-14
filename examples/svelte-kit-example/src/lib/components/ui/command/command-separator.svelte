<script lang="ts">
import { Command as CommandPrimitive } from "cmdk-sv";

type $$Props = CommandPrimitive.SeparatorProps;
let className: string | undefined | null = undefined;
export { className as class };
</script>

<CommandPrimitive.Separator class={cn("bg-border -mx-1 h-px", className)} {...$$restProps} />
