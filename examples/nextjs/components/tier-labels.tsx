import type React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tierVariants = cva(
	"inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-all duration-300 ease-in-out",
	{
		variants: {
			variant: {
				free: "bg-gray-500 text-white ring-gray-400 hover:bg-gray-600",
				starter: "bg-lime-700/40 text-white ring-lime-200/40 hover:bg-lime-600",
				professional: "bg-purple-800/80 ring-purple-400 hover:bg-purple-700",
				enterprise: "bg-amber-500 text-black ring-amber-400 hover:bg-amber-600",
			},
		},
		defaultVariants: {
			variant: "free",
		},
	},
);

export interface SubscriptionTierLabelProps
	extends React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof tierVariants> {
	tier?: "free" | "starter" | "professional" | "enterprise";
}

export const SubscriptionTierLabel: React.FC<SubscriptionTierLabelProps> = ({
	tier = "free",
	className,
	...props
}) => {
	return (
		<span className={cn(tierVariants({ variant: tier }), className)} {...props}>
			{tier.charAt(0).toUpperCase() + tier.slice(1)}
		</span>
	);
};
