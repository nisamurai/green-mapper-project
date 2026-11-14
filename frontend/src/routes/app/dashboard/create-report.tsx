import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

import useSWR, { mutate } from "swr";
import { fetcher } from "@/lib/fetcher";
// import type { Report } from "@/types/report"; // Этот тип здесь не нужен

// Импортируем toast из sonner
import { toast } from "sonner";
import { FRONT_PATHS } from "@/types/paths";

// Тип для типов проблем, получаемых с бэкенда
interface IssueType {
	typeId: number;
	name: string;
}

const SHORT_DESCRIPTION_MAX = 200;
const DETAILED_DESCRIPTION_MAX = 1000;
const ADDRESS_MAX = 255;

// Тип для данных, передаваемых через location.state
interface CreateReportState {
	photo?: File;
	latitude?: string | number;
	longitude?: string | number;
}

const maxFilesCount = 3;
const maxFileSizeBytes = 3 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);


export const DashboardCreateReport = () => {
	const navigate = useNavigate();
	const location = useLocation();
	// Состояние для управления открытием выпадающего списка типов проблем
	const [open, setOpen] = React.useState(false);
	// Состояние для выбранного ID типа проблемы
	const [selectedIssueTypeId, setSelectedIssueTypeId] = React.useState<
		number | null
	>(null);

	// Загрузка типов проблем с бэкенда
	const { data: issueTypes, error: issueTypesError } = useSWR<IssueType[]>(
		"/reports/issue-types",
		fetcher,
	);

	const restorePhoto = (base64: string | null) => {
		if (base64) {
			fetch(base64)
			.then(res => res.blob())
			.then(blob => {
				const file = new File([blob], "photo.png", { type: "image/png" });
				setFiles([file]);
				const previewUrl = URL.createObjectURL(file);
				setPhotoPreviews([previewUrl]);
				localStorage.removeItem("pendingPhoto"); // Clean up
				setIsFromQuickReport(true)
			});
		}
		};

	// State for latitude and longitude
	const [latitude, setLatitude] = useState("");
	const [longitude, setLongitude] = useState("");
	// State for other form fields
	const [shortDescription, setShortDescription] = useState("");
	const [detailedDescription, setDetailedDescription] = useState("");
	const [address, setAddress] = useState("");
	const [files, setFiles] = useState<File[]>([]); // Состояние для файла
	const [photoPreviews, setPhotoPreviews] = useState<string[]>([]); // Превью фото
	const [isFromQuickReport, setIsFromQuickReport] = useState(false); // Флаг быстрого отчёта

	// Read coordinates from URL parameters and location.state on component mount
	useEffect(() => {
		// Приоритет 1: Данные из location.state (быстрый отчёт с фото)
		const state = location.state as CreateReportState | null;
		if (state) {
			if (state.latitude !== undefined) {
				setLatitude(String(state.latitude));
			}
			if (state.longitude !== undefined) {
				setLongitude(String(state.longitude));
			}
			if (state.photo) {
				setFiles([state.photo]);
				// Создаём превью для переданного фото
				const previewUrl = URL.createObjectURL(state.photo);
				setPhotoPreviews([previewUrl]);
				setIsFromQuickReport(true);
			}
			// Очищаем state после использования, чтобы при возврате не было проблем
			// navigate(location.pathname + location.search, { replace: true });
			return;
		}

		// Приоритет 2: Координаты из URL параметров (клик по карте)
		const params = new URLSearchParams(location.search);
		const lat = params.get("latitude");
		const lon = params.get("longitude");

		if (lat) {
			setLatitude(lat);
		}
		if (lon) {
			setLongitude(lon);
		}
		const base64 = localStorage.getItem("photo");
		if (base64) {
			restorePhoto(base64)
			// setFiles([fetch(fileUrl).then((res) => res.blob())]);
		}
	}, [location.search, location.state, navigate]);

	// Очистка URL превью при размонтировании
	useEffect(() => {
		return () => {
			if (photoPreviews.length) {
				photoPreviews.forEach(photo => URL.revokeObjectURL(photo));
			}
		};
	}, [photoPreviews]);

	// Function to clear all form fields
	const handleCancel = () => {
		setLatitude("");
		setLongitude("");
		setSelectedIssueTypeId(null); // Сбрасываем выбранный тип
		setShortDescription("");
		setDetailedDescription("");
		setAddress("");
		setFiles([]);
		// Можно также перенаправить пользователя обратно на карту, если нужно
		navigate(`/${FRONT_PATHS.APP}`);
	};

	// Function to handle form submission
	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault(); // Предотвращаем стандартную отправку формы

		// Простая валидация
		if (
			!latitude ||
			!longitude ||
			selectedIssueTypeId === null ||
			!shortDescription ||
			!address
		) {
			// Обновленное многострочное сообщение об ошибке с использованием JSX и <br />
			toast.error(
        <div>
          Пожалуйста, заполните все обязательные поля:
          {(!latitude || !longitude) && (
            <>
              <br />- координаты [автоматически заполняются из карты],
            </>
          )}
          {selectedIssueTypeId === null && (
            <>
              <br />- тип проблемы,
            </>
          )}
          {!shortDescription && (
            <>
              <br />- краткое описание,
            </>
          )}
          {!address && (
            <>
              <br />- адрес
            </>
          )}
        </div>,
      );
			return;
		}
		if (!shortDescription.trim()) {
			toast.error("Краткое описание не может быть пустым");
			return;
		}
		if (shortDescription.length > SHORT_DESCRIPTION_MAX) {
			toast.error(`Краткое описание не длиннее ${SHORT_DESCRIPTION_MAX} символов`);
			return;
		}
		if (detailedDescription.length > DETAILED_DESCRIPTION_MAX) {
			toast.error(`Полное описание не длиннее ${DETAILED_DESCRIPTION_MAX} символов`);
			return;
		}
		if (!address.trim()) {
			toast.error("Адрес не может быть пустым");
			return;
		}
		if (address.length > ADDRESS_MAX) {
			toast.error(`Адрес не длиннее ${ADDRESS_MAX} символов`);
			return;
		}
		// Подготовка данных для отправки
		const reportData = new FormData()
		reportData.append("latitude", latitude)
		reportData.append("longitude", longitude)
		reportData.append("typeId", selectedIssueTypeId.toString())
		reportData.append("shortDescription", shortDescription)
		reportData.append("address", address)
		if(detailedDescription) {
			reportData.append("detailedDescription", detailedDescription)
		}
		files.forEach(file => {
			reportData.append("files", file)
		})

		try {
			// Отправка данных на бэкенд с помощью fetcher
			// Предполагается, что fetcher уже парсит JSON и обрабатывает базовые ошибки HTTP
			const responseData = await fetcher("/reports/", {
				method: "POST",

				body: reportData,
			});

			// Проверяем, успешно ли создана заявка по наличию issueId в ответе
			if (responseData && responseData.issueId) {
				toast.success("Заявка успешно создана!");
				toast.success("Вам начислен +1 балл :)");
				localStorage.removeItem("photo");
				// Перенаправляем пользователя на страницу со списком заявок
				 await mutate(
						(key) => typeof key === "string" && key.startsWith("/reports/"),
					);
				setTimeout(() => {
					navigate(`../${FRONT_PATHS.REPORTS}?showMyOnly=true`);
				}, 100)
			} else {
				// Если fetcher не выбросил ошибку, но issueId отсутствует,
				// возможно, fetcher возвращает объект ошибки или null при неудаче,
				// или структура успешного ответа изменилась.
				// В этом случае выводим общее сообщение об ошибке или сообщение из ответа, если оно есть.
				toast.error(
					`Ошибка при создании заявки: ${responseData?.error || "Неизвестная ошибка"}`,
				);
			}
		} catch (error) {
			console.error("Error submitting report:", error);
			// Обработка ошибок, выброшенных fetcher (например, сетевые ошибки или ошибки парсинга)
			toast.error(
				`Произошла ошибка при отправке заявки: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`,
			);
		}
	};

	// Обработка ошибки загрузки типов проблем
	if (issueTypesError) {
		return <div>Ошибка загрузки типов проблем: {issueTypesError.message}</div>;
	}

	// Отображение загрузки типов проблем
	if (!issueTypes) {
		return <div>Загрузка типов проблем...</div>;
	}

	return (
		<>
			<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
				<Card className="w-full max-w-lg ">
					<CardHeader>
						<CardTitle>Создать заявку</CardTitle>
						<CardDescription>
							Заполните все пункты и отправьте заявку на рассмотрение
							администраторам
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit}>
							<div className="grid w-full items-center gap-4">
								<div className="flex flex-col space-y-2.5 min-w-0">
									<Label htmlFor="latitude">Широта</Label>
									<Input
										id="latitude"
										placeholder="Широта"
										value={latitude}
										onChange={(e) => setLatitude(e.target.value)}
										required
										disabled
									/>
								</div>
								<div className="flex flex-col space-y-2.5 min-w-0">
									<Label htmlFor="longitude">Долгота</Label>
									<Input
										id="longitude"
										placeholder="Долгота"
										value={longitude}
										onChange={(e) => setLongitude(e.target.value)}
										required
										disabled
									/>
								</div>
								<div className="flex flex-col space-y-2.5 min-w-0">
									<Label htmlFor="issueType">Тип проблемы</Label>

									<Popover open={open} onOpenChange={setOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={open}
												className="justify-between w-full max-w-lg"
											>
												<span className="truncate w-100 text-left">
													{selectedIssueTypeId !== null
														? issueTypes.find(
																(type) => type.typeId === selectedIssueTypeId,
															)?.name
														: "Выберите тип проблемы..."}
												</span>
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="p-0 w-full max-w-100 whitespace-normal break-words">
											<Command>
												<CommandInput placeholder="Поиск проблемы..." />
												<CommandList>
													<CommandEmpty>Тип проблемы не найден</CommandEmpty>
													<CommandGroup>
														{issueTypes.map((type) => (
															<CommandItem
																key={type.typeId}
																value={type.name} // Используем name для поиска и отображения
																onSelect={() => {
																	// При выборе сохраняем typeId
																	setSelectedIssueTypeId(type.typeId);
																	setOpen(false);
																}}
																className="whitespace-normal wrap-anywhere"
															>
																<Check
																	className={cn(
																		"mr-2 h-4 w-4",
																		selectedIssueTypeId === type.typeId
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
																{type.name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
								<div className="flex flex-col space-y-2.5 min-w-0">
									<Label htmlFor="shortDescription">Короткое описание</Label>
									<Input
										className="w-full max-w-lg"
										id="shortDescription"
										placeholder="Кратко опишите суть проблемы"
										value={shortDescription}
										onChange={(e) => setShortDescription(e.target.value)}
										maxLength={SHORT_DESCRIPTION_MAX}
										required
									/>
								</div>
								<div className="flex flex-col space-y-2.5 min-w-0">
									<Label htmlFor="detailedDescription">Полное описание</Label>
									<Textarea
										className="w-full max-w-lg wrap-anywhere"
										id="detailedDescription"
										placeholder="Подробно опишите проблему"
										value={detailedDescription}
										onChange={(e) => setDetailedDescription(e.target.value)}
										maxLength={DETAILED_DESCRIPTION_MAX}
										wrap="hard"
									/>
								</div>
								<div className="flex flex-col space-y-2.5 min-w-0">
									<Label htmlFor="address">Адрес</Label>
									<Input
										className="w-full max-w-lg"
										id="address"
										placeholder="Впишите адрес ближайшего объекта"
										value={address}
										onChange={(e) => setAddress(e.target.value)}
										maxLength={ADDRESS_MAX}
										required
									/>
								</div>
								<div className="grid w-full max-w-full items-center min-w-0">
									<div className="flex justify-between">
									<Label htmlFor="picture">
										Загруженные фото: 
									<span className="text-gray-500 text-xs  relative top-[1px]">{files.length}/{maxFilesCount}</span>
									</Label>
									{photoPreviews.length !== 0 && (
										<Button
										  variant="outline"
										  className="text-xs"
										  onClick={() => {
										  	setFiles([]);
										  	setPhotoPreviews([])
										  }}
										>
											Убрать
										</Button>
									)}
									</div>

									{/* Пока не обрабатываем загрузку файла на бэкенде */}
									{photoPreviews.length ? (
										<div className="relative w-full">
											{photoPreviews.map((photoPreview, index) => (
													<img
													key={photoPreview}
													src={photoPreview}
													alt={`Загруженное фото ${index+1}`}
													className="w-full h-auto rounded-md border mt-4"
													/>
													)
											)}
											{isFromQuickReport && (
												<p className="text-xs text-green-600 mt-1">
												✓ Фото загружено с камеры
											</p>
											)}
										</div>
									) : (
										<Input
											id="picture"
											type="file"
											accept="image/jpeg,image/png,.jpg,.jpeg,.png"
											className="mt-4"
											multiple
											onChange={(e) => {
												if(e.target.files) {
													let loadedFiles = Array.from(e.target.files)
													if(loadedFiles.length > maxFilesCount) {
														loadedFiles = loadedFiles.splice(0, maxFilesCount)
														toast.error(`Максимальное количество загружаемых файлов: ${maxFilesCount}`)
													}
													const invalidTypeFile = loadedFiles.find((file) => !allowedMimeTypes.has(file.type));
													if (invalidTypeFile) {
														toast.error(`Файл "${invalidTypeFile.name}" должен быть в формате jpg или png`);
														return;
													}
													const oversizedFile = loadedFiles.find((file) => file.size > maxFileSizeBytes);
													if (oversizedFile) {
														toast.error(`Файл "${oversizedFile.name}" превышает 3 МБ`);
														return;
													}

													const urls: string[] = []
													setFiles(loadedFiles)
													loadedFiles.forEach(file => {
														urls.push(URL.createObjectURL(file))
													})
													setPhotoPreviews(urls)
													setIsFromQuickReport(false);
												} else {
													setFiles([]);
													setPhotoPreviews([])
												}
											}
											}
										/>
									)}
								</div>
							</div>
						</form>
					</CardContent>
					<CardFooter className="flex justify-between">
						<Button variant="outline" onClick={handleCancel}>
							Отмена
						</Button>
						<Button type="submit" onClick={handleSubmit}>
							Отправить заявку
						</Button>
					</CardFooter>
				</Card>
			</div>
		</>
	);
};
