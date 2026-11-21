import type { OnlineListener, OnlineManager } from "better-auth/client";
import electron from "electron";

const { app, ipcMain, net } = electron;

/**
 * Reads connectivity from `net`, the main-process source, and learns about
 * reconnects from renderers, since only they receive `online` events.
 */
export function createMainOnlineManager(onlineChannel: string): OnlineManager {
	const listeners = new Set<OnlineListener>();
	const setOnline = (online: boolean) => {
		listeners.forEach((listener) => listener(online));
	};

	return {
		// Reading `net` on demand keeps the state current while no window is open.
		get isOnline() {
			// `net` throws before the app is ready.
			return !app.isReady() || net.isOnline();
		},
		setOnline,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setup() {
			const onOnline = () => setOnline(true);
			ipcMain.on(onlineChannel, onOnline);
			return () => {
				ipcMain.off(onlineChannel, onOnline);
			};
		},
	};
}
