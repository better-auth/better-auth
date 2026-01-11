import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type React from "react";
import { cn } from "@/lib/utils";

const VALID_TIERS = ["free", "plus", "pro"] as const;
type Tier = (typeof VALID_TIERS)[number];

const isValidTier = (tier: string | undefined): tier is Tier => {
	return VALID_TIERS.includes(tier as Tier);
};

const tierVariants = cva(
	"inline-flex items-center px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-all duration-300 ease-in-out",
	{
		variants: {
			variant: {
				free: "dark:bg-zinc-950 bg-zinc-50 dark:text-white dark:ring-gray-700 hover:bg-gray-600",
				plus: "bg-lime-700/40 text-white ring-lime-200/40 hover:bg-lime-600",
				pro: "bg-purple-800/80 ring-purple-400 hover:bg-purple-700",
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
	tier?: string;
}

export const SubscriptionTierLabel: React.FC<SubscriptionTierLabelProps> = ({
	tier,
	className,
	...props
}) => {
	const validTier = isValidTier(tier) ? tier : "free";

	return (
		<span
			className={cn(tierVariants({ variant: validTier }), className)}
			{...props}
		>
			{validTier.charAt(0).toUpperCase() + validTier.slice(1)}
		</span>
	);
};
