import { createAuthClient } from "better-auth/client";

const search = new URLSearchParams(window.location.search);
const port = search.get("port");

const client = createAuthClient({
	baseURL: `http://localhost:${port ?? 3000}`,
});

declare global {
	interface Window {
		client: typeof client;
	}
}

window.client = client;

document.body.innerHTML = "Ready";
