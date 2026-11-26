import { createAuthClient } from "better-auth/solid-v2";

function getBaseURL() {
	if (typeof window === "undefined") {
		// The client never fetches during server rendering.
		return "http://localhost";
	}
	return window.location.origin;
}

export const client = createAuthClient({
	baseURL: getBaseURL(),
});

declare global {
	interface Window {
		client: typeof client;
	}
}
