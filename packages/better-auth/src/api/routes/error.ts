import { HIDE_METADATA } from "../../utils/hide-metadata";
import { createAuthEndpoint } from "@better-auth/core/middleware";

function sanitize(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const html = (code: string = "Unknown", description: string | null = null) =>
	`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Error</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          'Helvetica Neue', Arial, sans-serif;
        background: var(--background);
        color: var(--foreground);
        margin: 0;
      }
      :root,
      :host {
        --spacing: 0.25rem;
        --container-md: 28rem;
        --text-sm: 0.875rem;
        --text-sm--line-height: calc(1.25 / 0.875);
        --text-2xl: 1.5rem;
        --text-2xl--line-height: calc(2 / 1.5);
        --text-4xl: 2.25rem;
        --text-4xl--line-height: calc(2.5 / 2.25);
        --text-6xl: 3.75rem;
        --text-6xl--line-height: 1;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;
        --default-transition-duration: 150ms;
        --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        --default-font-family: var(--font-geist-sans);
        --default-mono-font-family: var(--font-geist-mono);
        --radius: 0.625rem;
      }
      :root {
        --background: black;
        --foreground: oklch(0.985 0 0);
        --border: oklch(0.269 0 0);
        --destructive: oklch(0.396 0.141 25.723);
        --muted-foreground: oklch(0.708 0 0);
      }

      button {
        cursor: pointer;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        transition: all var(--default-transition-duration)
          var(--default-transition-timing-function);
      }
      button:hover {
        opacity: 0.8;
      }
    </style>
  </head>
  <body style="width: 100vw; height: 100vh; overflow: hidden;">
    <div
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        position: relative;
        width: 100vw;
        height: 100vh;
      "
    >
      <div
        style="
          position: absolute;
          inset: 0;
          background-image: linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px);
          opacity: 0.5;
          background-size: 24px 24px;
          pointer-events: none;
          width: 100vw;
          height: 100vh;
        "
      ></div>


      <div
        style="
          position: relative;
          z-index: 10;
          border: 2px solid var(--border);
          background: var(--background);
          padding: 3rem;
          max-width: 42rem;
          min-width: 297px;
          width: 100%;
        "
      >
        <!-- Corner decorations -->
        <div
          style="
            position: absolute;
            top: 0;
            left: 0;
            width: 3rem;
            height: 3rem;
            border-top: 4px solid var(--foreground);
            border-left: 4px solid var(--foreground);
          "
        ></div>
        <div
          style="
            position: absolute;
            top: 0;
            right: 0;
            width: 3rem;
            height: 3rem;
            border-top: 4px solid var(--foreground);
            border-right: 4px solid var(--foreground);
          "
        ></div>
        <div
          style="
            position: absolute;
            bottom: 0;
            left: 0;
            width: 3rem;
            height: 3rem;
            border-bottom: 4px solid var(--foreground);
            border-left: 4px solid var(--foreground);
          "
        ></div>
        <div
          style="
            position: absolute;
            bottom: 0;
            right: 0;
            width: 3rem;
            height: 3rem;
            border-bottom: 4px solid var(--foreground);
            border-right: 4px solid var(--foreground);
          "
        ></div>

        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="margin-bottom: 1.5rem;">
            <div
              style="
                display: inline-block;
                border: 2px solid var(--destructive);
                padding: 0.5rem 1.5rem;
              "
            >
              <h1
                style="
                  font-size: var(--text-6xl);
                  font-weight: var(--font-weight-bold);
                  color: var(--foreground);
                  letter-spacing: -0.02em;
                  margin: 0;
                "
              >
                ERROR
              </h1>
            </div>
            <div
              style="
                height: 1px;
                background-color: var(--border);
                width: 100%;
                margin-top: 1rem;
              "
            ></div>
          </div>

          <h2
            style="
              font-size: var(--text-2xl);
              font-weight: var(--font-weight-semibold);
              color: var(--foreground);
              margin: 0 0 1.5rem;
            "
          >
            Something went wrong
          </h2>

          <div
            style="
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                border: 2px solid var(--border);
                background-color: var(--muted);
                padding: 0.5rem 1rem;
                margin: 0 0 1.5rem;
            "
            >
            <span
                style="
                font-size: 0.75rem;
                color: var(--muted-foreground);
                font-weight: var(--font-weight-semibold);
                "
            >
                CODE:
            </span>
            <span
                style="
                font-size: var(--text-sm);
                font-family: var(--default-mono-font-family, monospace);
                color: var(--foreground);
                "
            >
                ${sanitize(code)}
            </span>
            </div>

          <p
            style="
              color: var(--muted-foreground);
              max-width: 28rem;
              margin: 0 auto;
              border-left: 2px solid var(--border);
              padding-left: 1rem;
            "
          >
            ${
							!description
								? "We encountered an unexpected error. Please try again or return to the home page. If you're a developer, you can find more information about the error " +
									`<a href='https://better-auth.com/docs/errors/${encodeURIComponent(sanitize(code))}' target='_blank' style='color: var(--foreground); text-decoration: underline;'>here</a>.`
								: sanitize(description)
						}
          </p>
        </div>

        <div
          style="
            display: flex;
            gap: 1rem;
            margin-top: 2rem;
            justify-content: center;
          "
        >
          <button
            style="
              border: 2px solid var(--border);
              background: var(--foreground);
              color: var(--background);
              padding: 0.5rem 1.25rem;
              border-radius: 0;
            "
          >
            Try again
          </button>
          <button
            style="
              border: 2px solid var(--border);
              background: transparent;
              color: var(--foreground);
              padding: 0.5rem 1.25rem;
              border-radius: 0;
            "
            onclick="window.location.href='/'"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  </body>
</html>`;

export const error = createAuthEndpoint(
	"/error",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			openapi: {
				description: "Displays an error page",
				responses: {
					"200": {
						description: "Success",
						content: {
							"text/html": {
								schema: {
									type: "string",
									description: "The HTML content of the error page",
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const code =
			new URL(c.request?.url || "").searchParams.get("error") || "Unknown";
		const description =
			new URL(c.request?.url || "").searchParams.get("error_description") ||
			null;
		return new Response(html(code, description), {
			headers: {
				"Content-Type": "text/html",
			},
		});
	},
);
