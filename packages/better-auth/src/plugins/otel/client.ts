import type { BetterAuthClientPlugin } from "better-auth";
import type { oTelPlugin } from "./index"; 
 
type oTelPlugin = typeof oTelPlugin;
 
export const oTelClientPlugin = () => {
  return {
    id: "oTelPlugin",
    $InferServerPlugin: {} as ReturnType<oTelPlugin>,
  } satisfies BetterAuthClientPlugin;
};