import { createClient } from "better-call/client";
import { router } from "./router";

export const client = createClient<typeof router>({
	baseURL: "http://localhost:3000/api/v1",
});
