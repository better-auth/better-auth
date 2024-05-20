export function generateRandomString(size: number) {
	const i2hex = (i: number) => `0${i.toString(16)}`.slice(-2);
	const r = (a: string, i: number): string => a + i2hex(i);
	const bytes = crypto.getRandomValues(new Uint8Array(size));
	return Array.from(bytes).reduce(r, "");
}
