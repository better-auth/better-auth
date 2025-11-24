import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { InferAsset, InferAssetRole, InferAssetType } from "./schema";
import type { AssetPlugin } from "./assets";

interface AssetClientOptions {
	schema?: {
		assetType?: {
			additionalFields?: {
				[key: string]: DBFieldAttribute;
			};
		};
		asset?: {
			additionalFields?: {
				[key: string]: DBFieldAttribute;
			};
		};
		assetRole?: {
			additionalFields?: {
				[key: string]: DBFieldAttribute;
			};
		};
		memberAssetRole?: {
			additionalFields?: {
				[key: string]: DBFieldAttribute;
			};
		};
	};
}

export const assetsClient = <CO extends AssetClientOptions>(
	options?: CO | undefined,
) => {
	type Schema = CO["schema"];
	return {
		id: "assets",
		$InferServerPlugin: {} as AssetPlugin<{
			schema: Schema;
		}>,
		getActions: ($fetch, _$store, co) => ({
			$Infer: {
				Asset: {} as InferAsset<CO, false>,
				AssetType: {} as InferAssetType<CO, false>,
				AssetRole: {} as InferAssetRole<CO, false>,
			},
			assets: {},
		}),
	} satisfies BetterAuthClientPlugin;
};
