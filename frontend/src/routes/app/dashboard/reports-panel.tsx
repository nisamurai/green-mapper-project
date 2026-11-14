import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { format, subHours } from "date-fns";
import { ru } from "date-fns/locale";

import useSWRInfinite from "swr/infinite"; // Смена на Infinite
import useSWR, { mutate } from "swr";
import { fetcher } from "@/lib/fetcher";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { toast } from "sonner";
import type { UserProfile } from "./profile";
import { FRONT_PATHS } from "@/types/paths";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface Report {
  issueId: number;
  shortDescription: string;
  detailedDescription?: string;
  address: string;
  createdAt: string;
  expectedResolutionDate?: string;
  statusName: string;
  typeName: string;
  statusId: number;
  userName?: string | null;
  userPoints?: number | null;
  matureContent: boolean;
}

const IssueStatuses = {
  PENDING: 1,
  IN_WORK: 2,
  FINISHED: 3,
  DECLINED: 4,
} as const;

export const DashboardReportsPanel = () => {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  const [matureOnly, setMatureOnly] = useState(false);

  const { data: user } = useSWR<UserProfile>("/users/me", fetcher);
  const isOperator = user?.role === "operator";

  // Генератор ключа для SWR Infinite
  const getKey = (pageIndex: number, previousPageData: Report[] | null) => {
    if (previousPageData && !previousPageData.length) return null; // Конец данных
    return `/reports/?limit=${PAGE_SIZE}&skip=${pageIndex * PAGE_SIZE}${matureOnly ? "&showMatureOnly=true" : ""}`;
  };

  const { data, setSize, error, isValidating, isLoading } =
    useSWRInfinite<Report[]>(getKey, fetcher, { revalidateFirstPage: false });

  // Плоский список заявок из всех загруженных страниц
  const allIssues = data ? data.flat() : [];
  const isReachingEnd = data && data[data.length - 1]?.length < PAGE_SIZE;

  // Наблюдатель (Intersection Observer) для автоматической подгрузки
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isReachingEnd && !isValidating) {
          setSize((prev) => prev + 1);
        }
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isReachingEnd, isValidating, setSize]);

  const handleDelete = async (issueId: number) => {
    try {
      const response = await fetcher(`/reports/${issueId}`, {
        method: "DELETE",
      });
      if (response && response.success) {
        mutate(getKey); // Обновляем весь кэш бесконечного списка
        toast.success(`Заявка #${issueId} успешно удалена.`);
      } else {
        toast.error(`Ошибка: ${response?.error || "Неизвестная ошибка"}`);
      }
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message || "Ошибка сети."}`);
    }
  };

  const handleSetStatus = async (issueId: number, status: number) => {
    try {
      const response = await fetcher(`/reports/${issueId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: status }),
      });
      if (response && response.success) {
        mutate(getKey);
        toast.success(`Статус заявки #${issueId} изменен.`);
      } else {
        toast.error(`Ошибка: ${response?.error || "Неизвестная ошибка"}`);
      }
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message || "Ошибка сети."}`);
    }
  };

  const handleDetails = (issueId: number) => {
    navigate(`/${FRONT_PATHS.APP}/${FRONT_PATHS.REPORTS}/${issueId}`);
  };

  if (isLoading && allIssues.length === 0) return <div>Загрузка заявок...</div>;
  if (error) return <div>Ошибка загрузки: {error.message}</div>;

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Панель управления заявками</h1>
          {user?.hasAccessToMatureContent && (
            <Label htmlFor="showMatureOnly">
              <Checkbox id="showMatureOnly" checked={matureOnly} onCheckedChange={(value) => setMatureOnly(value === true)} />
              Только опасные заявки
            </Label>
          )}
        </div>

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Действия</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Короткое описание</TableHead>
                <TableHead>Дата создания</TableHead>
                <TableHead>Ожидаемая дата решения</TableHead>
                <TableHead>Дополнительно</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allIssues.length > 0 ? (
                allIssues.map((issue) => (
                  <TableRow key={issue.issueId}>
                    <TableCell className="flex flex-wrap gap-2">
                      {(issue.statusId === IssueStatuses.PENDING ||
                        issue.statusId === IssueStatuses.IN_WORK) && (
                        <Button
                          variant="destructive"
                          className="w-4/5"
                          size="sm"
                          onClick={() =>
                            handleSetStatus(
                              issue.issueId,
                              IssueStatuses.DECLINED,
                            )
                          }
                        >
                          Отклонить
                        </Button>
                      )}
                      {(issue.statusId === IssueStatuses.FINISHED ||
                        issue.statusId === IssueStatuses.DECLINED) && (
                        <Button
                          variant="destructive"
                          className="w-4/5"
                          size="sm"
                          onClick={() => handleDelete(issue.issueId)}
                        >
                          Удалить
                        </Button>
                      )}
                      {!isOperator ? (
                        issue.statusId === IssueStatuses.PENDING ? (
                          <Button
                            variant="secondary"
                            className="w-4/5"
                            size="sm"
                            onClick={() =>
                              handleSetStatus(
                                issue.issueId,
                                IssueStatuses.IN_WORK,
                              )
                            }
                          >
                            Начать рассмотрение
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="w-4/5"
                            size="sm"
                            onClick={() =>
                              handleSetStatus(
                                issue.issueId,
                                IssueStatuses.PENDING,
                              )
                            }
                          >
                            Вернуть в обработку
                          </Button>
                        )
                      ) : (
                        issue.statusId === IssueStatuses.IN_WORK && (
                          <Button
                            variant="secondary"
                            className="w-4/5"
                            size="sm"
                            onClick={() =>
                              handleSetStatus(
                                issue.issueId,
                                IssueStatuses.FINISHED,
                              )
                            }
                          >
                            Пометить как выполненную
                          </Button>
                        )
                      )}
                      <Button
                        variant="outline"
                        className="w-4/5"
                        size="sm"
                        onClick={() => handleDetails(issue.issueId)}
                      >
                        Подробнее
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {issue.issueId}
                    </TableCell>
                    <TableCell>{issue.statusName}</TableCell>
                    <TableCell className="whitespace-normal break-words min-w-[200px]">
                      {issue.shortDescription}
                    </TableCell>
                    <TableCell>
                      {issue.createdAt
                        ? format(
                            subHours(new Date(issue.createdAt), 0),
                            "dd.MM.yyyy HH:mm",
                            { locale: ru },
                          )
                        : "Нет данных"}
                    </TableCell>
                    <TableCell>
                      {issue.expectedResolutionDate
                        ? format(
                            new Date(issue.expectedResolutionDate),
                            "dd.MM.yyyy HH:mm",
                            { locale: ru },
                          )
                        : "Нет данных"}
                    </TableCell>
                    <TableCell className="text-destructive">
                      {issue.matureContent && "Опасный контент!"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Нет заявок для отображения.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Sentinel для бесконечного скролла */}
        <div ref={sentinelRef} className="py-4 flex justify-center">
          {isValidating && !isReachingEnd && (
            <div className="text-sm text-muted-foreground animate-pulse">
              Загрузка дополнительных данных...
            </div>
          )}
          {isReachingEnd && allIssues.length > 0 && (
            <div className="text-xs uppercase tracking-widest text-muted-foreground/50">
              Все данные загружены
            </div>
          )}
        </div>
      </div>
    </>
  );
};
