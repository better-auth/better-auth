export type OnlineListener = (online: boolean) => void;

export const kOnlineManager = Symbol.for("better-auth:online-manager");

export interface OnlineManager {
	setOnline(online: boolean): void;
	isOnline: boolean;

	subscribe(listener: OnlineListener): () => void;
	setup(): () => void;
}

class WindowOnlineManager implements OnlineManager {
	listeners = new Set<OnlineListener>();
	isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

	subscribe(listener: OnlineListener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	setOnline(online: boolean) {
		this.isOnline = online;
		this.listeners.forEach((listener) => listener(online));
	}

	setup() {
		if (
			typeof window === "undefined" ||
			typeof window.addEventListener === "undefined"
		) {
			return () => {};
		}

		const win = window;

		const onOnline = () => this.setOnline(true);
		const onOffline = () => this.setOnline(false);

		win.addEventListener("online", onOnline, false);
		win.addEventListener("offline", onOffline, false);

		return () => {
			win.removeEventListener("online", onOnline, false);
			win.removeEventListener("offline", onOffline, false);
		};
	}
}

export function getGlobalOnlineManager() {
	if (!(globalThis as any)[kOnlineManager]) {
		(globalThis as any)[kOnlineManager] = new WindowOnlineManager();
	}
	return (globalThis as any)[kOnlineManager] as OnlineManager;
}
