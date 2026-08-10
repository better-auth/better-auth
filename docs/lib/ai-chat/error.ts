export const CHAT_ERROR_MESSAGE =
	"The response was interrupted. Please try again.";

export const CHAT_RATE_LIMIT_MESSAGE =
	"Too many requests. Please wait a moment and try again.";

const RATE_LIMIT_PATTERN =
	/rate[_ -]?limit|too many requests|resource_exceeded|quota|\b429\b/i;

export function getChatErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);

	if (message === CHAT_ERROR_MESSAGE || message === CHAT_RATE_LIMIT_MESSAGE) {
		return message;
	}

	if (RATE_LIMIT_PATTERN.test(message)) {
		return CHAT_RATE_LIMIT_MESSAGE;
	}

	return CHAT_ERROR_MESSAGE;
}
