import { Module } from "@nestjs/common";
import { BeforeSignupHook } from "./before-signup.hook";

@Module({
	imports: [],
	providers: [BeforeSignupHook],
})
export class HooksModule {}
