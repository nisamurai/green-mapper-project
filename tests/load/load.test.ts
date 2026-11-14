import { afterAll, expect, test } from "bun:test";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type ScenarioStep = {
	name: string;
	method: HttpMethod;
	path: string;
	resolvePath?: () => Promise<string>;
	requiresAuth?: boolean;
	buildBody?: (userId: number, iteration: number) => unknown;
	expectedStatuses?: number[];
};

type LoadScenario = {
	id: string;
	description: string;
	users: number;
	rps: number;
	maxLatencyMs?: number;
	requireSessionAuth?: boolean;
	steps: ScenarioStep[];
};

type ScenarioResult = {
	totalTransactions: number;
	failedTransactions: number;
	latenciesMs: number[];
};

const BASE_URL = process.env.BETTER_AUTH_URL || 'http://192.168.1.100';
const LOAD_TEST_ENABLED = true; 
const RAMP_UP_MS = 5 * 60 * 1000; // 5 минут подъема (5 * 60 * 1000)
const PLATEAU_MS = 10 * 60 * 1000; // 10 минут плато (10 * 60 * 1000)
const ERROR_THRESHOLD = 0.1; // порог ошибки - 10%
const TEST_DURATION_MS = RAMP_UP_MS + PLATEAU_MS;
const POLL_MS = 200; // интервал между запросами

const AUTH_EMAIL = "test@mail.ru"; // email для авторизации (нужно добавить в бд)
const AUTH_PASSWORD = "11111111"; // password для авторизации (нужно добавить в бд)
const AUTH_ENABLED = Boolean(AUTH_EMAIL && AUTH_PASSWORD);

const LOAD_S1_USERS = 60; // количество пользователей для сценария S1
const LOAD_S1_RPS = 25; // количество запросов в секунду для сценария S1
const LOAD_S2_USERS = 160; // количество пользователей для сценария S2
const LOAD_S2_RPS = 80; // количество запросов в секунду для сценария S2

const scenarios: LoadScenario[] = [
	{
		id: "S1",
		description: "Создание заявки (с авторизацией)",
		users: LOAD_S1_USERS,
		rps: LOAD_S1_RPS,
		maxLatencyMs: 2000,
		requireSessionAuth: true,
		steps: [
			{
				name: "create report",
				method: "POST",
				path: "/reports",
				requiresAuth: true,
				expectedStatuses: [200, 201],
				buildBody: (userId, iteration) => ({
					latitude: "59.93863",
					longitude: "30.31413",
					typeId: 1,
					shortDescription: `deleteit`,
					detailedDescription: "Created by bun:test load scenario",
					address: "Невский проспект, 1",
				}),
			},
		],
	},
	{
		id: "S2",
		description: "Загрузка всех заявок",
		users: LOAD_S2_USERS,
		rps: LOAD_S2_RPS,
		maxLatencyMs: 3000,
		steps: [
			{
				name: "list reports",
				method: "GET",
				path: "/reports/",
				expectedStatuses: [200, 301, 307, 308],
			},
		],
	},
];

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[Math.max(0, idx)];
}

function expectedUsersByTime(elapsedMs: number, maxUsers: number): number {
	if (elapsedMs >= RAMP_UP_MS) return maxUsers;
	const share = elapsedMs / RAMP_UP_MS;
	return Math.max(1, Math.floor(maxUsers * share));
}

async function signInAndGetCookie(): Promise<string | null> {
	if (!AUTH_ENABLED) return null;

	const signInRes = await fetch(`${BASE_URL}/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
	});

	if (signInRes.status !== 200) {
		return null;
	}

	const setCookie = signInRes.headers.get("set-cookie");
	return setCookie ? setCookie.split(";")[0] : null;
}

async function runScenario(scenario: LoadScenario): Promise<ScenarioResult> {
	let totalTransactions = 0;
	let failedTransactions = 0;
	const latenciesMs: number[] = [];
	const startedAt = Date.now();

	const worker = async (workerId: number) => {
		let iteration = 0;
		let authCookie: string | null = null;

		if (scenario.requireSessionAuth) {
			authCookie = await signInAndGetCookie();
			if (!authCookie) {
				throw new Error(`Cannot sign in for scenario ${scenario.id}. Check LOAD_AUTH_EMAIL/PASSWORD.`);
			}
		}

		while (Date.now() - startedAt < TEST_DURATION_MS) {
			const elapsed = Date.now() - startedAt;
			const activeUsers = expectedUsersByTime(elapsed, scenario.users);

			if (workerId >= activeUsers) {
				await Bun.sleep(POLL_MS);
				continue;
			}

			const requestIntervalMs = Math.max(1, (activeUsers * 1000) / scenario.rps);
			const txStart = performance.now();
			let transactionFailed = false;

			for (const step of scenario.steps) {
				const path = step.resolvePath ? await step.resolvePath() : step.path;
				const url = `${BASE_URL}${path}`;
				let body: string | undefined;

				if (step.buildBody) {
					body = JSON.stringify(step.buildBody(workerId, iteration));
				}

				const headers: Record<string, string> = {};
				if (body) headers["Content-Type"] = "application/json";
				if (step.requiresAuth) {
					if (!authCookie) {
						transactionFailed = true;
						break;
					}
					headers.Cookie = authCookie;
				}

				const res = await fetch(url, {
					method: step.method,
					headers,
					body,
				});
				const allowedStatuses = step.expectedStatuses ?? [200];
				if (!allowedStatuses.includes(res.status)) {
					transactionFailed = true;
					break;
				}
			}

			const txLatency = performance.now() - txStart;
			if (scenario.maxLatencyMs && txLatency > scenario.maxLatencyMs) {
				transactionFailed = true;
			}
			latenciesMs.push(txLatency);
			totalTransactions += 1;
			if (transactionFailed) failedTransactions += 1;

			const waitMs = requestIntervalMs - txLatency;
			if (waitMs > 0) await Bun.sleep(waitMs);
			iteration += 1;
		}
	};

	await Promise.all(Array.from({ length: scenario.users }, (_, i) => worker(i)));
	return { totalTransactions, failedTransactions, latenciesMs };
}

for (const scenario of scenarios) {
	const testName = `${scenario.id}: ${scenario.description}`;
	const timeoutMs = TEST_DURATION_MS + 60_000;
	const runner = async () => {
		const result = await runScenario(scenario);
		const errorRate =
			result.totalTransactions === 0 ? 1 : result.failedTransactions / result.totalTransactions;

		const p50 = percentile(result.latenciesMs, 50);
		const p95 = percentile(result.latenciesMs, 95);
		const p99 = percentile(result.latenciesMs, 99);

		console.log(
			`[load:${scenario.id}] tx=${result.totalTransactions}, failed=${result.failedTransactions}, errorRate=${(
				errorRate * 100
			).toFixed(2)}%, p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, p99=${p99.toFixed(1)}ms`,
		);

		expect(result.totalTransactions).toBeGreaterThan(0);
		expect(errorRate).toBeLessThanOrEqual(ERROR_THRESHOLD);
	};

	if (LOAD_TEST_ENABLED) {
		test(testName, runner, timeoutMs);
	} else {
		test.skip(
			testName,
			() => {},
			timeoutMs,
		);
	}
}