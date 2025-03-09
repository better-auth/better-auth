import { HIDE_METADATA } from "../../utils/hide-metadata";
import { createAuthEndpoint } from "../call";

function sanitize(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const html = (errorCode: string = "Unknown") => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        :root {
            --bg-color: #f8f9fa;
            --text-color: #212529;
            --accent-color: #000000;
            --error-color: #dc3545;
            --border-color: #e9ecef;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            line-height: 1.5;
        }
        .error-container {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            padding: 2.5rem;
            text-align: center;
            max-width: 90%;
            width: 400px;
        }
        h1 {
            color: var(--error-color);
            font-size: 1.75rem;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        p {
            margin-bottom: 1.5rem;
            color: #495057;
        }
        .btn {
            background-color: var(--accent-color);
            color: #ffffff;
            text-decoration: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            transition: all 0.3s ease;
            display: inline-block;
            font-weight: 500;
            border: 2px solid var(--accent-color);
        }
        .btn:hover {
            background-color: #131721;
        }
        .error-code {
            font-size: 0.875rem;
            color: #6c757d;
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border-color);
        }
        .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="icon">⚠️</div>
        <h1>Better Auth Error</h1>
        <p>We encountered an issue while processing your request. Please try again or contact the application owner if the problem persists.</p>
        <a href="/" id="returnLink" class="btn">Return to Application</a>
        <div class="error-code">Error Code: <span id="errorCode">${sanitize(
					errorCode,
				)}</span></div>
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
		const query =
			new URL(c.request?.url || "").searchParams.get("error") || "Unknown";
		return new Response(html(query), {
			headers: {
				"Content-Type": "text/html",
			},
		});
	},
);
