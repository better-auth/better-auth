import { AsyncLocalStorage } from "node:async_hooks";

type TenantAsyncContext = {
	tenantId?: string;
};

export const tenantAsyncStore = new AsyncLocalStorage<TenantAsyncContext>();
