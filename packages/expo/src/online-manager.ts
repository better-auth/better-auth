import type { OnlineListener, OnlineManager } from "better-auth/client";
import { kOnlineManager } from "better-auth/client";

class ExpoOnlineManager implements OnlineManager {
	listeners = new Set<OnlineListener>();
	isOnline = true;
	unsubscribe?: () => void;

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
		import("expo-network")
			.then(({ addNetworkStateListener }) => {
				const subscription = addNetworkStateListener((state) => {
					this.setOnline(!!state.isInternetReachable);
				});
				this.unsubscribe = () => subscription.remove();
			})
			.catch(() => {
				// fallback to always online
				this.setOnline(true);
			});

		return () => {
			this.unsubscribe?.();
		};
	}
}

export function setupExpoOnlineManager() {
	if (!(globalThis as any)[kOnlineManager]) {
		(globalThis as any)[kOnlineManager] = new ExpoOnlineManager();
	}
	return (globalThis as any)[kOnlineManager] as OnlineManager;
}
