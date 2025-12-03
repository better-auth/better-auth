export type Awaitable<T> = Promise<T> | T;
export type MakeRequired<T, K extends keyof T> = Omit<T, K> &
	Required<Pick<T, K>>;
