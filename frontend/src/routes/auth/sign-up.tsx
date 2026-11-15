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
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { FRONT_PATHS } from "@/types/paths";

interface Fields {
	name: string;
	email: string;
	password: string;
	confirm: string;
}

const schema = z
	.object({
		name: z
			.string()
			.min(2, "Имя должно содержать хотя бы 2 символа")
			.max(30, "Максимальная длина имени: 30 символов")
			.regex(
				/^[a-zA-Z0-9]+$/,
				"Можно использовать только латинские буквы и цифры",
			),
		email: z.string().email("Неправильный формат почты"),
		password: z
			.string()
			.min(8, "Минимальная длина пароля: 8 символов")
			.max(30, "Максимальная длина пароля: 30 символов"),
		confirm: z
			.string()
			.min(8, "Минимальная длина пароля: 8 символов")
			.max(30, "Максимальная длина пароля: 30 символов"),
	})
	.refine((data) => data.password === data.confirm, {
		message: "Пароли не совпадают",
		path: ["confirm"],
	});

export const SignUp = () => {
	const [isPending, setIsPending] = useState(false);
	const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
	const { data: session, error: sessionError, refetch } = authClient.useSession();
	const navigate = useNavigate();
	const location = useLocation()
	const form = useForm<Fields>({
		resolver: zodResolver(schema),
		defaultValues: {
			name: "",
			email: "",
			password: "",
			confirm: "",
		},
	});
	const [searchParams] = useSearchParams();
	const redirectTo = searchParams.get('redirect') || `/${FRONT_PATHS.APP}`;

	useEffect(() => {
		if (registeredUserId && session?.user.id === registeredUserId) {
			navigate(redirectTo, { replace: true, state: location.state });
		}
	}, [registeredUserId, session, navigate, redirectTo, location.state]);

	useEffect(() => {
		if (registeredUserId && sessionError) {
			toast(sessionError.message);
		}
	}, [registeredUserId, sessionError]);

	const signup = async ({ name, email, password }: Fields) => {
		setIsPending(true);
		try {
			// After registration, a retry only refreshes the existing session.
			if (!registeredUserId) {
				const { data, error } = await authClient.signUp.email({
					name,
					email,
					password,
					callbackURL: redirectTo,
				});
				if (error) {
					toast(error.message);
					return;
				}
				setRegisteredUserId(data.user.id);
			}
			// The protected route must see the same session before navigation.
			await refetch();
		} catch {
			toast("Не удалось завершить вход. Попробуйте ещё раз.");
		} finally {
			setIsPending(false);
		}
	};

	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
			<div className="w-full max-w-sm">
				<Card>
					<CardHeader>
						<CardTitle>Зарегистрировать аккаунт</CardTitle>
						<CardDescription>
							Введите свою почту и пароль с подтверждением для регистрации
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(signup)}
								className="flex flex-col gap-6"
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Имя</FormLabel>
											<FormControl>
												<Input placeholder="nickname" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Почта</FormLabel>
											<FormControl>
												<Input
													type="email"
													placeholder="mail@example.ru"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Пароль</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="confirm"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Повторите пароль</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button disabled={isPending} type="submit" className="w-full">
									Зарегистрироваться
								</Button>
							</form>
						</Form>
						<div className="mt-4 text-center text-sm">
							Уже есть аккаунт?{" "}
							<Link to={`../${FRONT_PATHS.LOGIN}?redirect=${encodeURIComponent(redirectTo)}`}className="underline underline-offset-4">
								Войти
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};
