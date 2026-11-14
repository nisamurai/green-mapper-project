import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
console.log(window.location.origin+import.meta.env.VITE_BETTER_AUTH_BASE_URL)
export const authClient = createAuthClient({
	baseURL: window.location.origin+import.meta.env.VITE_BETTER_AUTH_BASE_URL,
	plugins: [twoFactorClient()],
});
