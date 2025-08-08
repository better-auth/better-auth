import type { Auth } from "../../auth";

export const m2mClient = (auth: Auth) => {
	return {
		/**
		 * Create a new M2M client
		 */
		createClient: async (data: {
			name?: string;
			scopes?: string[];
			metadata?: Record<string, any>;
			expiresIn?: number;
		}) => {
			return auth.api.post("/m2m/clients", data);
		},

		/**
		 * List all M2M clients
		 */
		listClients: async (params?: {
			limit?: number;
			offset?: number;
		}) => {
			return auth.api.get("/m2m/clients", { params });
		},

		/**
		 * Get a specific M2M client
		 */
		getClient: async (id: string) => {
			return auth.api.get(`/m2m/clients/${id}`);
		},

		/**
		 * Update an M2M client
		 */
		updateClient: async (
			id: string,
			data: {
				name?: string;
				scopes?: string[];
				metadata?: Record<string, any>;
				disabled?: boolean;
				expiresIn?: number | null;
			},
		) => {
			return auth.api.put(`/m2m/clients/${id}`, data);
		},

		/**
		 * Delete an M2M client
		 */
		deleteClient: async (id: string) => {
			return auth.api.delete(`/m2m/clients/${id}`);
		},

		/**
		 * Get an access token using client credentials
		 */
		getAccessToken: async (data: {
			clientId: string;
			clientSecret: string;
			scope?: string;
		}) => {
			return auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: data.clientId,
				client_secret: data.clientSecret,
				scope: data.scope,
			});
		},
	};
}; 