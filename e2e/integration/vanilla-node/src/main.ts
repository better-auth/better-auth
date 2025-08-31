import { createAuthClient } from "better-auth/client";

const client = createAuthClient({
	baseURL: "http://localhost:3000",
});

declare global {
	interface Window {
		client: typeof client;
	}
}

window.client = client;

document.body.innerHTML = "Ready";
