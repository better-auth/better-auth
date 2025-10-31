import {
	kOnlineManager,
	type OnlineListener,
	type OnlineManager,
} from "better-auth/client";

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
		try {
			const { Network } = require("expo-network");
			const subscription = Network.addNetworkStateListener(
				(state: { isConnected: boolean }) => {
					this.setOnline(!!state.isConnected);
				},
			);
			this.unsubscribe = () => subscription.remove();
		} catch {}

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
