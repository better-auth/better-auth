import { Inject } from "@nestjs/common";
import type { Auth } from "../../auth";
import { AUTH_INSTANCE_KEY } from "./symbols";

export class AuthService {
	constructor(
		@Inject(AUTH_INSTANCE_KEY)
		private readonly auth: Auth,
	) {}

	get api() {
		return this.auth.api;
	}
}
