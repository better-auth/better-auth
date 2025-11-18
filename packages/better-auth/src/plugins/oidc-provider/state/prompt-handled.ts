import { defineRequestState } from "@better-auth/core/context";

const { get, set } = defineRequestState(() => false);

export { get as getPromptHandled, set as setPromptHandled };
