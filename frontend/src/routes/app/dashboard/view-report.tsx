import * as React from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  Award,
  Image as ImageIcon,
  Clock,
  CogIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { FRONT_PATHS } from "@/types/paths";
import type { UserProfile } from "./profile";
import { DatePickerInput } from "@/components/data-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Тип для данных заявки (соответствует тому, что приходит с бэкенда)
interface Report {
  issueId: number;
  shortDescription: string;
  detailedDescription: string | null;
  address: string;
  latitude: string | null;
  longitude: string | null;
  createdAt: Date | null;
  expectedResolutionDate: string | null;
  statusName: string | null;
  typeName: string | null;
  userName: string | null;
  userPoints: number | null;
  statusId: number;
  matureContent: boolean;
  links: string[];
}

// Компонент для отображения изображений в виде галереи
const ImageGallery = ({ images }: { images: string[] }) => {
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const selectedImage = selectedIndex !== null ? images[selectedIndex] : null;

  const showPrevious = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex - 1 + images.length) % images.length);
  };

  const showNext = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex + 1) % images.length);
  };

  if (!images || images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/20">
        <ImageIcon className="w-12 h-12 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Нет прикрепленных фотографий
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((image, index) => (
          <div
            key={index}
            className="relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-muted/10 hover:opacity-90 transition-opacity"
            onClick={() => setSelectedIndex(index)}
          >
            <img
              src={image}
              alt={`Фото ${index + 1}`}
              className="object-cover w-full h-full"
            />
          </div>
        ))}
      </div>

      {/* Модальное окно для просмотра изображения в полном размере */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedIndex(null)}
        >
          <div
            className="relative flex max-w-[95vw] max-h-[90vh] items-center justify-center p-4"
            onClick={(event) => event.stopPropagation()}
          >
            {images.length > 1 && (
              <Button
                variant="outline"
                size="icon"
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                onClick={showPrevious}
              >
                {"<"}
              </Button>
            )}
            <img
              src={selectedImage}
              alt="Просмотр"
              className="max-h-[80vh] max-w-[85vw] object-contain rounded-md"
            />
            {images.length > 1 && (
              <Button
                variant="outline"
                size="icon"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                onClick={showNext}
              >
                {">"}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="absolute top-4 right-4 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setSelectedIndex(null)}
            >
              ✕
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

// Компонент для отображения статуса с соответствующим цветом
const StatusBadge = ({
  statusName,
  statusId,
}: {
  statusName: string | null;
  statusId: number;
}) => {
  const getStatusColor = () => {
    switch (statusId) {
      case 1: // Новый
        return "bg-blue-100 text-blue-800 border-blue-200";
      case 2: // В работе
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case 3: // Завершен
        return "bg-green-100 text-green-800 border-green-200";
      case 4: // Отклонен
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <Badge className={`${getStatusColor()} font-medium px-3 py-1`}>
      {statusName || "Неизвестно"}
    </Badge>
  );
};
// Компонент для отображения статуса с соответствующим цветом
const MatureContentBadge = () => {
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 font-medium px-3 py-1">
      Опасное содержание!
    </Badge>
  );
};

// Компонент скелетона для загрузки
const ReportSkeleton = () => {
  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  );
};

export const DashboardViewReport = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const issueId = id ? parseInt(id, 10) : null;

  const { data: user } = useSWR<UserProfile>("/users/me", fetcher);

  // Загрузка данных заявки
  const {
    data: issue,
    error,
    isLoading,
    mutate,
  } = useSWR<Report>(issueId ? `/reports/${issueId}` : null, fetcher);

  // Обработка ошибки загрузки
  if (error) {
    return (
      <div className="container max-w-4xl mx-auto p-4 md:p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <p className="text-red-600 font-medium">
                Ошибка при загрузке заявки
              </p>
              <p className="text-sm text-red-500">{error.message}</p>
              <Button onClick={() => navigate(`/${FRONT_PATHS.REPORTS}`)}>
                Вернуться к списку заявок
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Проверка существования заявки после загрузки
  if (!isLoading && !issue) {
    return (
      <div className="container max-w-4xl mx-auto p-4 md:p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">Заявка не найдена</p>
              <Button onClick={() => navigate(`/${FRONT_PATHS.REPORTS}`)}>
                Вернуться к списку заявок
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !issue) {
    return <ReportSkeleton />;
  }

  // Форматирование даты
  const formatDate = (date: Date | string | null) => {
    if (!date) return "Не указано";
    const d = new Date(date);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Открытие карты с координатами
  const openMap = () => {
    if (issue.latitude && issue.longitude && issue.statusId !== 5) {
      const url = `/${FRONT_PATHS.APP}?issueId=${issue.issueId}&longitude=${issue.longitude}&latitude=${issue.latitude}`;
      window.open(url, "_blank");
    }
  };

  const onMatureChange = (mature: boolean) => {
    toast.promise(
      async () => {
        const response = await fetcher(`/reports/${issueId}/matureContent`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matureContent: mature }),
        });
        if (response && response.success) {
          await mutate();
        } else {
          console.error(`Ошибка: ${response?.error || "Неизвестная ошибка"}`);
          throw new Error(`Ошибка: ${response?.error || "Неизвестная ошибка"}`);
        }
      },
      {
        loading: "Применяем..",
        success: "Данные обновлены!",
        error: "Не удалось обновить данные!",
      },
    );
  };

  const onDateChange = async (date: Date) => {
    toast.promise(
      async () => {
        const response = await fetcher(
          `/reports/${issueId}/expectedResolutionDate`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedResolutionDate: date.toISOString(),
            }),
          },
        );
        if (response && response.success) {
          await mutate();
        } else {
          console.error(`Ошибка: ${response?.error || "Неизвестная ошибка"}`);
          throw new Error(`Ошибка: ${response?.error || "Неизвестная ошибка"}`);
        }
      },
      {
        loading: "Применяем..",
        success: "Данные обновлены!",
        error: "Не удалось обновить данные!",
      },
    );
  };

  const isAdmin = user?.role === "admin" || user?.role === "superAdmin";
  const isOperator = user?.role === "operator" || user?.role === "superAdmin";

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto p-4 md:p-6">
        {/* Кнопка назад */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Button>
        </div>

        {/* Основная карточка заявки */}
        <Card className="shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div className="space-y-2 flex-1">
                <CardTitle className="text-2xl md:text-3xl break-words">
                  {issue.shortDescription}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {issue.typeName && (
                    <Badge variant="secondary" className="text-sm">
                      {issue.typeName}
                    </Badge>
                  )}
                  <StatusBadge
                    statusName={issue.statusName}
                    statusId={issue.statusId}
                  />
                  {issue.matureContent && <MatureContentBadge />}
                </div>
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                ID: {issue.issueId}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Детальное описание */}
            {issue.detailedDescription && (
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Описание проблемы</h3>
                <div className="p-4 bg-muted/20 rounded-lg whitespace-pre-wrap break-words">
                  {issue.detailedDescription}
                </div>
              </div>
            )}

            <Separator />

            {/* Информация о местоположении */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Местоположение
              </h3>
              <div className="grid gap-3">
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Адрес</p>
                  <p className="font-medium break-words">{issue.address}</p>
                </div>

                {issue.latitude && issue.longitude && (
                  <Button
                    variant="outline"
                    onClick={openMap}
                    disabled={issue.statusId === 5}
                    className="w-full md:w-auto"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    {issue.statusId !== 5
                      ? "Показать на карте"
                      : "Заявка на валидации"}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Информация об авторе */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Информация об авторе
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">
                    Имя пользователя
                  </p>
                  <p className="font-medium">{issue.userName || "Аноним"}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    Баллы
                  </p>
                  <p className="font-medium">{issue.userPoints ?? 0}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Даты */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Даты
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Дата создания
                  </p>
                  <p className="font-medium">{formatDate(issue.createdAt)}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">
                    Ожидаемая дата решения
                  </p>
                  <p className="font-medium">
                    {issue.expectedResolutionDate
                      ? formatDate(issue.expectedResolutionDate)
                      : "Не указана"}
                  </p>
                </div>
              </div>
            </div>
            <Separator />

            {(isAdmin || isOperator) && (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <CogIcon className="w-5 h-5" />
                  Управление
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/20 rounded-lg flex justify-between items-center">
                    <div
                      className={cn(
                        "text-sm mb-1 flex items-center gap-1 text-destructive",
                        issue.matureContent && "text-muted-foreground",
                      )}
                    >
                      {issue.matureContent
                        ? "Пометить как безопасный контент"
                        : "Пометить как опасный контент"}
                    </div>
                    <Checkbox
                      checked={issue.matureContent}
                      onCheckedChange={onMatureChange}
                    />
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Ожидаемая дата решения
                    </p>
                    <div className="font-medium flex justify-between items-center pt-2">
                      <span>Выбрать</span>
                      <DatePickerInput
                        onChange={onDateChange}
                        initValue={issue.expectedResolutionDate}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Фотографии */}
            {issue.links && issue.links.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Фотографии
                  </h3>
                  <ImageGallery
                    images={issue.links.map(
                      (link) => import.meta.env.VITE_MINIO_BASE_URL + link,
                    )}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
