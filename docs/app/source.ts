import { docs, meta, versions } from "@/.source";
import { createMDXSource } from "fumadocs-mdx";
import { loader } from "fumadocs-core/source";
import { createOpenAPI } from "fumadocs-openapi/server";

export const source = loader({
  baseUrl: "/docs",
  source: createMDXSource(docs, meta),
});

export const v = loader({
  baseUrl: "/v",
  source: createMDXSource(versions, meta),
});
export const openapi = createOpenAPI({});
