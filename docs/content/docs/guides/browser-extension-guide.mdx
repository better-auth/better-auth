---
title: Browser Extension Guide
description: A step-by-step guide to creating a browser extension with Better Auth.
---

In this guide, we'll walk you through the steps of creating a browser extension using <Link href="https://docs.plasmo.com/">Plasmo</Link> with Better Auth for authentication.

If you would like to view a completed example, you can check out the <Link href="https://github.com/better-auth/examples/tree/main/browser-extension-example">browser extension example</Link>.

<Callout type="warn">
  The Plasmo framework does not provide a backend for the browser extension.
  This guide assumes you have{" "}
  <Link href="/docs/integrations/hono">a backend setup</Link> of Better Auth and
  are ready to create a browser extension to connect to it.
</Callout>

<Steps>

    <Step>
        ## Setup & Installations

        Initialize a new Plasmo project with TailwindCSS and a src directory.

        ```bash
        pnpm create plasmo --with-tailwindcss --with-src
        ```

        Then, install the Better Auth package.

        ```bash
        pnpm add better-auth
        ```

        To start the Plasmo development server, run the following command.

        ```bash
        pnpm dev
        ```
    </Step>


    <Step>
        ## Configure tsconfig

        Configure the `tsconfig.json` file to include `strict` mode.

        For this demo, we have also changed the import alias from `~` to `@` and set it to the `src` directory.

        ```json title="tsconfig.json"
        {
            "compilerOptions": {
                "paths": {
                    "@/_": [
                        "./src/_"
                    ]
                },
                "strict": true,
                "baseUrl": "."
            }
        }
        ```
    </Step>


    <Step>
        ## Create the client auth instance

        Create a new file at `src/auth/auth-client.ts` and add the following code.

       <Files>
            <Folder name="src" defaultOpen>
                <Folder name="auth" defaultOpen>
                    <File name="auth-client.ts" />
                </Folder>
            </Folder>
       </Files>

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/react"

        export const authClient = createAuthClient({
            baseURL: "http://localhost:3000" /* Base URL of your Better Auth backend. */,
            plugins: [],
        });
        ```
    </Step>

    <Step>
        ## Configure the manifest

        We must ensure the extension knows the URL to the Better Auth backend.

        Head to your package.json file, and add the following code.

        ```json title="package.json"
        {
            //...
            "manifest": {
                "host_permissions": [
                    "https://URL_TO_YOUR_BACKEND" // localhost works too (e.g. http://localhost:3000)
                ]
            }
        }
        ```
    </Step>


    <Step>
        ## You're now ready!

        You have now set up Better Auth for your browser extension.

        Add your desired UI and create your dream extension!

        To learn more about the client Better Auth API, check out the <Link href="/docs/concepts/client">client documentation</Link>.


        Here's a quick example 😎

        ```tsx title="src/popup.tsx"
        import { authClient } from "./auth/auth-client"


        function IndexPopup() {
            const {data, isPending, error} = authClient.useSession();
            if(isPending){
                return <>Loading...</>
            }
            if(error){
                return <>Error: {error.message}</>
            }
            if(data){
                return <>Signed in as {data.user.name}</>
            }
        }

        export default IndexPopup;
        ```

    </Step>


    <Step>
        ## Bundle your extension

        To get a production build, run the following command.

        ```bash
        pnpm build
        ```

        Head over to <Link href="chrome://extensions" target="_blank">chrome://extensions</Link> and enable developer mode.

        <img src="https://docs.plasmo.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fdeveloper_mode.76f090f7.png&w=1920&q=75" />

        Click on "Load Unpacked" and navigate to your extension's `build/chrome-mv3-dev` (or `build/chrome-mv3-prod`) directory.

        To see your popup, click on the puzzle piece icon on the Chrome toolbar, and click on your extension.

        Learn more about <Link href="https://docs.plasmo.com/framework#loading-the-extension-in-chrome">bundling your extension here.</Link>
    </Step>

    <Step>
        ## Configure the server auth instance

        First, we will need your extension URL.
        
        An extension URL formed like this: `chrome-extension://YOUR_EXTENSION_ID`.

        You can find your extension ID at <Link href="chrome://extensions" target="_blank">chrome://extensions</Link>.

        <img src="/extension-id.png" width={500} />

        Head to your server's auth file, and make sure that your extension's URL is added to the `trustedOrigins` list.


        ```ts title="server.ts"
        import { betterAuth } from "better-auth"
        import { auth } from "@/auth/auth"

        export const auth = betterAuth({
            trustedOrigins: ["chrome-extension://YOUR_EXTENSION_ID"],
        })
        ```

        If you're developing multiple extensions or need to support different browser extensions with different IDs, you can use wildcard patterns:

        ```ts title="server.ts"
        export const auth = betterAuth({
            trustedOrigins: [
                // Support a specific extension ID
                "chrome-extension://YOUR_EXTENSION_ID",
                
                // Or support multiple extensions with wildcard (less secure)
                "chrome-extension://*"
            ],
        })
        ```

        <Callout type="warn">
          Using wildcards for extension origins (`chrome-extension://*`) reduces security by trusting all extensions. 
          It's safer to explicitly list each extension ID you trust. Only use wildcards for development and testing.
        </Callout>
    </Step>

    <Step>
        ## That's it!

        Everything is set up! You can now start developing your extension. 🎉
    </Step>

</Steps>


## Wrapping Up

Congratulations! You've successfully created a browser extension using Better Auth and Plasmo.
We highly recommend you visit the <Link href="https://docs.plasmo.com/">Plasmo documentation</Link> to learn more about the framework.

If you would like to view a completed example, you can check out the <Link href="https://github.com/better-auth/examples/tree/main/browser-extension-example">browser extension example</Link>.

If you have any questions, feel free to open an issue on our <Link href="https://github.com/better-auth/better-auth/issues">GitHub repo</Link>, or join our <Link href="https://discord.gg/better-auth">Discord server</Link> for support.
