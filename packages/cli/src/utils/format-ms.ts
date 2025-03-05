/**
 * Only supports up to seconds.
 */
export function formatMilliseconds(ms: number) {
	if (ms < 0) {
		throw new Error("Milliseconds cannot be negative");
	}
	if (ms < 1000) {
		return `${ms}ms`;
	}

	const seconds = Math.floor(ms / 1000);
	const milliseconds = ms % 1000;

	return `${seconds}s ${milliseconds}ms`;
}
