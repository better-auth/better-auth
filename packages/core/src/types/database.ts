type D1Result<T> = {
	results: T[];
	meta: {
		changes: number;
		last_row_id: number;
	};
};

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

/**
 * A Cloudflare D1-compatible database.
 */
export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
	exec(query: string): Promise<unknown>;
}
