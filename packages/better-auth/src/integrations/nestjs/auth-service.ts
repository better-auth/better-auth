import { Inject } from "@nestjs/common";
import type { Auth } from "../../auth";

export class AuthService {
	constructor(
		@Inject("AUTH_OPTIONS")
		private readonly auth: Auth,
	) {}

	get api() {
		return this.auth.api;
	}
}
