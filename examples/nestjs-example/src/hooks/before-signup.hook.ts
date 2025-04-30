import { AuthContext } from "better-auth";
import { BeforeHook, Hook } from "better-auth/nestjs";

@Hook()
export class BeforeSignupHook {
	@BeforeHook("/sign-up/email")
	async beforeSignup(ctx: AuthContext) {
		console.log("before signup");
	}
}
