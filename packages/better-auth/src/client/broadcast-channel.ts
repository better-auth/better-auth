export interface BroadcastMessage {
	event?: "session" | undefined;
	data?: { trigger?: "signout" | "getSession" | "updateUser" } | undefined;
	clientId: string;
	timestamp: number;
}

export type BroadcastListener = (message: BroadcastMessage) => void;

export const kBroadcastChannel = Symbol.for("better-auth:broadcast-channel");

const now = () => Math.floor(Date.now() / 1000);

export interface BroadcastChannel {
	post(message: Record<string, unknown>): void;
	subscribe(listener: BroadcastListener): () => void;
	setup(): () => void;
}

class WindowBroadcastChannel implements BroadcastChannel {
	listeners = new Set<BroadcastListener>();
	private name: string;

	constructor(name = "better-auth.message") {
		this.name = name;
	}

	subscribe(listener: BroadcastListener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	post(message: Record<string, unknown>) {
		if (typeof window === "undefined") return;
		try {
			localStorage.setItem(
				this.name,
				JSON.stringify({ ...message, timestamp: now() }),
			);
		} catch {}
	}

	setup() {
		if (
			typeof window === "undefined" ||
			typeof window.addEventListener === "undefined"
		) {
			return () => {};
		}

		const handler = (event: StorageEvent) => {
			if (event.key !== this.name) return;
			const message: BroadcastMessage = JSON.parse(event.newValue ?? "{}");
			if (message?.event !== "session" || !message?.data) return;

			this.listeners.forEach((listener) => listener(message));
		};

		window.addEventListener("storage", handler);

		return () => {
			window.removeEventListener("storage", handler);
		};
	}
}

export function getGlobalBroadcastChannel(name = "better-auth.message") {
	if (!(globalThis as any)[kBroadcastChannel]) {
		(globalThis as any)[kBroadcastChannel] = new WindowBroadcastChannel(name);
	}
	return (globalThis as any)[kBroadcastChannel] as BroadcastChannel;
}
