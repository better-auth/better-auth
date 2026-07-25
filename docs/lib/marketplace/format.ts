/** Compact numeric formatting for marketplace stats (stars, downloads). */
export function formatCount(value: number | null): string {
	if (value == null) return "—";
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	}
	return String(value);
}
