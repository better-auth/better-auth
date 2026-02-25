/**
 * Compare two buffers in constant time.
 */
export function constantTimeEqual(
	a: ArrayBuffer | Uint8Array | string,
	b: ArrayBuffer | Uint8Array | string,
): boolean {
	if (typeof a === "string") {
		a = new TextEncoder().encode(a);
	}
	if (typeof b === "string") {
		b = new TextEncoder().encode(b);
	}
	const aBuffer = new Uint8Array(a);
	const bBuffer = new Uint8Array(b);
	let c = aBuffer.length ^ bBuffer.length;
	const length = Math.max(aBuffer.length, bBuffer.length);
	for (let i = 0; i < length; i++) {
		c |=
			(i < aBuffer.length ? aBuffer[i]! : 0) ^
			(i < bBuffer.length ? bBuffer[i]! : 0);
	}
	return c === 0;
}
