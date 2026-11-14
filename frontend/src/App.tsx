import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "./components/app-layout";
import { DashboardLayout } from "./components/dashboard-layout";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { FRONT_PATHS } from "./types/paths";
import { 
	DashboardCreateReport, 
	DashboardProfile, 
	DashboardReports, 
	DashboardReportsPanel, 
	DashboardViewReport,
	Login, 
	TwoFactor,
	SignUp, 
	Home, 
    AccessMangment
} from "./routes";

function App() {
	return (
		<ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
			<Routes>
				
				<Route index element={<Navigate to={FRONT_PATHS.APP} replace />} />

				<Route path={FRONT_PATHS.AUTH}>
					<Route path={FRONT_PATHS.LOGIN} element={<Login />} />
					<Route path={FRONT_PATHS.SING_UP} element={<SignUp />} />
					<Route path={FRONT_PATHS.TWO_FACTOR} element={<TwoFactor />} />
				</Route>

				<Route path={FRONT_PATHS.APP} element={<AppLayout />}>
					<Route index element={<Home />} />
					<Route path={`${FRONT_PATHS.REPORTS}/:id`} element={<DashboardViewReport />} />
					<Route path={FRONT_PATHS.DASHBOARD} element={<DashboardLayout />}>
						<Route path={FRONT_PATHS.PROFILE} element={<DashboardProfile />} />
						<Route path={FRONT_PATHS.REPORTS} element={<DashboardReports />} />
						<Route path={FRONT_PATHS.CREATE_REPORT} element={<DashboardCreateReport />} />
						<Route path={FRONT_PATHS.REPORTS_PANEL} element={<DashboardReportsPanel />} />
						<Route path={FRONT_PATHS.ACCESS_MANAGMENT} element={<AccessMangment />} />
					</Route>
				</Route>
				<Route path="*" element={<Navigate to="/" replace />}/>
			</Routes>
			<Toaster />
		</ThemeProvider>
	);
}

export default App;
