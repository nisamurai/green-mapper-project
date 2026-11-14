const OTP_RESEND_WINDOW_MS = 60_000;
const otpLastSentAt = new Map<string, number>();

export function tryReserveOtpSend(
	key: string,
	now = Date.now(),
	windowMs = OTP_RESEND_WINDOW_MS,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
	const previous = otpLastSentAt.get(key);
	if (previous !== undefined) {
		const elapsed = now - previous;
		if (elapsed < windowMs) {
			return {
				ok: false,
				retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
			};
		}
	}
	otpLastSentAt.set(key, now);
	return { ok: true };
}

export function resetOtpSendReservations() {
	otpLastSentAt.clear();
}
