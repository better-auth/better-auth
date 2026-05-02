import * as React from "react";
import { cn } from "./utils";

export interface CheckboxProps
	extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
	({ className, ...props }, ref) => (
		<input
			type="checkbox"
			ref={ref}
			className={cn(
				"peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 accent-primary",
				className,
			)}
			{...props}
		/>
	),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
