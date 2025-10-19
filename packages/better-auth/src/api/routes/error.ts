import { HIDE_METADATA } from "../../utils/hide-metadata";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthOptions } from "@better-auth/core";

function sanitize(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const html = (
	options: BetterAuthOptions,
	code: string = "Unknown",
	description: string | null = null,
) => {
	const custom = options.onAPIError?.customizeDefaultErrorPage;
	return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Error</title>
    <style>
      body {
        font-family: ${custom?.font?.defaultFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"};
        background: ${custom?.colors?.background || "var(--background)"};
        color: var(--foreground);
        margin: 0;
      }
      :root,
      :host {
        --spacing: 0.25rem;
        --container-md: 28rem;
        --text-sm: ${custom?.size?.textSm || "0.875rem"};
        --text-sm--line-height: calc(1.25 / 0.875);
        --text-2xl: ${custom?.size?.text2xl || "1.5rem"};
        --text-2xl--line-height: calc(2 / 1.5);
        --text-4xl: ${custom?.size?.text4xl || "2.25rem"};
        --text-4xl--line-height: calc(2.5 / 2.25);
        --text-6xl: ${custom?.size?.text6xl || "3.75rem"};
        --text-6xl--line-height: 1;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;
        --default-transition-duration: 150ms;
        --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        --radius: ${custom?.size?.radiusSm || "0.625rem"};
        --default-mono-font-family: ${custom?.font?.monoFamily || "var(--font-geist-mono)"};
      }
      :root {
        --primary: ${custom?.colors?.primary || "white"};
        --primary-foreground: ${custom?.colors?.primaryForeground || "black"};
        --background: ${custom?.colors?.background || "black"};
        --foreground: ${custom?.colors?.foreground || "oklch(0.985 0 0)"};
        --border: ${custom?.colors?.border || "oklch(0.269 0 0)"};
        --destructive: ${custom?.colors?.destructive || "oklch(0.396 0.141 25.723)"};
        --muted-foreground: ${custom?.colors?.mutedForeground || "oklch(0.708 0 0)"};
        --corner-border: ${custom?.colors?.cornerBorder || "#BFBFBF"};
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
${
	custom?.disableBackgroundGrid
		? ""
		: `
      <div
        style="
          position: absolute;
          inset: 0;
          background-image: linear-gradient(to right, ${custom?.colors?.gridColor || "var(--border)"} 1px, transparent 1px),
            linear-gradient(to bottom, ${custom?.colors?.gridColor || "var(--border)"} 1px, transparent 1px);
          opacity: 0.5;
          background-size: 24px 24px;
          pointer-events: none;
          width: 100vw;
          height: 100vh;
        "
      ></div>
`
}

<div
  style="
    position: relative;
    z-index: 10;
    border: 2px solid var(--border);
    background: ${custom?.colors?.cardBackground || "var(--background)"};
    padding: 3rem;
    max-width: 42rem;
    min-width: 297px;
    width: 100%;
  "
>
    ${
			custom?.disabledCornerDecorations
				? ""
				: `
        <!-- Corner decorations -->
        <div
          style="
            position: absolute;
            top: -2px;
            left: -2px;
            width: 3rem;
            height: 3rem;
            border-top: 4px solid var(--corner-border);
            border-left: 4px solid var(--corner-border);
          "
        ></div>
        <div
          style="
            position: absolute;
            top: -2px;
            right: -2px;
            width: 3rem;
            height: 3rem;
            border-top: 4px solid var(--corner-border);
            border-right: 4px solid var(--corner-border);
          "
        ></div>
  
        <div
          style="
            position: absolute;
            bottom: -2px;
            left: -2px;
            width: 3rem;
            height: 3rem;
            border-bottom: 4px solid var(--corner-border);
            border-left: 4px solid var(--corner-border);
          "
        ></div>
        <div
          style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 3rem;
            height: 3rem;
            border-bottom: 4px solid var(--corner-border);
            border-right: 4px solid var(--corner-border);
          "
        ></div>`
		}

        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="margin-bottom: 1.5rem;">
            <div
              style="
                display: inline-block;
                border: 2px solid ${custom?.colors?.titleBoarder || "var(--destructive)"};
                padding: 0.5rem 1.5rem;
              "
            >
              <h1
                style="
                  font-size: var(--text-6xl);
                  font-weight: var(--font-weight-bold);
                  color: ${custom?.colors?.titleColor || "var(--foreground)"};
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
									`<a href='https://better-auth.com/docs/errors/${encodeURIComponent(code)}' target='_blank' style='color: var(--foreground); text-decoration: underline;'>here</a>.`
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
          <a href="/">
            <button
              style="
                border: 2px solid var(--border);
                background: var(--primary);
                color: var(--primary-foreground);
                padding: 0.5rem 1.25rem;
                border-radius: 0;
              "
            >
              Go Home
            </button>
          </a>
          <a href="https://better-auth.com/docs/errors/${encodeURIComponent(code)}?askai=${encodeURIComponent(`What does the error code ${code} mean?`)}" target="_blank">
            <button
              style="
                border: 2px solid var(--border);
                background: transparent;
                color: var(--foreground);
                padding: 0.5rem 1.25rem;
                border-radius: 0;
              "
            >
              Ask AI
            </button>
          </a>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

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
		return new Response(html(c.context.options, code, description), {
			headers: {
				"Content-Type": "text/html",
			},
		});
	},
);
