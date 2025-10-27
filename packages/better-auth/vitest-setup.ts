// Define a simple, in-memory mock for localStorage (Node.js test environment)

if (typeof globalThis.localStorage === "undefined") {
	let store: Record<string, string> = {};

	Object.defineProperty(globalThis, "localStorage", {
		value: {
			getItem: (key: string) => store[key] || null,
			setItem: (key: string, value: string) => {
				store[key] = value;
			},
			removeItem: (key: string) => {
				delete store[key];
			},
			clear: () => {
				store = {};
			},
			key: (i: number) => Object.keys(store)[i] || null,
			get length() {
				return Object.keys(store).length;
			},
		},
		writable: true,
		configurable: true,
	});
}
