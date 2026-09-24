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

		const doc = document;

		const visibilityHandler = () => {
			if (doc.visibilityState === "visible") {
				this.setFocused(true);
			}
		};

		doc.addEventListener("visibilitychange", visibilityHandler, false);

		return () => {
			doc.removeEventListener("visibilitychange", visibilityHandler, false);
		};
	}
}

export function getGlobalFocusManager() {
	if (!(globalThis as any)[kFocusManager]) {
		(globalThis as any)[kFocusManager] = new WindowFocusManager();
	}
	return (globalThis as any)[kFocusManager] as FocusManager;
}
