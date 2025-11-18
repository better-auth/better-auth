import type { FocusListener, FocusManager } from "better-auth/client";
import { kFocusManager } from "better-auth/client";
import type { AppStateStatus } from "react-native";
import { AppState } from "react-native";

class ExpoFocusManager implements FocusManager {
	listeners = new Set<FocusListener>();
	subscription?: ReturnType<typeof AppState.addEventListener>;

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
		this.subscription = AppState.addEventListener(
			"change",
			(state: AppStateStatus) => {
				this.setFocused(state === "active");
			},
		);

		return () => {
			this.subscription?.remove();
		};
	}
}

export function setupExpoFocusManager() {
	if (!(globalThis as any)[kFocusManager]) {
		(globalThis as any)[kFocusManager] = new ExpoFocusManager();
	}
	return (globalThis as any)[kFocusManager] as FocusManager;
}
