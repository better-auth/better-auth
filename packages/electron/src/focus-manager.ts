import type { FocusListener, FocusManager } from "better-auth/client";
import electron from "electron";

const { app } = electron;

/**
 * Reports focus from the app's windows, since the main process has no `document`.
 */
export function createMainFocusManager(): FocusManager {
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
			// The session refresh cooldown skips a focus right after a session
			// request, such as the first window opening at startup.
			const onFocus = () => setFocused(true);
			app.on("browser-window-focus", onFocus);
			return () => {
				app.off("browser-window-focus", onFocus);
			};
		},
	};
}
