import { type BetterAuthClientPlugin } from "../../client";

import type { companyEmail } from "./plugin";

export const companyEmailClient = () => {
  return {
    id: "company-email",
    $InferServerPlugin: {} as ReturnType<typeof companyEmail>,
  } satisfies BetterAuthClientPlugin;
};
