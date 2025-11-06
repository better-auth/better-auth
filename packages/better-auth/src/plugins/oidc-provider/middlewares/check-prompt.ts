import { createAuthMiddleware } from "@better-auth/core/api";
import { defineRequestState } from "@better-auth/core/context";
import z from "zod";
import { type AuthorizePromptSet, parsePrompt } from "../utils/prompt";

const { get: getAuthorizePromptSet, set: _setAuthorizePromptSet } =
	defineRequestState<AuthorizePromptSet>(z.any());

export const checkPromptMiddleware = createAuthMiddleware(async (ctx) => {
	if (ctx.params.prompt !== undefined) {
		const prompt = ctx.params.prompt;
		const promptSet = parsePrompt(prompt);
		await _setAuthorizePromptSet(promptSet);
	}
});

export { getAuthorizePromptSet };
