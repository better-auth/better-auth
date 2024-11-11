import { allSecrets } from "./secrets";
const hono = new sst.aws.Function("Hono", {
    url: {
        cors: {
            allowOrigins: [
                "http://localhost:5173"
            ],
            allowMethods: ["GET", "POST", "PUT", "DELETE"],
            allowHeaders: ["Content-Type", "Authorization"],
            allowCredentials: true,
            maxAge: "600 seconds",
            exposeHeaders: ["Content-Length"],
        }
    },
    handler: "packages/server/index.handler",
    link: allSecrets,
});

export const outputs = {
    hono: hono.url,
};

// aws cloudfront url https://RandomID.cloudfront.net/
// aws namecheap domain url https://example.com/