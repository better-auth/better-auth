import { createAuthClient, type Session } from "better-auth/client";
import type { options } from "./server";
import { writable } from "svelte/store";

export const client = createAuthClient<typeof options>()({
	baseURL: "http://localhost:5173/api/auth",
});

export const session = writable<Session<typeof client> | null>(null);
