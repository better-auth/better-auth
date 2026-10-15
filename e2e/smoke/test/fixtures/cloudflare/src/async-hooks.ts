import type { AsyncLocalStorage } from "node:async_hooks";

let storage: AsyncLocalStorage<string> | undefined;
let instance: string | undefined;
let moduleLoaded = false;

async function getStorage() {
	const module = await import("@better-auth/core/async_hooks");
	moduleLoaded = true;
	const Storage = await module.getAsyncLocalStorage();
	storage ??= new Storage<string>();
	return storage;
}

export default {
	async fetch(request, _env, context) {
		instance ??= crypto.randomUUID();
		const url = new URL(request.url);
		if (url.pathname === "/start") {
			const task = getStorage();
			if (url.searchParams.get("waitUntil") === "true") {
				context.waitUntil(task);
			} else {
				void task.catch(() => {});
			}
			return new Response(null, { status: 204 });
		}
		if (url.pathname === "/status") {
			return Response.json({ instance, moduleLoaded });
		}
		const id = url.searchParams.get("id");
		const task = getStorage().then((storage) =>
			storage.run(id ?? "", async () => {
				await scheduler.wait(10);
				return {
					outcome: "completed",
					instance,
					id,
					store: storage.getStore(),
				};
			}),
		);
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return Response.json(
				await Promise.race([
					task,
					new Promise<{ outcome: "pending" }>((resolve) => {
						timer = setTimeout(() => resolve({ outcome: "pending" }), 1_000);
					}),
				]),
			);
		} finally {
			clearTimeout(timer);
		}
	},
} satisfies ExportedHandler;
