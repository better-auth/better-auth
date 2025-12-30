"use client";

import type { SharedProps } from "fumadocs-ui/components/dialog/search";
import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
	interface Window {
		Inkeep?: {
			SearchBar: (selector: string, config: any) => void;
		};
	}
}

export function CustomSearchDialog(props: SharedProps) {
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (!isLoaded || !window.Inkeep) return;
		debugger
		window.Inkeep.SearchBar("#mobile-search-button", {
			baseSettings: {
				apiKey: process.env.NEXT_PUBLIC_INKEEP_API_KEY!,
				organizationDisplayName: "Better Auth",
				primaryBrandColor: "#000000",
			},
			modalSettings: {
				shortcutKey: "k",
			},
			colorMode: {
				enableSystem: true,
				forcedColorMode: "dark",
				sync: {
					target: 'html',
					attributes: ["class"],
					isDarkMode: (attrs: any) => attrs["class"]?.includes("dark"),
				},
			},
		});
	}, [props.open, isLoaded, props.onOpenChange]);

	return (
		<Script
			src="https://cdn.jsdelivr.net/npm/@inkeep/cxkit-js@0.5/dist/embed.js"
			type="module"
			strategy="afterInteractive"
			onLoad={() => setIsLoaded(true)}
			async
		/>
	);
}
