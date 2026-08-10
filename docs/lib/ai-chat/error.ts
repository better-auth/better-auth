export const CHAT_ERROR_MESSAGE =
	"The response was interrupted. Please try again.";

export const CHAT_RATE_LIMIT_MESSAGE =
	"Too many requests. Please wait a moment and try again.";

export function getChatErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);

	if (message.toLowerCase().includes("rate limit")) {
		return CHAT_RATE_LIMIT_MESSAGE;
	}

	return CHAT_ERROR_MESSAGE;
}
