import { createAuthClient } from "better-auth/solid";

const search = new URLSearchParams(window.location.search);
const port = search.get("port");

export const client = createAuthClient({
	baseURL: `http://localhost:${port ?? 3000}`,
});

export type Session = typeof client.$Infer.Session;

declare global {
	interface Window {
		client: typeof client;
	}
}
