/**
 * Compare two buffers in constant time.
 */
export function constantTimeEqual(
	a: ArrayBuffer | Uint8Array,
	b: ArrayBuffer | Uint8Array,
): boolean {
	const aBuffer = new Uint8Array(a);
	const bBuffer = new Uint8Array(b);
	if (aBuffer.length !== bBuffer.length) {
		return false;
	}
	let c = 0;
	for (let i = 0; i < aBuffer.length; i++) {
		c |= aBuffer[i]! ^ bBuffer[i]!;
	}
	return c === 0;
}
