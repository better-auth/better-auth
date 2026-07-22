"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Forces the embedded tweet to follow the site's theme (next-themes) instead of
 * the OS `prefers-color-scheme`. react-tweet reads the `data-theme` attribute
 * from an ancestor element. We only set it after mount to avoid a hydration
 * mismatch, falling back to the system preference on the server render.
 */
export function TweetThemeWrapper({ children }: { children: React.ReactNode }) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div
			data-theme={
				mounted ? (resolvedTheme === "dark" ? "dark" : "light") : undefined
			}
			className="not-prose flex justify-center my-6 [&_.react-tweet-theme]:my-0"
		>
			{children}
		</div>
	);
}
