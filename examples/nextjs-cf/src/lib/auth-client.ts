import { createAuthClient } from "better-auth/react";
import { passkeyClient, magicLinkClient } from "better-auth/client/plugins";
import { toast } from "sonner";

export const authClient = createAuthClient({
	plugins: [passkeyClient(), magicLinkClient()],
	fetchOptions: {
		onError(e) {
			if (e.error.status === 429) {
				toast.error("Too many requests. Please try again later.");
			}
		},
	},
});

export const { signUp, signIn, signOut, useSession } = authClient;
