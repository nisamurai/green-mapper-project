import { handleAuthRequest } from "@/utils/auth";
import { createBucketInNotExist } from "@/utils/minio";
import { Elysia } from "elysia";
import { swaggerMiddleware } from "./middleware/swagger";
import { cors } from "@elysiajs/cors";
import { reportsRouter } from "./routes/reports";
import { usersRouter } from "./routes/users";
import * as Minio from 'minio';
import { rabbitMQ } from "./utils/rabbitmq";
export const minioClient = new Minio.Client({
  endPoint: process.env.IN_CONTAINER ? "minio" : 'localhost', // IP or hostname
  port: 9000,
  useSSL: false, 
  accessKey: process.env.MINIO_ROOT_USER, 
  secretKey: process.env.MINIO_ROOT_PASSWORD
});

const signInSocialHandler = async (ctx: any) => {
	try {
		const readPayload = async () => {
			const body = ctx.body as any;

			if (body && typeof body === "object") {
				return body;
			}

			const textBody = await ctx.request.clone().text();
			if (!textBody) {
				return {};
			}

			try {
				return JSON.parse(textBody);
			} catch {
				const params = new URLSearchParams(textBody);
				return Object.fromEntries(params.entries());
			}
		};

		const requestUrl = new URL(ctx.request.url);
		const queryProvider = requestUrl.searchParams.get("provider") || requestUrl.searchParams.get("providerId");
		const queryCallbackURL =
			requestUrl.searchParams.get("callbackURL") ||
			requestUrl.searchParams.get("redirectUrl") ||
			requestUrl.searchParams.get("redirect_uri");

		const rawBody = await readPayload();
		const provider =
			queryProvider ||
			ctx?.query?.provider ||
			ctx?.query?.providerId ||
			rawBody?.provider ||
			rawBody?.providerId ||
			rawBody?.data?.provider ||
			rawBody?.data?.providerId;
		const callbackURL =
			queryCallbackURL ||
			ctx?.query?.callbackURL ||
			ctx?.query?.redirectUrl ||
			ctx?.query?.redirect_uri ||
			rawBody?.callbackURL ||
			rawBody?.redirectUrl ||
			rawBody?.redirect_uri ||
			rawBody?.data?.callbackURL ||
			rawBody?.data?.redirectUrl ||
			rawBody?.data?.redirect_uri;
		if (!provider) {
			return new Response(JSON.stringify({ error: "Missing provider" }), { status: 400 });
		}
		if (provider !== "yandex") {
			return new Response(JSON.stringify({ error: "Unsupported provider" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		const mapped = {
			providerId: provider,
			...(callbackURL ? { callbackURL } : {}),
		};

		const forwardHeaders: Record<string, string> = { "Content-Type": "application/json" };
		if (ctx.headers?.origin) forwardHeaders.origin = String(ctx.headers.origin);
		if (ctx.headers?.referer) forwardHeaders.referer = String(ctx.headers.referer);
		if (ctx.headers?.cookie) forwardHeaders.cookie = String(ctx.headers.cookie);

		const internalAuthBase = process.env.IN_CONTAINER ? "http://127.0.0.1:3000" : "http://localhost:3000";
		const resp = await fetch(`${internalAuthBase}/auth/sign-in/oauth2`, {
			method: "POST",
			headers: forwardHeaders,
			body: JSON.stringify(mapped),
			redirect: "manual",
		});

		const contentType = resp.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			const cloned = resp.clone();
			const payload = await cloned.json().catch(() => null);
			if (payload?.redirect && payload?.url) {
				const headers = new Headers();
				headers.set("Location", payload.url);
				const setCookie = resp.headers.get("set-cookie");
				if (setCookie) {
					headers.set("set-cookie", setCookie);
				}
				return new Response(null, {
					status: 302,
					headers,
				});
			}
		}

		return new Response(resp.body, {
			status: resp.status,
			headers: resp.headers,
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
	}
};

const app = new Elysia()
	.use(
		cors({
			origin: (process.env.CORS_ORIGIN || "").split(","),
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
		}),
	)
	.get("/health", async () => {
		return {status: "ok"}
	})
	.get("/social-sign-in", signInSocialHandler)
	.post("/social-sign-in", signInSocialHandler)
	.use(swaggerMiddleware)
	.mount(handleAuthRequest)
	.post("/auth/sign-in/social", signInSocialHandler)
	.post("/api/auth/sign-in/social", signInSocialHandler)
	.use(usersRouter)
	.use(reportsRouter)
	.listen({
		hostname: "0.0.0.0",
		port: 3000
	});

console.log(`Started at ${app.server?.hostname}:${app.server?.port}`);

async function initServices(attempt = 1) {
	try {
		await createBucketInNotExist()
		await rabbitMQ.connect();
	} catch (error) {
		const delayMs = 5000;
		console.error(`Failed to initialize services (attempt ${attempt}), retry in ${delayMs}ms:`, error);
		setTimeout(() => {
			void initServices(attempt + 1);
		}, delayMs);
	}
}

setTimeout(() => {
	void initServices();
}, Number(process.env.RABBITMQ_DELAY_SECONDS || "0") * 1000)

