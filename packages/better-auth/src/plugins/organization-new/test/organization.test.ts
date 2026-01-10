import { organization } from "..";
import { accessControl, dynamicAccessControl, teams } from "../addons";

organization({
	use: [teams(), accessControl(), dynamicAccessControl()],
});
