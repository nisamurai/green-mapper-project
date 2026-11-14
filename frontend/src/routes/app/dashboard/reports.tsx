import { format, subHours } from "date-fns";
import { ru } from "date-fns/locale";
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/fetcher";
import type { Report } from "@/types/report";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FRONT_PATHS } from "@/types/paths";
import { useNavigate } from "react-router";
import type { UserProfile } from "./profile";

export const DashboardReports = () => {
    const [showMyOnly, setShowMyOnly] = useState(() => {
        return !!((new URLSearchParams(window.location.search)).get("showMyOnly"));
    });
    const [matureOnly, setMatureOnly] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate()
    const { data: user } = useSWR<UserProfile>("/users/me", fetcher);

    const PAGE_SIZE = 20;

    // SWR Infinite Key Generator
    const getKey = (pageIndex: number, previousPageData: Report[] | null) => {
        // If we reached the end, return null to stop fetching
        if (previousPageData && !previousPageData.length) return null;

        const params = new URLSearchParams({
            limit: PAGE_SIZE.toString(),
            skip: (pageIndex * PAGE_SIZE).toString(),
            showMyOnly: showMyOnly.toString(),
        });
        if (matureOnly) params.set("showMatureOnly", "true");

        return `/reports/?${params.toString()}`;
    };

    const { data, setSize, isValidating } = useSWRInfinite<Report[]>(
        getKey,
        fetcher,
        { 
            // revalidateFirstPage: false,
            persistSize: true 
        }
    );

    // Flatten pages [[page1], [page2]] into a single array [item1, item2...]
    const allReports = data ? data.flat() : [];
    const isReachingEnd = data && data[data.length - 1]?.length < PAGE_SIZE;

    // Intersection Observer to trigger next page
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !isReachingEnd && !isValidating) {
                    setSize((prev) => prev + 1);
                }
            },
            { threshold: 0.1 }
        );

        if (sentinelRef.current) observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [isReachingEnd, isValidating, setSize]);

    return (
        <div className="flex flex-1 flex-col gap-4 p-4 overflow-x-auto">
			<h1 className="text-xl font-bold">Список заявок</h1>
            {/* Filter Toggle */}
            <div className="flex gap-2 mb-4">
                <Button
                    variant={!showMyOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                        setShowMyOnly(false);
                        setSize(1); // Reset to first page on filter change
                    }}
                >
                    Все заявки
                </Button>
                <Button
                    variant={showMyOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                        setShowMyOnly(true);
                        setSize(1); // Reset to first page on filter change
                    }}
                >
                    Мои заявки
                </Button>
                {user?.hasAccessToMatureContent && (
                    <Label htmlFor="reportsShowMatureOnly" className="flex items-center gap-2">
                        <Checkbox
                            id="reportsShowMatureOnly"
                            checked={matureOnly}
                            onCheckedChange={(checked) => {
                                setMatureOnly(checked === true);
                                setSize(1);
                            }}
                        />
                        Только опасные заявки
                    </Label>
                )}
            </div>
            
            <Table className="w-full min-w-[900px] md:table-fixed">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[40px] whitespace-normal break-words">
                            ID
                        </TableHead>
                        <TableHead className="min-w-[20px] max-w-[60px] whitespace-normal break-words">
                        </TableHead>
                        <TableHead className="min-w-[30px] max-w-[90px] whitespace-normal break-words">
                            Статус
                        </TableHead>
                        <TableHead className="min-w-[30px] max-w-[150px] whitespace-normal break-words wrap-anywhere">
                            Тип
                        </TableHead>
                        <TableHead className="min-w-[30px] max-w-[160px] whitespace-normal break-words">
                            Короткое описание
                        </TableHead>
                        <TableHead className="whitespace-normal break-words">
                            Полное описание
                        </TableHead>
                        <TableHead className="min-w-[30px] max-w-[150px] whitespace-normal break-words">
                            Адрес
                        </TableHead>
                        <TableHead className="min-w-[30px] max-w-[120px] whitespace-normal break-words">
                            Дата создания
                        </TableHead>
                        <TableHead className="min-w-[30px] max-w-[200px] whitespace-normal break-words">
                            Ожидаемая дата решения
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {allReports.map((report) => (
                        <TableRow key={report.issueId}>
                            <TableCell className="font-medium whitespace-normal break-words overflow-hidden text-ellipsis">
                                {report.issueId}
                            </TableCell>
                            <TableCell className="font-xs whitespace-normal break-words overflow-hidden text-ellipsis text-center">
                            	<Button
									variant="outline" // Белый контур
									size="sm"
									onClick={() => navigate(`/${FRONT_PATHS.APP}/${FRONT_PATHS.REPORTS}/${report.issueId}`)}
								>
									открыть
								</Button>
                            </TableCell>
                            <TableCell className="whitespace-normal break-words overflow-hidden text-ellipsis">
                                {report.statusName}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words overflow-hidden text-ellipsis">
                                {report.typeName}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words overflow-hidden text-ellipsis">
                                {report.shortDescription}
                            </TableCell>
                            <TableCell className="min-w-[200px] whitespace-normal break-words">
                                {report.detailedDescription || (
                                    <span className="text-gray-500">Нет</span>
                                )}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words overflow-hidden text-ellipsis">
                                {report.address}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words">
                                {report.createdAt
                                    ? format(
                                            subHours(new Date(report.createdAt), 0),
                                            "dd.MM.yyyy HH:mm",
                                            { locale: ru }
                                        )
                                    : "Нет данных"}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words">
                                {report.expectedResolutionDate &&
                                    format(
                                        new Date(report.expectedResolutionDate),
                                        "dd.MM.yyyy HH:mm",
                                        { locale: ru }
                                    )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Scroll Sentinel */}
            <div ref={sentinelRef} className="py-8 flex justify-center">
                {isValidating && !isReachingEnd && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        Загрузка...
                    </div>
                )}
                {isReachingEnd && allReports.length > 0 && (
                    <span className="text-sm text-muted-foreground">Вы просмотрели все заявки</span>
                )}
            </div>
        </div>
    );
};