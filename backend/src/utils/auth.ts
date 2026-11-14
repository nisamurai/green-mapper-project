import { db } from "@/db/db";
import * as schema from "@/db/schema";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI, twoFactor, genericOAuth } from "better-auth/plugins";
import { sendEmail } from "@/utils/email";
import { tryReserveOtpSend } from "@/utils/otp-cooldown";
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

async function otpCooldownKey(request: Request): Promise<string | null> {
	const secret = process.env.BETTER_AUTH_SECRET;
	const header = request.headers.get("cookie") ?? "";
	const cookie =
		readCookie(header, "swag.two_factor") ??
		readCookie(header, "__Secure-swag.two_factor");
	if (!cookie) return null;
	if (!secret) return `cookie:${cookie}`;
	const identifier = unsignCookie(cookie, secret);
	if (!identifier) return `cookie:${cookie}`;
	const row = await db.query.verification.findFirst({
		where: eq(schema.verification.identifier, identifier),
		columns: { value: true },
	});
	return row?.value ? `user:${row.value}` : `cookie:${cookie}`;
}

function isSendOtpRequest(request: Request) {
	if (request.method !== "POST") return false;
	const pathname = new URL(request.url).pathname;
	return pathname.endsWith("/two-factor/send-otp");
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
		twoFactor({
			skipVerificationOnEnable: true,
			otpOptions: {
				digits: 6,
				// В Better Auth 1.2 это поле задаётся в минутах и одновременно
				// попадает в срок cookie ожидания входа как число секунд.
				// Значение по умолчанию — 3 минуты, то есть код живёт 180 секунд.
				async sendOTP({ user, otp }) {
					void sendEmail({
						to: user.email,
						subject: "GreenMapper: Код подтверждения входа",
						text: `Ваш код подтверждения: ${otp}`,
					}).catch((err) => {
						console.error("Failed to send 2FA OTP email", err);
					});
				},
			},
		}),
	],
	advanced: {
		cookiePrefix: "swag",
		disableCSRFCheck: true,
		ipAddress: {
			ipAddressHeaders: ["x-client-ip", "x-forwarded-for"],
			disableIpTracking: false,
		},
	},
	rateLimit: { enabled: true, max: 5, window: 10, storage: "memory" },
	logger: { disabled: process.env.BETTER_AUTH_DISABLE_LOGGER === "true" },
});

const guardedOtpRequests = new WeakSet<Request>();

export async function handleAuthRequest(request: Request): Promise<Response> {
	if (guardedOtpRequests.has(request)) {
		return auth.handler(request);
	}
	guardedOtpRequests.add(request);

	if (isSendOtpRequest(request)) {
		try {
			const key = await otpCooldownKey(request);
			if (key) {
				const decision = tryReserveOtpSend(key);
				if (!decision.ok) {
					return new Response(
						JSON.stringify({
							message: "Повторный код можно запросить через минуту",
							retryAfterSeconds: decision.retryAfterSeconds,
						}),
						{
							status: 429,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
			}
		} catch (error) {
			console.error("OTP cooldown check failed", error);
		}
	}

	return auth.handler(request);
}
