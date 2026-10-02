import type * as z from "zod";

export interface RemoteForm<Input, Output> {
	fields: {
		[K in keyof Input]?: {
			as: (type: string, value?: unknown) => Record<string, unknown>;
		};
	};
	pending: boolean;
	result: Output | undefined;
}

declare module "$app/server" {
	export function form<Schema extends z.ZodType, Output>(
		schema: Schema,
		fn: (data: z.infer<Schema>) => Output | Promise<Output>,
	): RemoteForm<z.infer<Schema>, Awaited<Output>>;
	export function command<Output>(
		fn: () => Output | Promise<Output>,
	): () => Promise<Awaited<Output>>;
	export function query<Output>(
		fn: () => Output | Promise<Output>,
	): () => Promise<Awaited<Output>> & { refresh: () => Promise<void> };
	export function getRequestEvent(): {
		request: Request;
		cookies: { getAll: () => Array<{ name: string; value: string }> };
	};
}
