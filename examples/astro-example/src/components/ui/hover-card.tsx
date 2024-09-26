import { cn } from "@/libs/cn";
import type { HoverCardContentProps } from "@kobalte/core/hover-card";
import { HoverCard as HoverCardPrimitive } from "@kobalte/core/hover-card";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

export const HoverCard = HoverCardPrimitive;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

type hoverCardContentProps<T extends ValidComponent = "div"> =
	HoverCardContentProps<T> & {
		class?: string;
	};

export const HoverCardContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, hoverCardContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as hoverCardContentProps, ["class"]);

	return (
		<HoverCardPrimitive.Portal>
			<HoverCardPrimitive.Content
				class={cn(
					"z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
					local.class,
				)}
				{...rest}
			/>
		</HoverCardPrimitive.Portal>
	);
};
