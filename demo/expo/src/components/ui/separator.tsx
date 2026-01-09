import * as SeparatorPrimitive from "@rn-primitives/separator";
import * as React from "react";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
	SeparatorPrimitive.RootRef,
	SeparatorPrimitive.RootProps
>(
	(
		{ className, orientation = "horizontal", decorative = true, ...props },
		ref,
	) => (
		<SeparatorPrimitive.Root
			ref={ref}
			decorative={decorative}
			orientation={orientation}
			className={cn(
				"shrink-0 bg-border",
				orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
				className,
			)}
			{...props}
		/>
	),
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
