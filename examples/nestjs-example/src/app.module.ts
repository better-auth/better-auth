import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "better-auth/nestjs";
import { auth } from "./auth";

@Module({
	imports: [AuthModule.forRoot(auth)],
	controllers: [AppController],
})
export class AppModule {}
