import * as React from "react";

import { SearchForm } from "@/components/search-form";
import { VersionSwitcher } from "@/components/version-switcher";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate, useLocation } from "react-router";
import { fetcher } from "@/lib/fetcher";
import useSWR from "swr";
import { FRONT_PATHS } from "@/types/paths";
import { getRoleLabel } from "@/lib/utils";

export type UserProfile = {
	id: number;
	name: string;
	points: number;
	role: string;
};

export const PagesData = {
	locations: ["Российская Федерация"],
	navMain: [
		{
			title: "Навигация",
			url: "#",
			accessedByUser: true,
			accessedByAdmin: true,
			accessedByOperator: true,
			items: [
				{
					title: "Профиль",
					url: `/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.PROFILE}`,
					// isActive: true,
				},
				{
					title: "Карта",
					url: `/${FRONT_PATHS.APP}`,
				},
				{
					title: "Заявки",
					url: `/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.REPORTS}`,
				},
				// {
				// 	title: "Создать заявку",
				// 	show: false,
				// 	url: `/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.CREATE_REPORT}`,
				// },
			],
		},
		{
			title: "Вкладки для Админа",
			accessedByAdmin: true,
			url: "#",
			items: [
				{
					title: "Панель управления заявками",
					url: `/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.REPORTS_PANEL}`,
				},
			],
		},
		{
			title: "Вкладки для Оператора",
			accessedByOperator: true,
			url: "#",
			items: [
				{
					title: "Панель управления заявками",
					url: `/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.REPORTS_PANEL}`,
				},
			],
		},
		{
			title: "Вкладки для супер админа",
			url: "#",
			items: [
				{
					title: "Панель управления доступом",
					url: `/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.ACCESS_MANAGMENT}`,
				},
			],
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: user } = useSWR<UserProfile>("/users/me", fetcher);

	return (
		<Sidebar {...props}>
			<SidebarHeader>
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
				<VersionSwitcher
					versions={PagesData.locations}
					defaultVersion={PagesData.locations[0]}
				/>
				<SearchForm />
			</SidebarHeader>
			<SidebarContent>
				{/* We create a SidebarGroup for each parent. */}
				{PagesData.navMain
					.filter(({ 
						accessedByUser, 
						accessedByAdmin, 
						accessedByOperator
					 }) => {
						switch(user?.role) {
							case "user": return !!accessedByUser
							case "admin": return !!accessedByAdmin
							case "operator": return !!accessedByOperator
							case "superAdmin": return true
							default: return false
						}
					})
					.map((item) => (
						<SidebarGroup key={item.title}>
							<SidebarGroupLabel>{item.title}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{item.items.map((item) => (
										<SidebarMenuItem
											onClick={() => navigate(item.url)}
											key={item.title}
										>
											<SidebarMenuButton
												asChild
												isActive={item.url === location.pathname}
											>
												<a>{item.title}</a>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
