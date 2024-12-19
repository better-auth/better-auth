export type TurnstileResponse =
	| {
			success: true;
			"error-codes"?: string[];
			challenge_ts?: string;
			hostname?: string;
			action?: string;
			cdata?: string;
			metadata?: {
				interactive: boolean;
			};
			messages?: string[];
	  }
	| {
			success: false;
			"error-codes": string[];
			messages: string[];
	  };
