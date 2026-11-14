import { db } from "@/db/db";
import * as schema from "@/db/schema";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI, twoFactor, genericOAuth } from "better-auth/plugins";
import { sendEmail } from "@/utils/email";

import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

const NAME_PATTERN = /^[A-Za-z0-9]{2,30}$/;

function readCookie(header: string, name: string): string | null {
	for (const part of header.split(";")) {
		const [rawName, ...rest] = part.trim().split("=");
		if (rawName === name && rest.length > 0) {
			return rest.join("=");
		}
	}
	return null;
}

function unsignCookie(signed: string, secret: string): string | null {
	let decoded = signed;
	try {
		decoded = decodeURIComponent(signed);
	} catch {
		decoded = signed;
	}
	const dot = decoded.lastIndexOf(".");
	if (dot <= 0) return null;
	const value = decoded.slice(0, dot);
	const signature = decoded.slice(dot + 1);
	const expected = createHmac("sha256", secret).update(value).digest("base64");
	const actualBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	if (
		actualBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(actualBuffer, expectedBuffer)
	) {
		return null;
	}
	return value;
}

export const auth = betterAuth({
    basePath: "/auth",
	trustedOrigins: (process.env.CORS_ORIGIN || "").split(","),
	appName: "GreenMapper",
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 30,
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user, context) => {
					const path = context?.path ?? "";
					if (!path.includes("sign-up")) {
						return { data: user };
					}
					if (!NAME_PATTERN.test(user.name ?? "")) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Имя должно содержать от 2 до 30 латинских букв или цифр",
						});
					}
					return { data: user };
				},
			},
		},
	},
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: "yandex",
					authorizationUrl: "https://oauth.yandex.ru/authorize",
					tokenUrl: "https://oauth.yandex.ru/token",
					userInfoUrl: "https://login.yandex.ru/info?format=json",
					clientId: process.env.YANDEX_CLIENT_ID || "",
					clientSecret: process.env.YANDEX_CLIENT_SECRET || "",
					pkce: true,
					scopes: ["login:info", "login:email"],

					authorizationUrlParams: {
						prompt: "select_account"
					},

					getUserInfo: async (tokens: any) => {
						try {
							const resp = await fetch("https://login.yandex.ru/info?format=json", {
								method: "GET",
								headers: {
									Authorization: `OAuth ${tokens.accessToken}`
								}
							});
							if (!resp.ok) return null;
							const data = await resp.json();
							// Yandex may return email as `default_email` or `email`
							const email = data.default_email || data.email || null;
							return {
								id: data.id || data.uid || data.domain_user_id || data.sub,
								email,
								emailVerified: !!(data.is_email_confirmed || data.email_confirmed || data.email_verified),
								image: data.avatar_id || data.portrait || null,
								name: data.real_name || data.display_name || data.login || null,
								_raw: data
							};
						} catch (e) {
							console.error("Yandex getUserInfo failed", e);
							return null;
						}
					}
				}
			]
		}),
		openAPI({ path: "/swagger" }),

	],
	advanced: {
		cookiePrefix: "swag",
		disableCSRFCheck: true,
		ipAddress: {
			ipAddressHeaders: ["x-client-ip", "x-forwarded-for"],
			disableIpTracking: false,
		},
	},
	logger: { disabled: process.env.BETTER_AUTH_DISABLE_LOGGER === "true" },
});

export async function handleAuthRequest(request: Request): Promise<Response> { return auth.handler(request); }
