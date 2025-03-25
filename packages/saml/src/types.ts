import { type User } from "../../better-auth/src";
import { z } from "zod";

export interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  cert: string;
  callbackUrl: string;
  wantAssertionsSigned?: boolean;
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
  identifierFormat?: string;
  privateKey?: string;
  decryptionPvk?: string;
  additionalParams?: Record<string, string>;
}

export interface SSOProvider {
  id: string;
  issuer: string;
  samlConfig: SAMLConfig;
  userId: string;
  providerId: string;
  organizationId?: string;
}

export interface SSOOptions {
  provisionUser?: (data: {
    user: User & Record<string, any>;
    userInfo: Record<string, any>;
    token: SAMLAssertion;
    provider: SSOProvider;
  }) => Promise<void>;
  organizationProvisioning?: {
    disabled?: boolean;
    defaultRole?: "member" | "admin";
    getRole?: (data: {
      user: User & Record<string, any>;
      userInfo: Record<string, any>;
      token: SAMLAssertion;
      provider: SSOProvider;
    }) => Promise<"member" | "admin">;
  };
}

export interface SAMLAssertion {
  nameID: string;
  sessionIndex?: string;
  attributes: Record<string, any>;
}

export const SAMLConfigSchema = z.object({
  entryPoint: z.string(),
  providerId: z.string(),
  issuer: z.string(),
  cert: z.string(),
  callbackUrl: z.string(),
  idpMetadata: z.string(),
  spMetadata: z.string(),
  wantAssertionsSigned: z.boolean().optional(),
  signatureAlgorithm: z.string().optional(),
  digestAlgorithm: z.string().optional(),
  identifierFormat: z.string().optional(),
  privateKey: z.string().optional(),
  decryptionPvk: z.string().optional(),
  additionalParams: z.record(z.string()).optional(),
});


