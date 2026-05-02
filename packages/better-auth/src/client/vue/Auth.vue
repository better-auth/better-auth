<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { formatPageName } from "../auth-iframe";
import type { UIConfig } from "../ui";

export interface AuthProps {
	ui: UIConfig;
}

const props = defineProps<AuthProps>();

const emit = defineEmits<{
	success: [data: { redirectTo?: string }];
	error: [error: { code: string; message: string }];
	load: [];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const _pageName = computed(() => formatPageName(props.ui.page));

let messageCleanup: (() => void) | null = null;

async function loadAndHydrate() {
	try {
		const response = await fetch(props.ui.src);

		if (!response.ok) {
			throw new Error(`Failed to load auth UI: ${response.statusText}`);
		}

		const html = await response.text();

		if (!containerRef.value) return;

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
		containerRef.value.innerHTML = bodyContent;

		// Prevent form submission as fallback (in case hydration script fails)
		const forms = containerRef.value.querySelectorAll("form");
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
					emit("success", message.data || {});
					if (props.ui.$store) {
						props.ui.$store.notify("$sessionSignal");
					}
					break;
				case "better-auth:error":
					emit(
						"error",
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
		messageCleanup = () => window.removeEventListener("message", handleMessage);

		// Execute the hydration script (try module first, then plain/IIFE)
		const moduleScript = doc.querySelector('script[type="module"]');
		const plainScript = doc.querySelector('script:not([type="module"])');
		const scriptToUse = moduleScript || plainScript;

		if (scriptToUse?.textContent && containerRef.value) {
			const scriptEl = document.createElement("script");
			if (scriptToUse === moduleScript) {
				scriptEl.type = "module";
			}
			scriptEl.textContent = scriptToUse.textContent;
			containerRef.value.appendChild(scriptEl);
		}

		loading.value = false;
		emit("load");
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to load";
		error.value = message;
		loading.value = false;
		emit("error", { code: "LOAD_ERROR", message });
	}
}

onMounted(() => {
	void loadAndHydrate();
});

onUnmounted(() => {
	messageCleanup?.();
});
</script>

<template>
	<div v-if="error" :aria-label="`${pageName} - Authentication`">
		<div style="padding: 1rem; text-align: center; color: var(--destructive, #ef4444)">
			{{ error }}
		</div>
	</div>
	<div v-else ref="containerRef" :aria-label="`${pageName} - Authentication`">
		<div
			v-if="loading"
			style="display: flex; justify-content: center; align-items: center; min-height: 400px"
		>
			<div
				style="
					width: 2rem;
					height: 2rem;
					border: 2px solid var(--border, #e5e7eb);
					border-top-color: var(--primary, #3b82f6);
					border-radius: 50%;
					animation: spin 1s linear infinite;
				"
			/>
		</div>
	</div>
</template>

<style>
@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
