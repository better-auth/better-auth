/**
 * Compare two buffers in constant time.
 */
export function constantTimeEqual(
	a: ArrayBuffer | Uint8Array,
	b: ArrayBuffer | Uint8Array,
): boolean {
	const aBuffer = new Uint8Array(a);
	const bBuffer = new Uint8Array(b);
	let c = aBuffer.length ^ bBuffer.length;
	const length = Math.max(aBuffer.length, bBuffer.length);
	for (let i = 0; i < length; i++) {
		c |=
			(i < aBuffer.length ? aBuffer[i] : 0) ^
			(i < bBuffer.length ? bBuffer[i] : 0);
	}
	return c === 0;
}
