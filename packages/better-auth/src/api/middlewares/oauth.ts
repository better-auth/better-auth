import { defineRequestState } from "@better-auth/core/context";
import z from "zod";

type OauthState = Record<string, any>;

const { get: getOauthState, set: setOauthState } =
	defineRequestState<OauthState>(z.record(z.string(), z.any()));

export { setOauthState, getOauthState };
