import type { AnchorHTMLAttributes } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SocialProvider } from "@/types";
import { providerIcons } from "./provider-icons";

export interface SocialButtonProps
	extends AnchorHTMLAttributes<HTMLAnchorElement> {
	provider: SocialProvider;
	apiBaseUrl: string;
	iconOnly?: boolean;
	textFormat?: string;
}

export function SocialButton({
	provider,
	apiBaseUrl,
	iconOnly = false,
	textFormat = "{provider}",
	className,
	...props
}: SocialButtonProps) {
	const href = `${apiBaseUrl}/sign-in/social?provider=${encodeURIComponent(provider.id)}`;
	const text = textFormat.replace("{provider}", provider.name);
	const iconSvg = provider.icon || providerIcons[provider.id] || "";

	return (
		<a
			href={href}
			className={cn(
				buttonVariants({ variant: "outline" }),
				iconOnly ? "w-9 px-0" : "w-full",
				"no-underline cursor-pointer",
				className,
			)}
			title={iconOnly ? provider.name : undefined}
			{...props}
		>
			{iconSvg && (
				<span
					className="size-4 shrink-0 [&>svg]:size-full"
					dangerouslySetInnerHTML={{ __html: iconSvg }}
				/>
			)}
			{!iconOnly && <span>{text}</span>}
		</a>
	);
}

export interface SocialButtonsProps {
	providers: SocialProvider[];
	apiBaseUrl: string;
	layout?: "vertical" | "horizontal" | "grid";
	iconOnly?: boolean;
	textFormat?: string;
}

export function SocialButtons({
	providers,
	apiBaseUrl,
	layout = "vertical",
	iconOnly = false,
	textFormat,
}: SocialButtonsProps) {
	if (!providers.length) return null;

	const layoutClasses = {
		vertical: "flex flex-col gap-2",
		horizontal: "flex flex-row flex-wrap gap-2",
		grid: "grid grid-cols-2 gap-2",
	};

	return (
		<div className={layoutClasses[layout]}>
			{providers.map((provider) => (
				<SocialButton
					key={provider.id}
					provider={provider}
					apiBaseUrl={apiBaseUrl}
					iconOnly={iconOnly}
					textFormat={textFormat}
				/>
			))}
		</div>
	);
}
