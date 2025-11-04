export interface BroadcastMessage {
	event?: "session" | undefined;
	data?: { trigger?: "signout" | "getSession" | "updateUser" } | undefined;
	clientId: string;
	timestamp: number;
}

const now = () => Math.floor(Date.now() / 1000);

export function createBroadcastChannel(name = "better-auth.message") {
	return {
		receive(onReceive: (message: BroadcastMessage) => void) {
			const handler = (event: StorageEvent) => {
				if (event.key !== name) return;
				const message: BroadcastMessage = JSON.parse(event.newValue ?? "{}");
				if (message?.event !== "session" || !message?.data) return;

				onReceive(message);
			};
			window.addEventListener("storage", handler);
			return () => window.removeEventListener("storage", handler);
		},

		post(message: Record<string, unknown>) {
			if (typeof window === "undefined") return;
			try {
				localStorage.setItem(
					name,
					JSON.stringify({ ...message, timestamp: now() }),
				);
			} catch {}
		},
	};
}
