import { cn } from "@/libs/cn";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { SeparatorRootProps } from "@kobalte/core/separator";
import { Separator as SeparatorPrimitive } from "@kobalte/core/separator";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

type separatorProps<T extends ValidComponent = "hr"> = SeparatorRootProps<T> & {
	class?: string;
};

export const Separator = <T extends ValidComponent = "hr">(
	props: PolymorphicProps<T, separatorProps<T>>,
) => {
	const [local, rest] = splitProps(props as separatorProps, ["class"]);

	return (
		<SeparatorPrimitive
			class={cn(
				"shrink-0 bg-border data-[orientation=horizontal]:h-[1px] data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-[1px]",
				local.class,
			)}
			{...rest}
		/>
	);
};
