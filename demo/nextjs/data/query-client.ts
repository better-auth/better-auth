"use client";

import {
	defaultShouldDehydrateQuery,
	isServer,
	QueryClient,
} from "@tanstack/react-query";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 3 * 60 * 1000, // 3 min
				gcTime: 6 * 60 * 1000, // 6 min
				retry: 0,
			},
			dehydrate: {
				// include pending queries in dehydration
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
		},
	});
}

// Browser-side QueryClient singleton to prevent recreation during React suspense
let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Get QueryClient instance for server/client rendering.
 * Creates a new client on server, reuses singleton on client.
 */
export function getQueryClient() {
	if (isServer) {
		// Server: always make a new query client
		return makeQueryClient();
	} else {
		// Browser: make a new query client if we don't already have one
		// This is very important, so we don't re-make a new client if React
		// suspends during the initial render. This may not be needed if we
		// have a suspense boundary BELOW the creation of the query client
		if (!browserQueryClient) browserQueryClient = makeQueryClient();
		return browserQueryClient;
	}
}
