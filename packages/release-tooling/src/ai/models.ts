import type { LanguageModel } from "ai";
import { gateway } from "ai";

interface ReleaseModels {
	readonly changeset: LanguageModel;
	readonly releaseNotes: LanguageModel;
	readonly releaseNotesReviewer: LanguageModel;
}

export const models: ReleaseModels = {
	changeset: gateway("anthropic/claude-haiku-5.5"),
	releaseNotes: gateway("anthropic/claude-sonnet-5.5"),
	releaseNotesReviewer: gateway("openai/gpt-6.1-sol"),
};
