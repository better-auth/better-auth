import type { BetterAuthClientPlugin } from "better-auth";
import type { oTelPlugin } from "./index"; 
 
type OTelPlugin = typeof oTelPlugin;
 
export const oTelClientPlugin = () => {
  return {
    id: "oTelPlugin",
    $InferServerPlugin: {} as ReturnType<OTelPlugin>,
  } satisfies BetterAuthClientPlugin;
};