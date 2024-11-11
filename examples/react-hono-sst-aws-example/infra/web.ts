
// run pnpm build dev to create dist folder before deploying with npx sst deploy
const web = new sst.aws.StaticSite("Web", {
    path: "packages/client/dist",
});

export const outputs = {
    web: web.url,
};

// domain: {
//     name: "example.com",
//     dns: false,
//     cert: "arn:aws:acm:us-east-1:<account-id>:certificate/<certificate-id>"
// }