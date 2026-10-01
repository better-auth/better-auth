import type { LanguageModel } from "ai";
import { gateway } from "ai";

interface ReleaseModels {
	readonly changeset: LanguageModel;
	readonly releaseNotes: LanguageModel;
	readonly releaseNotesReviewer: LanguageModel;
}

export const models: ReleaseModels = {
	changeset: gateway("openai/gpt-6-luna"),
	releaseNotes: gateway("openai/gpt-6-sol"),
	releaseNotesReviewer: gateway("anthropic/claude-sonnet-5"),
};
