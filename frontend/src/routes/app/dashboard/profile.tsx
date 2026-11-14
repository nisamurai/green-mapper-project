export type UserProfile = {
	id: number;
	name: string;
	points: number;
	role: string;
	twoFactorEnabled?: boolean;
	hasAccessToMatureContent: boolean;
};

export const DashboardProfile = () => null;
