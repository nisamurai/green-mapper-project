export const fetcher = (url: string, init: RequestInit) =>
	fetch(import.meta.env.VITE_API_BASE_URL + url, {
		...init,
		credentials: "include",
	}).then((res) => res.json());
