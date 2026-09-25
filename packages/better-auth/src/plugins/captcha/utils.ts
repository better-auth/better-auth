export const encodeToURLParams = (obj: Record<string, any>): string => {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
		throw new Error("Input must be a non-null object.");
	}

	const params = new URLSearchParams();

	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined && value !== null) {
			params.append(key, String(value));
		}
	}

	return params.toString();
};

/**
 * Rejects after `timeoutMs` without cancelling the underlying promise.
 */
export const withTimeout = <T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(
			() => reject(new Error("Operation timed out")),
			timeoutMs,
		);
	});

	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
