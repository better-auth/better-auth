import { createAuthClient } from "better-auth/client";

const client = createAuthClient({
	baseURL: "http://localhost:3000",
});

// @ts-expect-error We don't declare this in the types
globalThis.client = client;

document.body.innerHTML = "Ready";
