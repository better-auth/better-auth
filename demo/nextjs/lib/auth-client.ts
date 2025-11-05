import { passkeyClient } from "@better-auth/passkey/client";
import { stripeClient } from "@better-auth/stripe/client";
import {
	adminClient,
	deviceAuthorizationClient,
	genericOAuthClient,
	lastLoginMethodClient,
	multiSessionClient,
	oidcClient,
	oneTapClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { toast } from "sonner";

export const client = createAuthClient({
	plugins: [
		organizationClient(),
		twoFactorClient({
			onTwoFactorRedirect() {
				window.location.href = "/two-factor";
			},
		}),
		passkeyClient(),
		adminClient(),
		multiSessionClient(),
		oneTapClient({
			clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
			promptOptions: {
				maxAttempts: 1,
			},
		}),
		oidcClient(),
		genericOAuthClient(),
		stripeClient({
			subscription: true,
		}),
		deviceAuthorizationClient(),
		lastLoginMethodClient(),
	],
	fetchOptions: {
		onError(e) {
			if (e.error.status === 429) {
				toast.error("Too many requests. Please try again later.");
			}
		},
	},
});

export const {
	signUp,
	signIn,
	signOut,
	useSession,
	organization,
	useListOrganizations,
	useActiveOrganization,
	useActiveMember,
	useActiveMemberRole,
} = client;
