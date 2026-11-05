/**
 * @see https://github.com/better-auth/better-auth/issues/11899
 */

import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

export const auth = betterAuth({
	plugins: [testUtils()],
});

export const authWithCaptureOTP = betterAuth({
	plugins: [testUtils({ captureOTP: true })],
});

const ctx = await auth.$context;
ctx.test.createUser();

const ctxWithCaptureOTP = await authWithCaptureOTP.$context;
ctxWithCaptureOTP.test.getOTP?.("user@example.com");
