import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getRoleLabel(role: string) {
	switch(role) {
		case "user": return "Пользователь"
		case "operator": return "Оператор"
		case "admin": return "Админ"
		case "superAdmin": return "Главный админ"
		default: {
			console.warn("unhandled user role: ", role)
			return "Пользователь"
		}
	}
}