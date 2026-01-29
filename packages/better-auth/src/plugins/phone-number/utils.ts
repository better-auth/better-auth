export function splitAtLastColon(input: string): [string, string] {
	const idx = input.lastIndexOf(":");
	if (idx === -1) {
		return [input, ""];
	}
	return [input.slice(0, idx), input.slice(idx + 1)];
}
