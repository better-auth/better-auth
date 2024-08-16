import { createClient } from "better-auth/client";

export const client = createClient({
	baseURL: "http://localhost:3000/api/auth",
});
