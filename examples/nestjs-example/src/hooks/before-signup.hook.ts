import { BeforeHook, Hook } from "better-auth/nestjs";

@Hook()
export class BeforeSignupHook {
	@BeforeHook("/sign-up/email")
	async beforeSignup() {
		console.log("before signup");
	}
}
