import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
	"relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
	{
		variants: {
			variant: {
				default: "bg-background text-foreground",
				destructive:
					"border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

const Alert = (
	props?: React.HTMLAttributes<HTMLDivElement> & {
		variant: "default" | "destructive";
	},
) => (
	<div
		role="alert"
		className={cn(alertVariants({ variant: props?.variant }), props?.className)}
		{...props}
	/>
);
Alert.displayName = "Alert";

const AlertTitle = ({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
	<h5
		className={cn("mb-1 font-medium leading-none tracking-tight", className)}
		{...props}
	/>
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = ({
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
	<div className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
