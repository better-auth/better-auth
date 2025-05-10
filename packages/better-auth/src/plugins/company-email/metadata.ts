import type { Endpoint } from "better-call";

const TAGS = ["Company-email"];

export const sendEmailVerificationMetadata: Endpoint["options"]["metadata"] = {
  openapi: {
    tags: TAGS,
    summary: "Send verification email",
    description: "Send verification email to the user's email address",
    operationId: "sendVerificationEmail",
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                required: true,
              },
              callbackUrl: {
                type: "string",
                required: false,
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: "Email sent successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: {
                  type: "boolean",
                },
              },
            },
          },
        },
      },
    },
  },
};

export const verifyEmailMetadata: Endpoint["options"]["metadata"] = {
  openapi: {
    tags: TAGS,
    summary: "Verify email",
    description: "Verify email to the user's email address",
    operationId: "verifyEmail",
    parameters: [
      {
        in: "query",
        name: "token",
        required: true,
        schema: {
          type: "string",
        },
      },
      {
        in: "query",
        name: "redirectTo",
        required: false,
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      200: {
        description: "Email verified successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: {
                  type: "boolean",
                },
              },
            },
          },
        },
      },
    },
  },
};

export const checkCompanyEmailMetadata: Endpoint["options"]["metadata"] = {
  openapi: {
    tags: TAGS,
    summary: "Check company email",
    description: "Check if the email is a company email",
    operationId: "checkCompanyEmail",
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                required: true,
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: "Email is a company email",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: {
                  type: "boolean",
                },
              },
            },
          },
        },
      },
    },
  },
};
