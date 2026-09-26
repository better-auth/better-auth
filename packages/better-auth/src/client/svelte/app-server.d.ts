declare module "$app/server" {
	export function form<Schema, Output>(
		schema: Schema,
		fn: (data: any) => Output | Promise<Output>,
	): any;
	export function command<Output>(
		fn: () => Output | Promise<Output>,
	): () => Output | Promise<Output>;
	export function query<Output>(
		fn: () => Output | Promise<Output>,
	): () => Output | (Promise<Output> & { refresh: () => Promise<void> });
	export function getRequestEvent(): { request: Request };
}
