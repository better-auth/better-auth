import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins";
import { expectTypeOf } from "vitest";

const auth = betterAuth({
	plugins: [openAPI()],
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8688
 */
expectTypeOf(auth.api.generateOpenAPISchema).toBeFunction();
expectTypeOf<
	Awaited<ReturnType<typeof auth.api.generateOpenAPISchema>>
>().toMatchTypeOf<{
	openapi: string;
	paths: Record<string, unknown>;
	components: Record<string, unknown>;
}>();
