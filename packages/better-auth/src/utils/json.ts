export function safeJSONParse<T>(data: string): T | null {
	function reviver(_: string, value: any): any {
		if (typeof value === "string") {
			const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
			if (iso8601Regex.test(value)) {
				const date = new Date(value);
				if (!isNaN(date.getTime())) {
					return date;
				}
			}
		}
		return value;
	}
	try {
		return JSON.parse(data, reviver);
	} catch {
		return null;
	}
}
