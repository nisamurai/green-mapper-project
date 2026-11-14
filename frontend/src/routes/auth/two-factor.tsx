import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth";
import { FRONT_PATHS } from "@/types/paths";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

interface Fields {
	code: string;
}

const schema = z.object({
	code: z
		.string()
		.trim()
		.min(4, "Введите код")
		.max(12, "Слишком длинный код"),
});

export const TwoFactor = () => {
	const [isPending, setIsPending] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [secondsLeft, setSecondsLeft] = useState(0);
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const redirectTo = useMemo(() => {
		const fromQuery = searchParams.get("redirect");
		if (fromQuery) return fromQuery;
		const fromStorage = sessionStorage.getItem("postLoginRedirect");
		return fromStorage || `/${FRONT_PATHS.APP}`;
	}, [searchParams]);

	const form = useForm<Fields>({
		resolver: zodResolver(schema),
		defaultValues: {
			code: "",
		},
	});

	useEffect(() => {
		if (secondsLeft <= 0) return;
		const timer = setInterval(() => {
			setSecondsLeft((current) => (current <= 1 ? 0 : current - 1));
		}, 1000);
		return () => clearInterval(timer);
	}, [secondsLeft]);

	const sendOtp = useCallback(async () => {
		setIsSending(true);
		const { error } = await authClient.twoFactor.sendOtp();
		setIsSending(false);

		if (error) {
			const retryAfter = Number(
				(error as { retryAfterSeconds?: number }).retryAfterSeconds,
			);
			if (error.status === 429) {
				setSecondsLeft(
					Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
				);
			}
			toast(error.message || "Не удалось отправить код");
			return;
		}
		setSecondsLeft(60);
		toast("Код отправлен на почту");
	}, []);

	useEffect(() => {
		void sendOtp();
	}, [sendOtp]);

	const verify = async ({ code }: Fields) => {
		setIsPending(true);
		const { error } = await authClient.twoFactor.verifyOtp({ code });
		setIsPending(false);

		if (error) {
			toast(error.message || "Неверный код");
			return;
		}

		sessionStorage.removeItem("postLoginRedirect");
		navigate(redirectTo, { replace: true });
	};

	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
			<div className="w-full max-w-sm">
				<Card>
					<CardHeader>
						<CardTitle>Подтверждение входа</CardTitle>
						<CardDescription>
							Мы отправили код на вашу почту. Введите его, чтобы завершить вход.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(verify)}
								className="flex flex-col gap-4"
							>
								<FormField
									control={form.control}
									name="code"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Код</FormLabel>
											<FormControl>
												<Input inputMode="numeric" autoComplete="one-time-code" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Trusted devices disabled: always require 2FA code */}

								<Button disabled={isPending} type="submit" className="w-full">
									Подтвердить
								</Button>

								<Button
									type="button"
									variant="outline"
									disabled={isSending || isPending || secondsLeft > 0}
									onClick={sendOtp}
									className="w-full"
								>
									{secondsLeft > 0
										? `Отправить код ещё раз (${secondsLeft})`
										: "Отправить код ещё раз"}
								</Button>
							</form>
						</Form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

