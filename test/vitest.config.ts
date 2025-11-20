import { defineProject } from "vitest/config";

export default defineProject({
  ssr: {
    resolve: {
      // we resolve from source files for unit testing
      conditions: ["dev-source"],
    },
  },
});
