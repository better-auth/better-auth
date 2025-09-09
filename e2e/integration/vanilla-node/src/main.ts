import { createAuthClient } from "better-auth/client";

const search = new URLSearchParams(window.location.search);
const port = search.get("port");
const https = search.get("https");

const client = createAuthClient({
	baseURL: `http${https ? "s" : ""}://localhost:${port ?? 3000}`,
});

declare global {
	interface Window {
		client: typeof client;
	}
}

window.client = client;

document.body.innerHTML = "Ready";
