<script lang="ts">
import { createEventDispatcher, onDestroy, onMount } from "svelte";
import { formatPageName } from "../auth-iframe";
import type { UIConfig } from "../ui";

export let ui: UIConfig;

const dispatch = createEventDispatcher<{
	success: { redirectTo?: string };
	error: { code: string; message: string };
	load: void;
}>();

let containerRef: HTMLDivElement;
let _loading = true;
let _error: string | null = null;
let messageCleanup: (() => void) | null = null;

$: pageName = formatPageName(ui.page);

async function loadAndHydrate() {
	try {
		const response = await fetch(ui.src);

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
					dispatch("success", message.data || {});
					if (ui.$store) {
						ui.$store.notify("$sessionSignal");
					}
					break;
				case "better-auth:error":
					dispatch(
						"error",
						message.error || { code: "UNKNOWN", message: "Unknown error" },
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
		messageCleanup = () => window.removeEventListener("message", handleMessage);

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

		_loading = false;
		dispatch("load");
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to load";
		_error = message;
		_loading = false;
		dispatch("error", { code: "LOAD_ERROR", message });
	}
}

onMount(() => {
	void loadAndHydrate();
});

onDestroy(() => {
	messageCleanup?.();
});
</script>

{#if error}
	<div aria-label={`${pageName} - Authentication`}>
		<div style="padding: 1rem; text-align: center; color: var(--destructive, #ef4444)">
			{error}
		</div>
	</div>
{:else}
	<div bind:this={containerRef} aria-label={`${pageName} - Authentication`}>
		{#if loading}
			<div style="display: flex; justify-content: center; align-items: center; min-height: 400px">
				<div class="spinner" />
			</div>
		{/if}
	</div>
{/if}

<style>
	.spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid var(--border, #e5e7eb);
		border-top-color: var(--primary, #3b82f6);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
