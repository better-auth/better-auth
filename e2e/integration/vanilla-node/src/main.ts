import { createAuthClient } from "better-auth/client";

declare global {
	interface Window {
		client: ReturnType<typeof createAuthClient>;
	}
}

const client = createAuthClient({
	baseURL: "http://localhost:3000",
});

window.client = client;

document.body.innerHTML = "Ready";
