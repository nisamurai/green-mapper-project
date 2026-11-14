import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import useSWRInfinite from "swr/infinite";
import { getRoleLabel } from "@/lib/utils";
import { fetcher } from "@/lib/fetcher";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const SCROLL_THRESHOLD = 200;

type Role = "user" | "admin" | "operator" | "superAdmin";

interface UserDataShort {
  id: string;
  name: string;
  email: string;
  role: Role;
  hasAccessToMatureContent: boolean;
}

interface UpdateData {
  id: string | null;
  role: Role;
  hasAccessToMatureContent: boolean;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "user", label: getRoleLabel("user") },
  { value: "operator", label: getRoleLabel("operator") },
  { value: "admin", label: getRoleLabel("admin") },
  { value: "superAdmin", label: getRoleLabel("superAdmin") },
];

const userLabel = (u: UserDataShort) => `${u.name} — ${u.email}`;

export const AccessMangment: FC = () => {
  const navigate = useNavigate();

  // -------- list (infinite + server search) --------
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const getKey = useCallback(
    (pageIndex: number, prev: UserDataShort[] | null) => {
      if (prev && prev.length < PAGE_SIZE) return null;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String(pageIndex * PAGE_SIZE),
      });
      if (debouncedSearch) params.set("searchParam", debouncedSearch);
      return `/users/all?${params.toString()}`;
    },
    [debouncedSearch],
  );

  const { data, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<UserDataShort[]>(getKey, fetcher, {
      //   revalidateFirstPage: false,
    });

  useEffect(() => {
    setSize(1);
  }, [debouncedSearch, setSize]);

  const users = useMemo(() => data?.flat() ?? [], [data]);
  const isEmpty = data?.[0]?.length === 0;
  const isReachingEnd =
    isEmpty ||
    (data != null && (data[data.length - 1]?.length ?? 0) < PAGE_SIZE);

  const isLoadingMore =
    isLoading ||
    (size > 0 && data != null && typeof data[size - 1] === "undefined") ||
    (size > 0 && isValidating);

  const loadMore = useCallback(() => {
    if (isLoadingMore || isReachingEnd) return;
    setSize(size + 1);
  }, [isLoadingMore, isReachingEnd, setSize, size]);

  // -------- form --------
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<UpdateData>({
    defaultValues: {
      id: null,
      role: "operator",
      hasAccessToMatureContent: false,
    },
  });

  // -------- selection --------
  const [selectedUser, setSelectedUser] = useState<UserDataShort | null>(null);
  // Ref used to avoid stale-closure issues inside onInputValueChange
  const selectedUserRef = useRef<UserDataShort | null>(null);

  const handleSelect = useCallback(
    (u: UserDataShort | null) => {
      selectedUserRef.current = u;
      setSelectedUser(u);
      setValue("id", u?.id ?? null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      if (u) {
        setValue("role", u.role);
        setValue("hasAccessToMatureContent", u.hasAccessToMatureContent);
      }
    },
    [setValue],
  );

  const handleInputValueChange = useCallback(
    (v: string) => {
      const current = selectedUserRef.current;
      // Base UI fires this callback when we set a value → input shows the label.
      // Skip that case so we don't clear our own selection.
      if (current && v === userLabel(current)) return;
      if (current) handleSelect(null);
      setSearch(v);
    },
    [handleSelect],
  );

  // Display: label of selected user, otherwise the current search text
  const inputValue = selectedUser ? userLabel(selectedUser) : search;

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD) {
      loadMore();
    }
  };

  // -------- submit --------
  const onSubmit = async (values: UpdateData) => {
    if (values.id == null) return;
    toast.promise(
      async () => {
        const response = await fetcher(`/users/${values.id}/change_access`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: values.role,
            matureContent: values.hasAccessToMatureContent,
          }),
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto p-4 md:p-6">
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

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">
              Управление доступом
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* user picker */}
              <div className="space-y-2">
                <Label>Пользователь</Label>
                <Controller
                  control={control}
                  name="id"
                  rules={{
                    validate: (v) => v != null || "Выберите пользователя",
                  }}
                  render={() => (
                    <Combobox
                      items={users}
                      value={selectedUser ?? undefined}
                      onValueChange={(u) => handleSelect(u ?? null)}
                      inputValue={inputValue}
                      onInputValueChange={handleInputValueChange}
                      filter={() => true}
                      itemToStringLabel={userLabel}
                      isItemEqualToValue={(a, b) => a?.id === b?.id}
                    >
                      <ComboboxInput
                        placeholder="Найти пользователя..."
                        showClear
                      />
                      <ComboboxContent>
                        <ComboboxList onScroll={handleListScroll}>
                          {(item: UserDataShort) => (
                            <ComboboxItem key={item.id} value={item}>
                              <div className="flex flex-col">
                                <span>{item.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {item.email}
                                </span>
                              </div>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                        {isLoadingMore && (
                          <div className="flex justify-center py-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        )}
                        <ComboboxEmpty>
                          {isLoading ? "Загрузка..." : "Не найдено"}
                        </ComboboxEmpty>
                      </ComboboxContent>
                    </Combobox>
                  )}
                />
                {errors.id && (
                  <p className="text-sm text-destructive">
                    {errors.id.message}
                  </p>
                )}
              </div>

              <Separator />

              {/* role + mature flag */}
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">
                <div className="space-y-2">
                  <Label>Роль</Label>
                  <Controller
                    control={control}
                    name="role"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Выберите роль" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Controller
                    control={control}
                    name="hasAccessToMatureContent"
                    render={({ field }) => (
                      <Checkbox
                        id="mature-content"
                        checked={field.value}
                        onCheckedChange={(c) => field.onChange(c === true)}
                      />
                    )}
                  />
                  <Label htmlFor="mature-content" className="cursor-pointer">
                    Доступ к опасному контенту
                  </Label>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting || selectedUser == null}
                  className="gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Сохранить
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
