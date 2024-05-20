import type { CustomProvider } from "../providers";
import { callbackHandler } from "./callback";
import { sessionHandler } from "./session";
import { signInHandler } from "./signin";
import { signOutHandler } from "./signout";
import { signUpHandler } from "./signup";
import type { Context, InternalResponse } from "./types";

type RouterContext = Context<any>;

export const router = async (
	context: RouterContext,
): Promise<InternalResponse> => {
	const action = context.request.action;
	switch (action) {
		case "signin":
			return signInHandler(context);
		case "callback":
			return await callbackHandler(context);
		case "signup":
			return await signUpHandler(context);
		case "signout":
			return await signOutHandler(context);
		case "session":
			return await sessionHandler(context);
		default: {
			const plugin = context.plugins.find((plugin) => {
				return action.startsWith(plugin.id);
			});
			const providerHandler = context.providers.find((provider) => {
				return provider.type === "custom" && provider.handler?.matcher(context);
			}) as CustomProvider | undefined;
			if (plugin?.handler) {
				return await plugin.handler(context);
			}
			if (providerHandler?.handler) {
				return await providerHandler.handler.handler(context);
			}
			return {
				status: 404,
			};
		}
	}
};
