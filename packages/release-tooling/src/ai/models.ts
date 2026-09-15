import type { LanguageModel } from "ai";
import { gateway } from "ai";

interface ReleaseModels {
	readonly changeset: LanguageModel;
	readonly releaseNotes: LanguageModel;
	readonly releaseNotesReviewer: LanguageModel;
}

export const models: ReleaseModels = {
	changeset: gateway("openai/gpt-5.6-luna"),
	releaseNotes: gateway("openai/gpt-5.6-terra"),
	releaseNotesReviewer: gateway("anthropic/claude-sonnet-5"),
};
