export type OnlineListener = (online: boolean) => void;

export const kOnlineManager = Symbol.for("better-auth:online-manager");

export interface OnlineManager {
	setOnline(online: boolean): void;
	isOnline: boolean;

	subscribe(listener: OnlineListener): () => void;
	setup(): () => void;
}

// Shared through globalThis so every bundled copy of the client uses the same manager.
const registry = globalThis as Record<symbol, OnlineManager | undefined>;

function createWindowOnlineManager(): OnlineManager {
	const listeners = new Set<OnlineListener>();
	const manager: OnlineManager = {
		// Runtimes such as React Native define navigator without onLine.
		isOnline: globalThis.navigator?.onLine ?? true,
		setOnline(online) {
			manager.isOnline = online;
			listeners.forEach((listener) => listener(online));
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setup() {
			if (
				typeof window === "undefined" ||
				typeof window.addEventListener === "undefined"
			) {
				return () => {};
			}

			// Cleanup can run after a test environment has removed this global.
			const target = window;
			const onOnline = () => manager.setOnline(true);
			const onOffline = () => manager.setOnline(false);

			target.addEventListener("online", onOnline, false);
			target.addEventListener("offline", onOffline, false);

			return () => {
				target.removeEventListener("online", onOnline, false);
				target.removeEventListener("offline", onOffline, false);
			};
		},
	};
	return manager;
}

export function getGlobalOnlineManager() {
	const existing = registry[kOnlineManager];
	if (existing) return existing;
	const manager = createWindowOnlineManager();
	registry[kOnlineManager] = manager;
	return manager;
}

/**
 * Replaces the online manager for runtimes whose connectivity events do not
 * come from `window`, such as React Native.
 */
export function setOnlineManager(manager: OnlineManager) {
	registry[kOnlineManager] = manager;
}
