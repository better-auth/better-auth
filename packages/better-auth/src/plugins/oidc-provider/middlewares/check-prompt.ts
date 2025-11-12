import { createAuthMiddleware } from "@better-auth/core/api";
import { defineRequestState } from "@better-auth/core/context";
import { type AuthorizePromptSet, parsePrompt } from "../utils/prompt";

const { get: getAuthorizePromptSet, set: _setAuthorizePromptSet } =
	defineRequestState<AuthorizePromptSet>(() => new Set());

export const checkPromptMiddleware = createAuthMiddleware(async (ctx) => {
	if (ctx.query?.prompt !== undefined) {
		const prompt = String(ctx.query.prompt);
		const promptSet = parsePrompt(prompt);
		await _setAuthorizePromptSet(promptSet);
	}
});

export { getAuthorizePromptSet };
