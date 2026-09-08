import { createAuthClient } from "better-auth/client";
import { oneTapClient } from "better-auth/client/plugins";
import { electronClient } from "./client";

const client = createAuthClient({
	plugins: [
		oneTapClient({ clientId: "test-client-id" }),
		electronClient({
			protocol: { scheme: "com.example.app" },
			signInURL: "https://example.com/sign-in",
			storage: {
				getItem: () => null,
				setItem: () => {},
			},
		}),
	],
});

void client.setupMain;
void client.oneTap;
