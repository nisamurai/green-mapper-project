import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Outlet } from "react-router";
import { authClient } from "@/lib/auth";
import { LoadingSpinner } from "./ui/spinner";
import { Header } from "./header";

export const AppLayout = () => {
	const { data: session, isPending, error } = authClient.useSession();
	
	if (isPending)
		return (
			<div className="flex items-center justify-center max-h-maxflex min-h-svh flex-col">
				<LoadingSpinner />
			</div>
		);

	if (error) return <div>Error: {error.message}</div>;

	return (
		<SidebarProvider>
			{session && <AppSidebar />}
			<SidebarInset>
				<Header/>
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
};
