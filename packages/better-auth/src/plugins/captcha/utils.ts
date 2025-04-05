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
