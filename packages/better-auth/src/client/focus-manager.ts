type FocusListener = (focused: boolean) => void;

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
		if (typeof window === "undefined" || typeof document === "undefined") {
			return () => {};
		}

		const onFocus = () => this.setFocused(true);

		const visibilityHandler = () => {
			if (document.visibilityState === "visible") {
				this.setFocused(true);
			}
		};

		window.addEventListener("focus", onFocus, false);
		document.addEventListener("visibilitychange", visibilityHandler, false);

		return () => {
			window.removeEventListener("focus", onFocus, false);
			document.removeEventListener(
				"visibilitychange",
				visibilityHandler,
				false,
			);
		};
	}
}

export function getGlobalFocusManager() {
	if (!(globalThis as any)[kFocusManager]) {
		(globalThis as any)[kFocusManager] = new WindowFocusManager();
	}
	return (globalThis as any)[kFocusManager] as FocusManager;
}
