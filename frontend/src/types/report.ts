// export type Report = {
// 	issueId: number;
// 	shortDescription: string;
// };

export type Report = {
	issueId: number;
	shortDescription: string;
	detailedDescription: string;
	address: string;
	createdAt: string;
	expectedResolutionDate: string | null;
	statusName: string;
	typeName: string;
	userId: string | null;
};
