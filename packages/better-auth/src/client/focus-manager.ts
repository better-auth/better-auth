export type FocusListener = (focused: boolean) => void;

export const kFocusManager = Symbol.for("better-auth:focus-manager");

export interface FocusManager {
	setFocused(focused: boolean): void;
	subscribe(listener: FocusListener): () => void;
	setup(): () => void;
}

class WindowFocusManager implements FocusManager {
	listeners = new Set<FocusListener>();

	subscribe(listener: FocusListener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	setFocused(focused: boolean) {
		this.listeners.forEach((listener) => listener(focused));
	}

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
				this.setFocused(true);
			}
		};

		target.addEventListener("visibilitychange", visibilityHandler, false);

		return () => {
			target.removeEventListener("visibilitychange", visibilityHandler, false);
		};
	}
}

export function getGlobalFocusManager() {
	if (!(globalThis as any)[kFocusManager]) {
		(globalThis as any)[kFocusManager] = new WindowFocusManager();
	}
	return (globalThis as any)[kFocusManager] as FocusManager;
}
