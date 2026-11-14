import { auth, handleAuthRequest } from "@/utils/auth";
import { db } from "@/db/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import Elysia from "elysia";

function checkServicePass(headers: Headers) {
	const key = headers.get("x-service-key")
	if(key && key === process.env.BETTER_AUTH_SECRET) {
		return {
		user: undefined,
		session: undefined,
		serviceRequest: true
		};
	}
	return null
}

export const authMiddleware = new Elysia({ name: "better-auth" })
	.mount(handleAuthRequest)
	.macro({
		auth: {
			async resolve({ status, request: { headers } }) {
				const check = checkServicePass(headers)
				if(check) return check

				const session = await auth.api.getSession({
					headers,
				});

				if (!session) return status(401);
				
                const fullUser = await db.query.user.findFirst({
					where: eq(schema.user.id, session.user.id),
                });
				if (!fullUser) return status(401);

				return {
					user: fullUser,
					session: session.session,
					serviceRequest: false
				};
			},
		},
		partialAuth: {
			async resolve({ status, request: { headers } }) {
				const check = checkServicePass(headers)
				if(check) return check

				const session = await auth.api.getSession({
					headers,
				});

				if (!session) return {
					user: undefined,
					session: undefined,
					serviceRequest: false
				};
				
                const fullUser = await db.query.user.findFirst({
					where: eq(schema.user.id, session.user.id),
                });
				
				return {
					user: fullUser,
					session: session.session,
					serviceRequest: false
				};
			},
		}
	});
