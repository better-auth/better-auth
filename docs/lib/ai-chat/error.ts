export const CHAT_ERROR_MESSAGE =
	"The response was interrupted. Please try again.";

export const CHAT_RATE_LIMIT_MESSAGE =
	"Too many requests. Please wait a moment and try again.";

const RATE_LIMIT_PATTERN =
	/rate_limit(?:_(?:error|exceeded|exhausted))?|rate[ -]limit(?:ed|[ -](?:exceeded|exhausted|reached))|too many requests|resource_(?:exceeded|exhausted)|quota[_ -]?(?:exceeded|exhausted)|(?:http(?: status)?|status(?: code)?)\s*:?\s*429/i;

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
