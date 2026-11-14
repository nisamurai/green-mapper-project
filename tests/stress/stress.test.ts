import { afterAll, expect, test } from "bun:test";

type HttpMethod = "GET" | "POST";

type ScenarioStep = {
	name: string;
	method: HttpMethod;
	path: string;
	requiresAuth?: boolean;
	buildBody?: (workerId: number, iteration: number) => unknown;
	expectedStatuses?: number[];
};

type StressScenario = {
	id: string;
	description: string;
	baseUsers: number;
	baseRps: number;
	maxLatencyMs?: number;
	requireSessionAuth?: boolean;
	steps: ScenarioStep[];
};

type StressRunResult = {
	totalTransactions: number;
	failedTransactions: number;
	rampTransactions: number;
	rampFailed: number;
	stoppedByThreshold: boolean;
	stoppedByMaxDuration: boolean;
	latenciesMs: number[];
	durationMs: number;
	lastUsers?: number;
	lastRps?: number;
	passedRamp?: boolean;
};

const BASE_URL = process.env.BETTER_AUTH_URL || 'http://192.168.1.100';
/** `false` — тесты помечаются как skip; `true` — выполняется реальный стресс-прогон. */
const STRESS_TEST_ENABLED = true;

const RAMP_MS = 5 * 60 * 1000; // Время линейного роста (в конце этого участка тест считается засчитанным)
const STEP_MS = 10_000; 
const STEP_MULTIPLIER = 1.1; // каждые 10 секунд нагрузка увеличивается на 10%
const ERROR_THRESHOLD = 0.25;
const MAX_DURATION_MS = 30 * 60 * 1000;
const ROLLING_WINDOW = 120;
const MIN_WINDOW_BEFORE_STOP = 40;
// Minimum stable time after ramp before allowing stop by error threshold (1 minute)
const MIN_STABLE_MS = 60 * 1000;
const POLL_MS = 200;

const MAX_USERS_CAP = 20000;
const MAX_RPS_CAP = 20000;

const AUTH_EMAIL = "test@mail.ru";
const AUTH_PASSWORD = "11111111";
const AUTH_ENABLED = Boolean(AUTH_EMAIL && AUTH_PASSWORD);

/** Пусто — cleanup через cookie; иначе заголовок x-service-key (как секрет сервиса на API). */
const SERVICE_KEY_FOR_CLEANUP = "";

const STRESS_S1_BASE_USERS = 200;
const STRESS_S1_BASE_RPS = 80;
const STRESS_S2_BASE_USERS = 320;
const STRESS_S2_BASE_RPS = 160;

const scenarios: StressScenario[] = [
	{
		id: "ST1",
		description: "Стресс: создание заявки (с авторизацией)",
		baseUsers: STRESS_S1_BASE_USERS,
		baseRps: STRESS_S1_BASE_RPS,
		maxLatencyMs: 2000,
		requireSessionAuth: true,
		steps: [
			{
				name: "create report",
				method: "POST",
				path: "/reports",
				requiresAuth: true,
				expectedStatuses: [200, 201],
				buildBody: (workerId, iteration) => ({
					latitude: "59.93863",
					longitude: "30.31413",
					typeId: 1,
					shortDescription: `deleteit`,
					detailedDescription: "Created by bun:test stress scenario",
					address: "Невский проспект, 1",
				}),
			},
		],
	},
	{
		id: "ST2",
		description: "Стресс: загрузка всех заявок",
		baseUsers: STRESS_S2_BASE_USERS,
		baseRps: STRESS_S2_BASE_RPS,
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

function stressMultiplier(elapsedMs: number): number {
	if (elapsedMs < RAMP_MS) return elapsedMs / RAMP_MS;
	const afterRamp = elapsedMs - RAMP_MS;
	const steps = Math.floor(afterRamp / STEP_MS);
	return Math.pow(STEP_MULTIPLIER, steps);
}

function effectiveLoad(baseUsers: number, baseRps: number, elapsedMs: number): { users: number; rps: number } {
	const mult = stressMultiplier(elapsedMs);
	const users = Math.max(1, Math.min(Math.ceil(baseUsers * mult), MAX_USERS_CAP));
	const rps = Math.max(1, Math.min(baseRps * mult, MAX_RPS_CAP));
	return { users, rps };
}

async function signInAndGetCookie(): Promise<string | null> {
	if (!AUTH_ENABLED) return null;
	const signInRes = await fetch(`${BASE_URL}/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
	});
	if (signInRes.status !== 200) return null;
	const setCookie = signInRes.headers.get("set-cookie");
	return setCookie ? setCookie.split(";")[0] : null;
}

function maxStressMultiplierForDuration(): number {
	return stressMultiplier(MAX_DURATION_MS);
}

async function runStressScenario(scenario: StressScenario): Promise<StressRunResult> {
	const maxWorkers = Math.min(
		MAX_USERS_CAP,
		Math.ceil(scenario.baseUsers * maxStressMultiplierForDuration()),
	);

	const stop = { threshold: false };

	let totalTransactions = 0;
	let failedTransactions = 0;
	let rampTransactions = 0;
	let rampFailed = 0;
	const latenciesMs: number[] = [];

	const rolling: boolean[] = [];
	let stoppedByThreshold = false;
	let stoppedByMaxDuration = false;

	let lastUsers = 0;
	let lastRps = 0;

	const startedAt = Date.now();
	const shouldStop = () => Date.now() - startedAt >= MAX_DURATION_MS;

	const recordOutcome = (ok: boolean, elapsed: number) => {
		totalTransactions += 1;
		if (!ok) failedTransactions += 1;
		if (elapsed < RAMP_MS) {
			rampTransactions += 1;
			if (!ok) rampFailed += 1;
		}
		rolling.push(ok);
		if (rolling.length > ROLLING_WINDOW) rolling.shift();
	};

	const checkStressStop = (elapsed: number): boolean => {
		// Do not allow stopping before completing ramp + minimum stable period
		if (elapsed < RAMP_MS + MIN_STABLE_MS) return false;
		if (rolling.length < MIN_WINDOW_BEFORE_STOP) return false;
		const fails = rolling.filter((x) => !x).length;
		return fails / rolling.length > ERROR_THRESHOLD;
	};

	// If scenario requires session auth, sign in once and reuse the cookie for all workers
	let sharedAuthCookie: string | null = null;
	if (scenario.requireSessionAuth) {
		sharedAuthCookie = await signInAndGetCookie();
		if (!sharedAuthCookie) {
			throw new Error(`Cannot sign in for scenario ${scenario.id}. Check AUTH_EMAIL / AUTH_PASSWORD in stress.test.ts.`);
		}
	}

	const worker = async (workerId: number) => {
		try {
			let iteration = 0;

			while (!shouldStop() && !stop.threshold) {
			const elapsed = Date.now() - startedAt;
			if (checkStressStop(elapsed)) {
				stop.threshold = true;
				stoppedByThreshold = true;
				break;
			}

			const { users: activeUsers, rps } = effectiveLoad(scenario.baseUsers, scenario.baseRps, elapsed);
			if (workerId >= activeUsers) {
				await Bun.sleep(POLL_MS);
				continue;
			}

			// record last-known load values
			lastUsers = activeUsers;
			lastRps = rps;

			const requestIntervalMs = Math.max(1, (activeUsers * 1000) / rps);
			const txStart = performance.now();
			let transactionFailed = false;

				for (const step of scenario.steps) {
					const url = `${BASE_URL}${step.path}`;
					let body: string | undefined;
					if (step.buildBody) body = JSON.stringify(step.buildBody(workerId, iteration));

					const headers: Record<string, string> = {};
					if (body) headers["Content-Type"] = "application/json";
					if (step.requiresAuth) {
						if (!sharedAuthCookie) {
							transactionFailed = true;
							break;
						}
						headers.Cookie = sharedAuthCookie;
					}

					try {
						const res = await fetch(url, { method: step.method, headers, body });
						const allowed = step.expectedStatuses ?? [200];
						if (!allowed.includes(res.status)) {
							transactionFailed = true;
							console.warn(`[stress:${scenario.id}] worker=${workerId} iter=${iteration} step=${step.name} status=${res.status}`);
							break;
						}
					} catch (err) {
						// Network/fetch errors (ConnectionRefused, DNS, timeout, etc.) should mark transaction as failed
						transactionFailed = true;
						console.warn(`[stress:${scenario.id}] worker=${workerId} iter=${iteration} step=${step.name} fetch error:`, err);
						break;
					}
				}

			const txLatency = performance.now() - txStart;
			if (scenario.maxLatencyMs && txLatency > scenario.maxLatencyMs) transactionFailed = true;

			latenciesMs.push(txLatency);
			recordOutcome(!transactionFailed, elapsed);

			if (checkStressStop(Date.now() - startedAt)) {
				stop.threshold = true;
				stoppedByThreshold = true;
				break;
			}

			const waitMs = requestIntervalMs - txLatency;
			if (waitMs > 0) await Bun.sleep(waitMs);
			iteration += 1;
			}
		} catch (err) {
			console.error(`[stress:${scenario.id}] worker=${workerId} unexpected error:`, err);
		}
		};

	await Promise.all(Array.from({ length: maxWorkers }, (_, i) => worker(i)));

	const durationMs = Date.now() - startedAt;
	if (durationMs >= MAX_DURATION_MS) stoppedByMaxDuration = true;

	const passedRamp = rampTransactions === 0 ? false : rampFailed / rampTransactions <= ERROR_THRESHOLD;

	return {
		totalTransactions,
		failedTransactions,
		rampTransactions,
		rampFailed,
		stoppedByThreshold,
		stoppedByMaxDuration,
		latenciesMs,
		durationMs,
		lastUsers,
		lastRps,
		passedRamp,
	};
}

for (const scenario of scenarios) {
	const testName = `${scenario.id}: ${scenario.description}`;
	const timeoutMs = MAX_DURATION_MS + 120_000;
	const runner = async () => {
		const result = await runStressScenario(scenario);
		const errorRate =
			result.totalTransactions === 0 ? 1 : result.failedTransactions / result.totalTransactions;
		const rampErrorRate =
			result.rampTransactions === 0 ? 0 : result.rampFailed / result.rampTransactions;

		const p50 = percentile(result.latenciesMs, 50);
		const p95 = percentile(result.latenciesMs, 95);
		const p99 = percentile(result.latenciesMs, 99);

		console.log(
			`[stress:${scenario.id}] durationMs=${result.durationMs}, tx=${result.totalTransactions}, failed=${result.failedTransactions}, errorRate=${(errorRate * 100).toFixed(2)}%, rampErrorRate=${(rampErrorRate * 100).toFixed(2)}%, stoppedByThreshold=${result.stoppedByThreshold}, stoppedByMaxDuration=${result.stoppedByMaxDuration}, lastUsers=${result.lastUsers ?? 0}, lastRps=${result.lastRps ?? 0}, passedRamp=${Boolean(result.passedRamp)}, p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, p99=${p99.toFixed(1)}ms`,
		);

		expect(result.totalTransactions).toBeGreaterThan(0);
		// На фазе плавного выхода на базовые пороги ошибки не должны превышать 25%.
		expect(rampErrorRate).toBeLessThanOrEqual(ERROR_THRESHOLD);
		// Тест считается пройденным, если прошла фаза линейного роста (passedRamp),
		// или если сценарий остановлен по порогу или исчерпан лимит времени.
		expect(result.passedRamp || result.stoppedByThreshold || result.stoppedByMaxDuration).toBe(true);
	};

	if (STRESS_TEST_ENABLED) {
		test(testName, runner, timeoutMs);
	} else {
		test.skip(testName, () => {}, timeoutMs);
	}
}