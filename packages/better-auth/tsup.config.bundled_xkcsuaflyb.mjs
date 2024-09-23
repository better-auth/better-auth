// tsup.config.ts
import { defineConfig } from "tsup";
var tsup_config_default = defineConfig({
  entry: {
    index: "./src/index.ts",
    social: "./src/social-providers/index.ts",
    types: "./src/types/index.ts",
    client: "./src/client/index.ts",
    cli: "./src/cli/index.ts",
    react: "./src/client/react.ts",
    vue: "./src/client/vue.ts",
    svelte: "./src/client/svelte.ts",
    solid: "./src/client/solid.ts",
    plugins: "./src/plugins/index.ts",
    "client/plugins": "./src/client/plugins/index.ts",
    "svelte-kit": "./src/integrations/svelte-kit.ts",
    access: "./src/plugins/organization/access/index.ts",
    "solid-start": "./src/integrations/solid-start.ts",
    "next-js": "./src/integrations/next-js.ts",
    node: "./src/integrations/node.ts"
  },
  splitting: false,
  sourcemap: true,
  format: ["esm"],
  dts: true,
  external: [
    "react",
    "svelte",
    "solid-js",
    "$app/environment",
    "next",
    "mysql2",
    "pg",
    "typescript",
    "oslo",
    "@node-rs/argon2",
    "@node-rs/bcrypt",
    "better-sqlite3",
    "@babel/core",
    "commander",
    "chalk",
    "@babel/preset-typescript",
    "@babel/preset-react"
  ],
  skipNodeModulesBundle: true,
  noExternal: ["arctic"],
  target: "es2022"
});
export {
  tsup_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHN1cC5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9faW5qZWN0ZWRfZmlsZW5hbWVfXyA9IFwiL1VzZXJzL2Jla2EvRGVza3RvcC9EZXZlbG9wbWVudC9iZXR0ZXItYXV0aC9wYWNrYWdlcy9iZXR0ZXItYXV0aC90c3VwLmNvbmZpZy50c1wiO2NvbnN0IF9faW5qZWN0ZWRfZGlybmFtZV9fID0gXCIvVXNlcnMvYmVrYS9EZXNrdG9wL0RldmVsb3BtZW50L2JldHRlci1hdXRoL3BhY2thZ2VzL2JldHRlci1hdXRoXCI7Y29uc3QgX19pbmplY3RlZF9pbXBvcnRfbWV0YV91cmxfXyA9IFwiZmlsZTovLy9Vc2Vycy9iZWthL0Rlc2t0b3AvRGV2ZWxvcG1lbnQvYmV0dGVyLWF1dGgvcGFja2FnZXMvYmV0dGVyLWF1dGgvdHN1cC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidHN1cFwiO1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcblx0ZW50cnk6IHtcblx0XHRpbmRleDogXCIuL3NyYy9pbmRleC50c1wiLFxuXHRcdHNvY2lhbDogXCIuL3NyYy9zb2NpYWwtcHJvdmlkZXJzL2luZGV4LnRzXCIsXG5cdFx0dHlwZXM6IFwiLi9zcmMvdHlwZXMvaW5kZXgudHNcIixcblx0XHRjbGllbnQ6IFwiLi9zcmMvY2xpZW50L2luZGV4LnRzXCIsXG5cdFx0Y2xpOiBcIi4vc3JjL2NsaS9pbmRleC50c1wiLFxuXHRcdHJlYWN0OiBcIi4vc3JjL2NsaWVudC9yZWFjdC50c1wiLFxuXHRcdHZ1ZTogXCIuL3NyYy9jbGllbnQvdnVlLnRzXCIsXG5cdFx0c3ZlbHRlOiBcIi4vc3JjL2NsaWVudC9zdmVsdGUudHNcIixcblx0XHRzb2xpZDogXCIuL3NyYy9jbGllbnQvc29saWQudHNcIixcblx0XHRwbHVnaW5zOiBcIi4vc3JjL3BsdWdpbnMvaW5kZXgudHNcIixcblx0XHRcImNsaWVudC9wbHVnaW5zXCI6IFwiLi9zcmMvY2xpZW50L3BsdWdpbnMvaW5kZXgudHNcIixcblx0XHRcInN2ZWx0ZS1raXRcIjogXCIuL3NyYy9pbnRlZ3JhdGlvbnMvc3ZlbHRlLWtpdC50c1wiLFxuXHRcdGFjY2VzczogXCIuL3NyYy9wbHVnaW5zL29yZ2FuaXphdGlvbi9hY2Nlc3MvaW5kZXgudHNcIixcblx0XHRcInNvbGlkLXN0YXJ0XCI6IFwiLi9zcmMvaW50ZWdyYXRpb25zL3NvbGlkLXN0YXJ0LnRzXCIsXG5cdFx0XCJuZXh0LWpzXCI6IFwiLi9zcmMvaW50ZWdyYXRpb25zL25leHQtanMudHNcIixcblx0XHRub2RlOiBcIi4vc3JjL2ludGVncmF0aW9ucy9ub2RlLnRzXCIsXG5cdH0sXG5cdHNwbGl0dGluZzogZmFsc2UsXG5cdHNvdXJjZW1hcDogdHJ1ZSxcblx0Zm9ybWF0OiBbXCJlc21cIl0sXG5cdGR0czogdHJ1ZSxcblx0ZXh0ZXJuYWw6IFtcblx0XHRcInJlYWN0XCIsXG5cdFx0XCJzdmVsdGVcIixcblx0XHRcInNvbGlkLWpzXCIsXG5cdFx0XCIkYXBwL2Vudmlyb25tZW50XCIsXG5cdFx0XCJuZXh0XCIsXG5cdFx0XCJteXNxbDJcIixcblx0XHRcInBnXCIsXG5cdFx0XCJ0eXBlc2NyaXB0XCIsXG5cdFx0XCJvc2xvXCIsXG5cdFx0XCJAbm9kZS1ycy9hcmdvbjJcIixcblx0XHRcIkBub2RlLXJzL2JjcnlwdFwiLFxuXHRcdFwiYmV0dGVyLXNxbGl0ZTNcIixcblx0XHRcIkBiYWJlbC9jb3JlXCIsXG5cdFx0XCJjb21tYW5kZXJcIixcblx0XHRcImNoYWxrXCIsXG5cdFx0XCJAYmFiZWwvcHJlc2V0LXR5cGVzY3JpcHRcIixcblx0XHRcIkBiYWJlbC9wcmVzZXQtcmVhY3RcIixcblx0XSxcblx0c2tpcE5vZGVNb2R1bGVzQnVuZGxlOiB0cnVlLFxuXHRub0V4dGVybmFsOiBbXCJhcmN0aWNcIl0sXG5cdHRhcmdldDogXCJlczIwMjJcIixcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE4VSxTQUFTLG9CQUFvQjtBQUMzVyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMzQixPQUFPO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxRQUFRO0FBQUEsSUFDUixLQUFLO0FBQUEsSUFDTCxPQUFPO0FBQUEsSUFDUCxLQUFLO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxTQUFTO0FBQUEsSUFDVCxrQkFBa0I7QUFBQSxJQUNsQixjQUFjO0FBQUEsSUFDZCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsSUFDZixXQUFXO0FBQUEsSUFDWCxNQUFNO0FBQUEsRUFDUDtBQUFBLEVBQ0EsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsUUFBUSxDQUFDLEtBQUs7QUFBQSxFQUNkLEtBQUs7QUFBQSxFQUNMLFVBQVU7QUFBQSxJQUNUO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFBQSxFQUNBLHVCQUF1QjtBQUFBLEVBQ3ZCLFlBQVksQ0FBQyxRQUFRO0FBQUEsRUFDckIsUUFBUTtBQUNULENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
