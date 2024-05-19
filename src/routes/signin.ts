import { z } from "zod";
import { setSessionCookie } from "../cookies";
import { ProviderError, ProviderMissing } from "../errors";
import { signInOAuth } from "../oauth2/signin";
import { withPlugins } from "../plugins/utils";
import { getProvider } from "../providers/utils";
import type { Context, InternalResponse } from "./types";

export const bodySchema = z.object({
	provider: z.string(),
	data: z.record(z.string(), z.any()).optional(),
	callbackURL: z.string().optional(),
	currentURL: z.string(),
});

export type SignInContext = Context<z.infer<typeof bodySchema>>;

export type SignInHooks = {
	before?: (ctx: SignInContext) => Promise<Context<any>>;
	after?: (ctx: SignInContext) => Promise<InternalResponse<any> | undefined>;
};

export const signIn = async (context: SignInContext) => {
	const data = bodySchema.parse(context.request.body);
	const provider = getProvider(context, data.provider);
	if (!provider) {
		throw new ProviderMissing(data.provider);
	}
	if (provider.type === "oauth" || provider.type === "oidc") {
		const url = await signInOAuth(context, provider);
		return {
			status: 200,
			body: {
				url,
				redirect: true,
			},
		};
	}
	if (provider.type === "custom") {
		if (!provider.signIn) {
			throw new ProviderError("Sign in method not implemented");
		}
		return await provider.signIn(context);
	}
	throw new ProviderError("Invalid provider type");
};

export const signInHandler = withPlugins(signIn);
