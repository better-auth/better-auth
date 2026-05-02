import { useEffect, useRef, useState } from "react";
import { formatPageName } from "../auth-iframe";
import type { UIConfig } from "../ui";

export interface AuthProps {
	/**
	 * UI configuration from authClient.ui.signIn() or similar.
	 * Includes $store and atomListeners automatically.
	 */
	ui: UIConfig;
	/**
	 * Called when authentication succeeds
	 */
	onSuccess?: (data: { redirectTo?: string }) => void;
	/**
	 * Called when authentication fails
	 */
	onError?: (error: { code: string; message: string }) => void;
	/**
	 * Called when the component has loaded
	 */
	onLoad?: () => void;
	/**
	 * CSS class name for the container
	 */
	className?: string;
	/**
	 * Inline styles for the container
	 */
	style?: React.CSSProperties;
}

/**
 * Auth component that renders authentication UI directly in the page.
 *
 * @example
 * ```tsx
 * import { createAuthClient } from "better-auth/react";
 * import { Auth } from "better-auth/react";
 *
 * const authClient = createAuthClient();
 *
 * function SignInPage() {
 *   return (
 *     <Auth
 *       ui={authClient.ui.signIn()}
 *       onSuccess={() => router.push("/dashboard")}
 *       onError={(err) => toast.error(err.message)}
 *     />
 *   );
 * }
 * ```
 */
export function Auth({
	ui,
	onSuccess,
	onError,
	onLoad,
	className,
	style,
}: AuthProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		let messageCleanup: (() => void) | undefined;

		async function loadAndHydrate() {
			try {
				const response = await fetch(ui.src);

				if (!response.ok) {
					throw new Error(`Failed to load auth UI: ${response.statusText}`);
				}

				const html = await response.text();

				if (!mounted || !containerRef.current) return;

				const parser = new DOMParser();
				const doc = parser.parseFromString(html, "text/html");

				const bodyContent = doc.body.innerHTML;

				const styleTag = doc.querySelector("style");
				if (styleTag?.textContent) {
					const existingStyle = document.getElementById(
						"better-auth-ui-styles",
					);
					if (!existingStyle) {
						const newStyle = document.createElement("style");
						newStyle.id = "better-auth-ui-styles";
						newStyle.textContent = styleTag.textContent;
						document.head.appendChild(newStyle);
					}
				}

				// Clear React's loading spinner first to avoid DOM conflicts
				setLoading(false);

				// Let React finish its DOM updates before manipulating innerHTML
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);

				if (!mounted || !containerRef.current) return;

				containerRef.current.innerHTML = bodyContent;

				// Prevent form submission as fallback (in case hydration script fails)
				const forms = containerRef.current.querySelectorAll("form");
				forms.forEach((form) => {
					form.addEventListener("submit", (e) => {
						e.preventDefault();
					});
				});

				const handleMessage = (event: MessageEvent) => {
					if (event.origin !== window.location.origin) return;

					const message = event.data;
					if (!message || typeof message !== "object" || !message.type) return;

					switch (message.type) {
						case "better-auth:success":
							onSuccess?.(message.data || {});
							if (ui.$store && ui.atomListeners) {
								ui.$store.notify("$sessionSignal");
							}
							break;
						case "better-auth:error":
							onError?.(
								message.error || {
									code: "UNKNOWN",
									message: "Unknown error",
								},
							);
							break;
						case "better-auth:signal":
							if (message.signal && ui.$store) {
								ui.$store.notify(message.signal);
							}
							break;
					}
				};

				window.addEventListener("message", handleMessage);
				messageCleanup = () =>
					window.removeEventListener("message", handleMessage);

				// Try module script first, then plain script (IIFE format)
				const moduleScript = doc.querySelector('script[type="module"]');
				const plainScript = doc.querySelector('script:not([type="module"])');
				const scriptToUse = moduleScript || plainScript;

				if (scriptToUse?.textContent && containerRef.current) {
					const scriptEl = document.createElement("script");
					if (scriptToUse === moduleScript) {
						scriptEl.type = "module";
					}
					scriptEl.textContent = scriptToUse.textContent;
					containerRef.current.appendChild(scriptEl);
				}

				onLoad?.();
			} catch (err) {
				if (!mounted) return;
				const message = err instanceof Error ? err.message : "Failed to load";
				setError(message);
				setLoading(false);
				onError?.({ code: "LOAD_ERROR", message });
			}
		}

		void loadAndHydrate();

		return () => {
			mounted = false;
			messageCleanup?.();
		};
	}, [
		ui.src,
		ui.page,
		onSuccess,
		onError,
		onLoad,
		ui.$store,
		ui.atomListeners,
	]);

	const pageName = formatPageName(ui.page);

	if (error) {
		return (
			<div className={className} style={style}>
				<div
					style={{
						padding: "1rem",
						textAlign: "center",
						color: "var(--destructive, #ef4444)",
					}}
				>
					{error ?? "An Unknown Error Occurred"}
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={className}
			style={style}
			aria-label={`${pageName} - Authentication`}
		>
			{loading && (
				<div
					style={{
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						minHeight: "400px",
					}}
				>
					<div
						style={{
							width: "2rem",
							height: "2rem",
							border: "2px solid var(--border, #e5e7eb)",
							borderTopColor: "var(--primary, #3b82f6)",
							borderRadius: "50%",
							animation: "spin 1s linear infinite",
						}}
					/>
					<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
				</div>
			)}
		</div>
	);
}
