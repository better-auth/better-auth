import { Inject } from "@nestjs/common";
import type { Auth } from "../../auth";
import { AUTH_INSTANCE_KEY } from "./symbols";

/**
 * NestJS service that provides access to the Better Auth instance
 * Use generics to support auth instances extended by plugins
 */
export class AuthService<T extends { api: T["api"] } = Auth> {
	constructor(
		@Inject(AUTH_INSTANCE_KEY)
		private readonly auth: T,
	) {}

	/**
	 * Returns the API endpoints provided by the auth instance
	 */
	get api() {
		return this.auth.api;
	}

	/**
	 * Returns the complete auth instance
	 * Access this for plugin-specific functionality
	 */
	get instance(): T {
		return this.auth;
	}
}
