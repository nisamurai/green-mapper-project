import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import "dotenv/config";
import { db } from "@/db/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Интеграционный тест для пользовательской истории #1:
 * "Как пользователь, я хочу авторизоваться и создавать заявку на карте 
 * с указанием адреса, координат и типа проблемы, чтобы фиксировать проблему в системе."
 * 
 * Этот тест проверяет полный цикл:
 * 1. Регистрация/авторизация пользователя
 * 2. Создание заявки с валидными данными (адрес, координаты, тип)
 * 3. Проверка сохранения заявки в БД
 * 4. Валидация обязательных полей
 */
describe("User Story: Авторизация и создание заявки", () => {
    const TEST_EMAIL = "user-story-1@example.com";
    const TEST_PASSWORD = "testpassword123";
    const TEST_NAME = "User Story 1 Test User";

    let serverUrl: string;
    let testUserId: string | null = null;
    let authCookie: string | null = null;

    beforeAll(async () => {
        serverUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

        const signUpRes = await fetch(`${serverUrl}/auth/sign-up/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME }),
        });

        const signUpBodyText = await signUpRes.text();
        
        if (![200, 201, 409].includes(signUpRes.status)) {
            throw new Error(`Sign-up failed: ${signUpRes.status} ${signUpBodyText.slice(0, 500)}`);
        }

        let signUpJson: any = null;
        try {
            signUpJson = JSON.parse(signUpBodyText);
        } catch {
            signUpJson = null;
        }

        if (signUpJson && signUpJson.user && signUpJson.user.id) {
            testUserId = String(signUpJson.user.id);
        } else if (signUpJson && signUpJson.id) {
            testUserId = String(signUpJson.id);
        }

        const signInRes = await fetch(`${serverUrl}/auth/sign-in/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });

        if (signInRes.status !== 200) {
            const signInBody = await signInRes.text();
            throw new Error(`Sign-in failed: ${signInRes.status} ${signInBody.slice(0, 500)}`);
        }

        // Извлекаем cookie из ответа (Better Auth устанавливает set-cookie)
        const setCookie = signInRes.headers.get("set-cookie");
        if (setCookie) {
            authCookie = setCookie.split(";")[0];
        } else {
            console.warn(" Sign-in did not return set-cookie header; subsequent requests may fail");
        }

        if (!testUserId) {
            try {
                const signInJson = await signInRes.json();
                if (signInJson && signInJson.user && signInJson.user.id) {
                    testUserId = String(signInJson.user.id);
                }
            } catch {}
        }
    });

    afterAll(async () => {
        if (!testUserId) return;  // Если testUserId не получен — ничего не удаляем
        
        // Удаляем в правильном порядке (внешние ключи сначала)
        await db.delete(schema.issues).where(eq(schema.issues.userId, testUserId)).execute().catch(() => {});
        await db.delete(schema.session).where(eq(schema.session.userId, testUserId)).execute().catch(() => {});
        await db.delete(schema.account).where(eq(schema.account.userId, testUserId)).execute().catch(() => {});
        await db.delete(schema.user).where(eq(schema.user.id, testUserId)).execute().catch(() => {});
    });

    it("должен успешно авторизоваться с валидными учетными данными", async () => {
        const signInRes = await fetch(`${serverUrl}/auth/sign-in/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });

        expect(signInRes.status).toBe(200);

        const setCookie = signInRes.headers.get("set-cookie");
        expect(setCookie).toBeTruthy();
        if (setCookie) {
            authCookie = setCookie.split(";")[0];
        }

        const signInJson = await signInRes.json();
        expect(signInJson).toBeTruthy();
        expect(signInJson.user).toBeTruthy();
        expect(signInJson.user.email).toBe(TEST_EMAIL);

        // Сохраняем userId, если еще не сохранен
        if (!testUserId && signInJson.user.id) {
            testUserId = String(signInJson.user.id);
        }
    });

    it("должен создать заявку с валидными данными (адрес, координаты, тип)", async () => {
        expect(authCookie).toBeTruthy();

        const payload = {
            latitude: "59.93863",
            longitude: "30.31413",
            typeId: 1,
            shortDescription: "Краткое описание проблемы",
            detailedDescription: "Подробное описание",
            address: "ул. Примерная, 1",
        };

        const createRes = await fetch(`${serverUrl}/reports/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: authCookie ?? "",
            },
            body: JSON.stringify(payload),
        });

        expect(createRes.status).toBe(201);

        const createdJson: any = await createRes.json();
        const issueId = createdJson.issueId ?? createdJson.id ?? (createdJson.issue?.issueId);
        expect(issueId).toBeTruthy();

        // Проверяем в БД
        const [dbIssue] = await db.select().from(schema.issues).where(eq(schema.issues.issueId, issueId)).execute();
        expect(dbIssue).toBeTruthy();
        expect(dbIssue.shortDescription).toBe(payload.shortDescription);
        expect(dbIssue.address).toBe(payload.address);
        expect(String(dbIssue.userId)).toBe(String(testUserId));
    });

    it("должен вернуть ошибку при создании заявки без обязательных полей", async () => {
        expect(authCookie).toBeTruthy();

        async function postAndExpectBad(body: any, missingFieldName: string) {
            const res = await fetch(`${serverUrl}/reports/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: authCookie ?? "",
                },
                body: JSON.stringify(body),
            });
            // expect(res.status).toBe(422); // Ожидаем ошибку валидации
            expect([400, 422]).toContain(res.status);
            let json: any = {};
            try {
                json = await res.json();
            } catch {}
            // Ожидаем сообщение об ошибке, содержащее имя отсутствующего поля
            const message = JSON.stringify(json);
            expect(message.toLowerCase()).toContain(missingFieldName.toLowerCase());
        }

        const base = {
            latitude: "59.93863",
            longitude: "30.31413",
            typeId: 1,
            shortDescription: "Краткое",
            address: "ул. Примерная, 1",
        };

        // Проверяем отсутствие каждого обязательного поля
        await postAndExpectBad({ ...base, latitude: undefined }, "latitude");
        await postAndExpectBad({ ...base, longitude: undefined }, "longitude");
        await postAndExpectBad({ ...base, typeId: undefined }, "typeId");
        await postAndExpectBad({ ...base, shortDescription: undefined }, "shortDescription");
        await postAndExpectBad({ ...base, address: undefined }, "address");
    });

    it("должен успешно создать заявку без detailedDescription (опциональное поле)", async () => {
        expect(authCookie).toBeTruthy();

        const payload = {
            latitude: "59.93863",
            longitude: "30.31413",
            typeId: 1,
            shortDescription: "Краткое без details",
            // detailedDescription не передаем
            address: "ул. Примерная, 2",
        };

        const createRes = await fetch(`${serverUrl}/reports/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: authCookie ?? "",
            },
            body: JSON.stringify(payload),
        });

        expect(createRes.status).toBe(201);

        const createdJson: any = await createRes.json();
        const issueId = createdJson.issueId ?? createdJson.id ?? (createdJson.issue && createdJson.issue.issueId);
        expect(issueId).toBeTruthy();

        const dbIssueRows = await db.select().from(schema.issues).where(eq(schema.issues.issueId, issueId)).execute();
        expect(dbIssueRows.length).toBeGreaterThan(0);
        const dbIssue = dbIssueRows[0] as any;

        expect(dbIssue.detailedDescription === null || 
            dbIssue.detailedDescription === "" || 
            dbIssue.detailedDescription === undefined).toBe(true);
    });
});