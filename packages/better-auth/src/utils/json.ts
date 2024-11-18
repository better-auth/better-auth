export function safeJSONParse<T>(data: string): T | null {
	try {
		return JSON.parse(data);
	} catch {
		return null;
	}
}
