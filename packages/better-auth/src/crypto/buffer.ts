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
	for (let i = 0; i < aBuffer.length; i++) {
		c |= aBuffer[i]! ^ bBuffer[i]!;
	}
	return c === 0;
}
