import { InvalidRequest } from "../error";

export type AuthorizePrompt = "login" | "consent" | "select_account" | "none";
export type AuthorizePromptSet = ReadonlySet<AuthorizePrompt>;

/**
 * Parse space-separated prompt string into a set of prompts
 *
 * @param prompt
 */
export function parsePrompt(prompt: string) {
	const prompts = prompt.split(" ").map((p) => p.trim());
	const set = new Set<AuthorizePrompt>();
	for (const p of prompts) {
		if (
			p === "login" ||
			p === "consent" ||
			p === "select_account" ||
			p === "none"
		) {
			set.add(p);
		}
	}

	if (set.has("none") && set.size > 1) {
		throw new InvalidRequest("prompt none must only be used alone");
	}

	return new Set(set) as AuthorizePromptSet;
}
