import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/plugins";

// oTel Imports 
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from "@opentelemetry/sdk-metrics";
 
export const oTelPlugin = ()=>{
    return {
        id: "oTelPlugin",
        hooks: {
            before: [
              {
                matcher: (context) => context.path.startsWith("/"),
                handler: createAuthMiddleware(async (ctx) => {
                  console.log("[#BETTER_AUTH:OTEL-Plugin] oTel has initialized");
                  const sdk = new NodeSDK({
                    traceExporter: new ConsoleSpanExporter(),
                    metricReader: new PeriodicExportingMetricReader({
                      exporter: new ConsoleMetricExporter(),
                    }),
                    instrumentations: [getNodeAutoInstrumentations()],
                  });
                  
                  sdk.start();
                }),
              },
            ],
        },
    } satisfies BetterAuthPlugin
}