import { rainbowColorInkantation } from "@/utils/rainbow";
import swagger from "@elysiajs/swagger";
import Elysia from "elysia";

export const swaggerMiddleware = new Elysia().use((app) => {
	if (process.env.DEVELOPMENT === "true") {
		app.use(
			swagger({
				exclude: [/^\/reports(\/.*)?$/],
				documentation: {
					info: {
						title: "Mapper",
						version: "0.0.1",
					},
					tags: [
						{ name: "system", description: "Системные эндпоинты" },
						{ name: "auth", description: "Эндпоинты аутентификации" },
						{ name: "users", description: "Эндпоинты профиля пользователя" },
						{ name: "reports", description: "Эндпоинты заявок" },
					],
					paths: {
						"/health": {
							get: {
								tags: ["system"],
								description: "Проверка доступности backend-сервиса.",
								responses: {
									200: {
										description: "Сервис работает корректно",
										content: {
											"application/json": {
												schema: {
													type: "object",
													properties: {
														status: { type: "string", example: "ok" },
													},
													required: ["status"],
												},
											},
										},
									},
								},
							},
						},
						"/auth/sign-up": {
							post: {
								tags: ["auth"],
								description: "Регистрация нового пользователя.",
								requestBody: {
									required: true,
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													email: { type: "string", format: "email" },
													password: { type: "string" },
													name: { type: "string" },
												},
												required: ["email", "password", "name"],
											},
										},
									},
								},
								responses: {
									200: { description: "Пользователь зарегистрирован" },
									400: { description: "Ошибка валидации" },
								},
							},
						},
						"/auth/sign-in": {
							post: {
								tags: ["auth"],
								description: "Вход по email и паролю.",
								requestBody: {
									required: true,
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													email: { type: "string", format: "email" },
													password: { type: "string" },
												},
												required: ["email", "password"],
											},
										},
									},
								},
								responses: {
									200: { description: "Успешный вход" },
									401: { description: "Неверные учетные данные" },
								},
							},
						},
						"/auth/sign-in/social": {
							post: {
								tags: ["auth"],
								description: "Вход через социального провайдера.",
								requestBody: {
									required: true,
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													provider: { type: "string", example: "yandex" },
													callbackURL: { type: "string", format: "uri" },
												},
												required: ["provider"],
											},
										},
									},
								},
								responses: {
									200: { description: "OAuth-процесс запущен" },
									400: { description: "Не указан провайдер" },
								},
							},
						},
						"/auth/sign-out": {
							post: {
								tags: ["auth"],
								description: "Выход из текущей сессии.",
								responses: {
									200: { description: "Выход выполнен" },
									401: { description: "Не авторизован" },
								},
							},
						},
						"/auth/session": {
							get: {
								tags: ["auth"],
								description: "Получить текущую сессию пользователя.",
								responses: {
									200: { description: "Информация о сессии получена" },
									401: { description: "Активная сессия отсутствует" },
								},
							},
						},
						"/users/me": {
							get: {
								tags: ["users"],
								description: "Получить профиль текущего авторизованного пользователя.",
								responses: {
									200: { description: "Профиль пользователя получен" },
									401: { description: "Не авторизован" },
								},
							},
						},
						"/reports/": {
							get: {
								tags: ["reports"],
								description: "Получить список заявок.",
								responses: {
									200: { description: "Список заявок получен" },
								},
							},
							post: {
								tags: ["reports"],
								description:
									"Создание заявки. Для отправки изображений используйте multipart/form-data. Поле 'files' должно быть массивом бинарных файлов (максимум 3). Если фото не нужны, можно отправлять JSON без поля 'files'.",
								requestBody: {
									required: true,
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													latitude: { type: "string", example: "55.755825" },
													longitude: { type: "string", example: "37.617298" },
													typeId: { type: "integer", example: 1 },
													shortDescription: { type: "string", example: "Разбитый тротуар" },
													detailedDescription: { type: "string", example: "Яма у входа в подъезд" },
													address: { type: "string", example: "ул. Примерная, 10" },
												},
												required: ["latitude", "longitude", "typeId", "shortDescription", "address"],
											},
										},
										"multipart/form-data": {
											schema: {
												type: "object",
												properties: {
													latitude: { type: "string", example: "55.755825" },
													longitude: { type: "string", example: "37.617298" },
													typeId: { type: "integer", example: 1 },
													shortDescription: { type: "string", example: "Разбитый тротуар" },
													detailedDescription: { type: "string", example: "Яма у входа в подъезд" },
													address: { type: "string", example: "ул. Примерная, 10" },
													files: {
														type: "array",
														items: { type: "string", format: "binary" },
													},
												},
												required: ["latitude", "longitude", "typeId", "shortDescription", "address"],
											},
										},
									},
								},
								responses: {
									201: { description: "Заявка создана" },
									400: { description: "Некорректное тело запроса" },
									401: { description: "Не авторизован" },
								},
							},
						},
					},
				},
			}),
		);
		console.log(rainbowColorInkantation("Swagger enabled"));
	}

	return app;
});
