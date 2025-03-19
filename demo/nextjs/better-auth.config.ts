import { defineConfig } from "@better-auth/cli";
export default defineConfig({
  config: {
    path: "libs/core/api/src/lib/auth.ts",
  },
  tsConfig: {
    path: "../../tsconfig.json",
  },
});
