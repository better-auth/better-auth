import { defineErrorCodes } from "better-auth";

export const ELECTRON_ERROR_CODES = defineErrorCodes({
  INVALID_TOKEN: "Invalid or expired token.",
  STATE_MISMATCH: "state mismatch",
  MISSING_CODE_CHALLENGE: "missing code challenge",
  INVALID_CODE_VERIFIER: "Invalid code verifier",
  MISSING_STATE: "state is required",
  MISSING_PKCE: "pkce is required",
});
