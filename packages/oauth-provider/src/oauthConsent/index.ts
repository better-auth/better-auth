import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import type { OAuthOptions, Scope } from "../types";
import {
	deleteConsentEndpoint,
	getConsentEndpoint,
	getConsentsEndpoint,
	updateConsentEndpoint,
} from "./endpoints";

export const getOAuthConsent = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/oauth2/get-consent",
		{
			method: "GET",
			query: z.object({
				id: z.string(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Gets details of a specific OAuth2 consent for a user",
				},
			},
		},
		async (ctx) => {
			return getConsentEndpoint(ctx, opts);
		},
	);

export const getOAuthConsents = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/oauth2/get-consents",
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Gets all available OAuth2 consents for a user",
				},
			},
		},
		async (ctx) => {
			return getConsentsEndpoint(ctx, opts);
		},
	);

export const updateOAuthConsent = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/oauth2/update-consent",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: z.object({
				id: z.string(),
				update: z.object({
					scopes: z.array(z.string()),
				}),
			}),
			metadata: {
				openapi: {
					description: "Updates consent granted to a client.",
				},
			},
		},
		async (ctx) => {
			return updateConsentEndpoint(ctx, opts);
		},
	);

export const deleteOAuthConsent = (opts: OAuthOptions<Scope[]>) =>
	createAuthEndpoint(
		"/oauth2/delete-consent",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: z.object({
				id: z.string(),
			}),
			metadata: {
				openapi: {
					description: "Deletes consent granted to a client",
				},
			},
		},
		async (ctx) => {
			return deleteConsentEndpoint(ctx, opts);
		},
	);
