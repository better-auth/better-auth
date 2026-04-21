import { electronProxyClient } from "@better-auth/electron/proxy";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { stripeClient } from "@better-auth/stripe/client";
import {
	adminClient,
	customSessionClient,
	deviceAuthorizationClient,
	lastLoginMethodClient,
	multiSessionClient,
	oneTapClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { toast } from "sonner";
import type { auth } from "./auth";

export const authClient = createAuthClient({
	plugins: [
		organizationClient(),
		twoFactorClient({
			onTwoFactorRedirect({ methods }) {
				const hasTotp = methods.some((method) => method.kind === "totp");
				const hasOtp = methods.some((method) => method.kind === "otp");
				const destination = hasTotp
					? "/two-factor"
					: hasOtp
						? "/two-factor/otp"
						: "/two-factor/recovery-code";
				window.location.href = destination;
			},
		}),
		passkeyClient(),
		adminClient(),
		multiSessionClient(),
		...(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
			? [
					oneTapClient({
						clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
						promptOptions: {
							maxAttempts: 1,
						},
					}),
				]
			: []),
		oauthProviderClient(),
		stripeClient({
			subscription: true,
		}),
		customSessionClient<typeof auth>(),
		deviceAuthorizationClient(),
		lastLoginMethodClient(),
		electronProxyClient({
			protocol: {
				scheme: "com.better-auth.demo",
			},
		}),
	],
	fetchOptions: {
		onError(e) {
			if (e.error.status === 429) {
				toast.error("Too many requests. Please try again later.");
			}
		},
	},
});
