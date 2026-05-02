import { createSignal, onCleanup, onMount, Show } from "solid-js";
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
	class?: string;
	/**
	 * CSS class name for the container (alias for class)
	 */
	className?: string;
	/**
	 * Inline styles for the container
	 */
	style?: Record<string, string>;
}

/**
 * Auth component that renders authentication UI directly in the page.
 *
 * Features:
 * - Fetches pre-rendered HTML template from the server
 * - Hydrates with vanilla JS for interactivity
 * - No iframe - direct DOM rendering
 * - Inherits CSS variables from parent for theming
 *
 * @example
 * ```tsx
 * import { createAuthClient } from "better-auth/solid";
 * import { Auth } from "better-auth/solid";
 *
 * const authClient = createAuthClient();
 *
 * function SignInPage() {
 *   return (
 *     <Auth
 *       ui={authClient.ui.signIn()}
 *       onSuccess={() => navigate("/dashboard")}
 *       onError={(err) => toast.error(err.message)}
 *     />
 *   );
 * }
 * ```
 */
export function Auth(props: AuthProps) {
	let containerRef: HTMLDivElement | undefined;
	let messageCleanup: (() => void) | null = null;

	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<string | null>(null);

	const pageName = () => formatPageName(props.ui.page);

	async function loadAndHydrate() {
		try {
			const response = await fetch(props.ui.src);

			if (!response.ok) {
				throw new Error(`Failed to load auth UI: ${response.statusText}`);
			}

			const html = await response.text();

			if (!containerRef) return;

			// Parse the HTML response
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");

			// Extract the body content
			const bodyContent = doc.body.innerHTML;

			// Extract and inject the CSS
			const styleTag = doc.querySelector("style");
			if (styleTag?.textContent) {
				const existingStyle = document.getElementById("better-auth-ui-styles");
				if (!existingStyle) {
					const newStyle = document.createElement("style");
					newStyle.id = "better-auth-ui-styles";
					newStyle.textContent = styleTag.textContent;
					document.head.appendChild(newStyle);
				}
			}

			// Insert the template
			containerRef.innerHTML = bodyContent;

			// Prevent form submission as fallback (in case hydration script fails)
			const forms = containerRef.querySelectorAll("form");
			forms.forEach((form) => {
				form.addEventListener("submit", (e) => {
					e.preventDefault();
				});
			});

			// Set up message listener
			const handleMessage = (event: MessageEvent) => {
				if (event.origin !== window.location.origin) return;

				const message = event.data;
				if (!message || typeof message !== "object" || !message.type) return;

				switch (message.type) {
					case "better-auth:success":
						props.onSuccess?.(message.data || {});
						if (props.ui.$store) {
							props.ui.$store.notify("$sessionSignal");
						}
						break;
					case "better-auth:error":
						props.onError?.(
							message.error || { code: "UNKNOWN", message: "Unknown error" },
						);
						break;
					case "better-auth:signal":
						if (message.signal && props.ui.$store) {
							props.ui.$store.notify(message.signal);
						}
						break;
				}
			};

			window.addEventListener("message", handleMessage);
			messageCleanup = () =>
				window.removeEventListener("message", handleMessage);

			// Execute the hydration script (try module first, then plain/IIFE)
			const moduleScript = doc.querySelector('script[type="module"]');
			const plainScript = doc.querySelector('script:not([type="module"])');
			const scriptToUse = moduleScript || plainScript;

			if (scriptToUse?.textContent && containerRef) {
				const scriptEl = document.createElement("script");
				if (scriptToUse === moduleScript) {
					scriptEl.type = "module";
				}
				scriptEl.textContent = scriptToUse.textContent;
				containerRef.appendChild(scriptEl);
			}

			setLoading(false);
			props.onLoad?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to load";
			setError(message);
			setLoading(false);
			props.onError?.({ code: "LOAD_ERROR", message });
		}
	}

	onMount(() => {
		void loadAndHydrate();
	});

	onCleanup(() => {
		messageCleanup?.();
	});

	const spinnerStyle = {
		width: "2rem",
		height: "2rem",
		border: "2px solid var(--border, #e5e7eb)",
		"border-top-color": "var(--primary, #3b82f6)",
		"border-radius": "50%",
		animation: "ba-spin 1s linear infinite",
	};

	return (
		<>
			<style>{`@keyframes ba-spin { to { transform: rotate(360deg); } }`}</style>
			<Show
				when={!error()}
				fallback={
					<div
						class={props.className ?? props.class}
						style={props.style}
						aria-label={`${pageName()} - Authentication`}
					>
						<div
							style={{
								padding: "1rem",
								"text-align": "center",
								color: "var(--destructive, #ef4444)",
							}}
						>
							{error()}
						</div>
					</div>
				}
			>
				<div
					ref={(el) => {
						containerRef = el;
					}}
					class={props.className ?? props.class}
					style={props.style}
					aria-label={`${pageName()} - Authentication`}
				>
					<Show when={loading()}>
						<div
							style={{
								display: "flex",
								"justify-content": "center",
								"align-items": "center",
								"min-height": "400px",
							}}
						>
							<div style={spinnerStyle} />
						</div>
					</Show>
				</div>
			</Show>
		</>
	);
}
