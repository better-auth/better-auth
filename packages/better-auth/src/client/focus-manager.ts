export type FocusListener = (focused: boolean) => void;

export const kFocusManager = Symbol.for("better-auth:focus-manager");

export interface FocusManager {
	setFocused(focused: boolean): void;
	subscribe(listener: FocusListener): () => void;
	setup(): () => void;
}

// Shared through globalThis so every bundled copy of the client uses the same manager.
const registry = globalThis as Record<symbol, FocusManager | undefined>;

function createWindowFocusManager(): FocusManager {
	const listeners = new Set<FocusListener>();
	const setFocused = (focused: boolean) => {
		listeners.forEach((listener) => listener(focused));
	};

	return {
		setFocused,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setup() {
			if (
				typeof window === "undefined" ||
				typeof document === "undefined" ||
				typeof window.addEventListener === "undefined"
			) {
				return () => {};
			}

			// Cleanup can run after a test environment has removed this global.
			const target = document;
			const visibilityHandler = () => {
				if (document.visibilityState === "visible") {
					setFocused(true);
				}
			};

			target.addEventListener("visibilitychange", visibilityHandler, false);

			return () => {
				target.removeEventListener(
					"visibilitychange",
					visibilityHandler,
					false,
				);
			};
		},
	};
}

export function getGlobalFocusManager() {
	const existing = registry[kFocusManager];
	if (existing) return existing;
	const manager = createWindowFocusManager();
	registry[kFocusManager] = manager;
	return manager;
}

/**
 * Replaces the focus manager for runtimes whose focus events do not come
 * from `document`, such as React Native.
 */
export function setFocusManager(manager: FocusManager) {
	registry[kFocusManager] = manager;
}
