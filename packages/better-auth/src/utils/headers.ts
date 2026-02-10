export type HeadersLike =
	| Headers
	| Iterable<[string, string]>
	| {
			entries: () => Iterable<[string, string]>;
	  }
	| {
			forEach: (cb: (value: unknown, key: unknown) => void) => void;
			get: (key: string) => string | null;
	  }
	| Record<string, string | string[] | number | boolean | null | undefined>;

function hasAnyHeader(headers: Headers): boolean {
	return !headers.keys().next().done;
}

/**
 * Convert "headers-like" inputs into a real Web `Headers` instance.
 *
 * This is used for server-side usage such as:
 * - Next.js App Router `headers()` (ReadonlyHeaders) which is not a real `Headers`
 * - Node.js `IncomingHttpHeaders` (record with possibly array values)
 */
export function toHeaders(input: HeadersLike | undefined): Headers | undefined {
	if (!input) return undefined;

	// Already a Web Headers instance
	if (input instanceof Headers) {
		return new Headers(input);
	}

	const anyInput = input as any;

	// Next.js `ReadonlyHeaders` provides `.entries()` but is not a real `HeadersInit`.
	if (typeof anyInput?.entries === "function") {
		try {
			return new Headers(Array.from(anyInput.entries()) as any);
		} catch {
			// fall through
		}
	}

	// Some runtimes provide a header-like object with `forEach`/`get`
	if (typeof anyInput?.forEach === "function" && typeof anyInput?.get === "function") {
		try {
			const headers = new Headers();
			anyInput.forEach((value: unknown, key: unknown) => {
				if (value === undefined || value === null) return;
				headers.append(String(key), String(value));
			});
			return hasAnyHeader(headers) ? headers : undefined;
		} catch {
			// fall through
		}
	}

	// Iterable of [key, value] pairs (e.g. Map, string[][])
	if (typeof anyInput?.[Symbol.iterator] === "function") {
		try {
			return new Headers(Array.from(anyInput) as any);
		} catch {
			// fall through
		}
	}

	// Plain object record (e.g. Node IncomingHttpHeaders)
	if (typeof anyInput === "object") {
		const headers = new Headers();
		for (const [key, value] of Object.entries(anyInput as Record<string, unknown>)) {
			if (value === undefined || value === null) continue;
			if (Array.isArray(value)) {
				for (const v of value) {
					if (v === undefined || v === null) continue;
					headers.append(key, String(v));
				}
			} else {
				headers.set(key, String(value));
			}
		}
		return hasAnyHeader(headers) ? headers : undefined;
	}

	// Last resort
	try {
		return new Headers(input as any);
	} catch {
		return undefined;
	}
}

