import { ProviderError, ProviderMissing } from "@better-auth/shared/error";
import { z } from "zod";
import { parseUser } from "../adapters/utils";
import { signInOAuth } from "../oauth2/signin";
import { withPlugins } from "../plugins/utils";
import { getProvider } from "../providers/utils";
import type { Context } from "./types";

const signUpSchema = z.object({
	data: z.record(z.string(), z.any()).optional(),
	provider: z.string(),
	currentURL: z.string(),
	callbackURL: z.string().optional(),
	autoCreateSession: z.boolean().optional(),
});

export type SignUpContext = Context<z.infer<typeof signUpSchema>>;

export const signUp = async (context: SignUpContext) => {
	const data = signUpSchema.parse(context.request.body);

	const provider = getProvider(context, data.provider);
	if (!provider) {
		throw new ProviderMissing(data.provider);
	}
	if (provider?.type === "oauth" || provider?.type === "oidc") {
		// @ts-expect-error - sign up should be added to the request body
		context.request.body.signUp = context.request.body.data;
		const url = await signInOAuth(context, provider, {
			autoCreateSession: data.autoCreateSession ?? true,
			onlySignUp: true,
		});
		return {
			status: 200,
			body: {
				url,
				redirect: true,
			},
		};
	}

	if (!provider.signUp) {
		throw new ProviderError("Sign up method not implemented");
	}

	return await provider.signUp(context);
};

export const signUpHandler = withPlugins(signUp);
