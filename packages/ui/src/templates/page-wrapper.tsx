import type { ReactNode } from "react";

interface PageWrapperProps {
	children: ReactNode;
	isProfilePage?: boolean;
}

/**
 * Page wrapper template that provides the full-page layout.
 * In embed mode, this wrapper is not used - only the child component is rendered.
 */
export function PageWrapper({
	children,
	isProfilePage = false,
}: PageWrapperProps) {
	return (
		<div
			id="ba-page-wrapper"
			className="min-h-screen bg-background flex items-center justify-center p-4"
		>
			<main className={isProfilePage ? "w-full" : ""}>{children}</main>
		</div>
	);
}

/**
 * Embed wrapper - just renders children without the full-page layout
 */
export function EmbedWrapper({ children }: { children: ReactNode }) {
	return <div id="ba-embed-wrapper">{children}</div>;
}
