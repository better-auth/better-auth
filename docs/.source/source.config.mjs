// source.config.ts
import {
  defineCollections,
  defineDocs
} from "fumadocs-mdx/config";
import { defineConfig } from "fumadocs-mdx/config";
import { remarkInstall } from "fumadocs-docgen";
import { z } from "zod";
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [
        remarkInstall,
        {
          persist: {
            id: "persist-install"
          }
        }
      ]
    ]
  }
});
var changelog = defineCollections({
  type: "doc",
  dir: "./content/changelog",
  schema: z.object({
    title: z.string()
  })
});
var { docs, meta } = defineDocs({
  dir: "./content/docs"
});
export {
  changelog,
  source_config_default as default,
  docs,
  meta
};
