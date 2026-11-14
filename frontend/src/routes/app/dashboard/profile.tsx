import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getRoleLabel } from "@/lib/utils";

export type UserProfile = {
	id: number;
	name: string;
	points: number;
	role: string;
	twoFactorEnabled?: boolean;
	hasAccessToMatureContent: boolean;
};

export const DashboardProfile = () => {
	const { data: user, mutate } = useSWR<UserProfile>("/users/me", fetcher);
	const { data: session, refetch } = authClient.useSession();
	const [isPending, setIsPending] = useState(false);
	const [password, setPassword] = useState("");

	const twoFactorEnabled = useMemo(() => {
		// Prefer session if available (it’s what Better Auth updates)
		return Boolean((session as any)?.user?.twoFactorEnabled ?? user?.twoFactorEnabled);
	}, [session, user]);

	const toggle2fa = async () => {
		if (!password) {
			toast("Введите пароль");
			return;
		}

		setIsPending(true);
		const res = twoFactorEnabled
			? await authClient.twoFactor.disable({ password })
			: await authClient.twoFactor.enable({ password });
		setIsPending(false);

		if (res.error) {
			toast(res.error.message || "Не удалось обновить 2FA");
			return;
		}

		await refetch();
		await mutate();
		setPassword("");
		toast(twoFactorEnabled ? "2FA выключена" : "2FA включена");
	};
	
	return (
		<>
			<div className="flex flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
				<div className="flex items-center gap-3 ml-2">
					<Avatar className="h-10 w-10">
						<AvatarImage src="https://github.com/shadcn.png" alt="@username" />
						<AvatarFallback>UN</AvatarFallback>
					</Avatar>
					<span className="font-medium text-base truncate">
						{user?.name || "Загрузка..."}
					</span>
				</div>
				<span className="font-medium text-base truncate">
					Статус: {user?.role ? getRoleLabel(user.role) : "Загрузка..."}
				</span>
				<span className="font-medium text-base truncate">
					Рейтинг: {!isNaN(user?.points!) ? user?.points : "Загрузка..."}
				</span>

				<div className="w-full max-w-sm flex flex-col gap-3 pt-4">
					<label className="text-sm text-muted-foreground">Введите пароль для включения/выключения 2FA</label>
					<Input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Введите пароль"
					/>
					<Button disabled={isPending} onClick={toggle2fa} className="w-full">
						{twoFactorEnabled ? "Выключить 2FA" : "Включить 2FA"}
					</Button>
				</div>
			</div>
		</>
	);
};
