import { fetcher } from "@/lib/fetcher";
import { FRONT_PATHS } from "@/types/paths";
import { EyeIcon, SquareX } from "lucide-react";
import { defaults as defaultControls,  } from "ol/control";
import type { Coordinate } from "ol/coordinate";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Vector as VectorLayer } from "ol/layer";
import TileLayer from "ol/layer/Tile";
import Map from "ol/Map";
import MapBrowserEvent from 'ol/MapBrowserEvent';
import "ol/ol.css";
import Overlay from "ol/Overlay";
import { fromLonLat, toLonLat } from "ol/proj";
import { OSM, Vector as VectorSource } from "ol/source";
import { Icon, Style } from "ol/style";
import View from "ol/View";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { QuickReportButton } from "./quick-report-button";
import { getWidth } from 'ol/extent';
import useSWRInfinite from "swr/infinite";

// Определите тип для заявки с учетом данных пользователя и типа
interface Report {
	issueId: number;
	latitude: string | null;
	longitude: string | null;
	shortDescription?: string;
	userName: string | null;
	userPoints: number | null;
	matureContent: string | null;
	typeName: string | null; // Добавляем поле для типа заявки
}
const extentRussia = [
	// Примерный bbox для Российской Федерации (без учёта anti-meridian wrap)
	...fromLonLat([19.6389, 41.185]), // запад/юг (Калининград / юг РФ)
	...fromLonLat([180, 82.0]), // восток (до 180°) / север (мыс Челюскин)
];
const DefaultCenter = fromLonLat([30.3, 59.95])
function moveTo(map: Map, coordinate: Coordinate, targetZoom = 17) {
	map.renderSync()
	
  setTimeout(() => {
    const view = map.getView();
	
    view.animate({
		center: coordinate,
		zoom: targetZoom,
		duration: 600,
    }, 
  );
}, 100);
}

function DarkMapSPB() {
	const [popupInfo, setPopupInfo] = useState<{
		coordinate: number[];
		pixel: number[];
		issue?: Report; // Поле для хранения данных о кликнутой заявке
	} | null>(null);
	const mapRef = useRef<Map | null>(null);
	const navigate = useNavigate();
	// Используем useRef для стабильных ссылок на источники и слои
	const issueMarkerSourceRef = useRef(new VectorSource());
	const latestIssuesDataRef = useRef<Report[]>([]);
	const isFetchingIp = useRef(false)
	const issueMarkerLayerRef = useRef(new VectorLayer({
		source: issueMarkerSourceRef.current,
		style: new Style({
			image: new Icon({
				src: "/imgs/small-icon-label.png",
				anchor: [0.5, 1],
				crossOrigin: "anonymous",
			}),
		}),
	}));

	console.log(popupInfo)

	const tempMarkerSourceRef = useRef(new VectorSource());
	const tempMarkerLayerRef = useRef(new VectorLayer({
		source: tempMarkerSourceRef.current,
		style: new Style({
			image: new Icon({
				src: "/imgs/small-icon-label.png", // Можно использовать другую иконку
				anchor: [0.5, 1],
				crossOrigin: "anonymous",
			}),
		}),
	}));
	const mapContainerRef = useRef<HTMLDivElement>(null);
	const isFirstLoadHandled = useRef(false);
	const [mapBounds, setMapBounds] = useState<{
		lat: number;
		lon: number;
		distance: number;
	} | null>(() => {
		const params = new URLSearchParams(window.location.search);
		const lat = params.get("latitude");
		const lon = params.get("longitude");
		
		if (lat && lon) {
			return {
				lat: parseFloat(lat),
				lon: parseFloat(lon),
				distance: 0.05 // A default zoom-in distance
			};
		}
		return null; 
	});

	// Update getKey to use this state
	const getKey = (_pageIndex: number, previousPageData: Report[] | null) => {
		if (previousPageData && !previousPageData.length) return null;
		if (!mapBounds) return null; // Don't fetch until we have bounds

		const params = new URLSearchParams({
			limit: "1000",
			latitude: mapBounds.lat.toString(),
			longitude: mapBounds.lon.toString(),
			distance: mapBounds.distance.toString(),
		});

		return `/reports/?${params.toString()}`;
	};

    const { data, error: issuesError, isLoading } = useSWRInfinite<Report[]>(
        getKey,
        fetcher,
        { 
            revalidateFirstPage: false,
            persistSize: true 
        }
    );

	const issuesData = data ? data.flat() : []

	// Основной эффект для инициализации карты.
	useEffect(() => {
		console.log("Map initialization effect running");

		let resizeObserver: ResizeObserver | null = null;
        let animationFrameId: number | null = null;

		// Функция для проверки размеров контейнера и инициализации карты с использованием requestAnimationFrame
		const checkDimensionsAndInitialize = () => {
            const currentMapTarget = mapContainerRef.current;
            if (!currentMapTarget) {
                 console.warn("#map element disappeared, stopping dimension check.");
                 return; // Элемент исчез, останавливаем проверку
            }

            const { clientWidth, clientHeight } = currentMapTarget;
            console.log(`Map target dimensions (raf check): ${clientWidth}x${clientHeight}`);

            if (clientWidth > 0 && clientHeight > 0) {
                console.log("Map target has dimensions, initializing map...");

                const map = new Map({
                    target: currentMapTarget,
                    layers: [
                        new TileLayer({
                            source: new OSM({ attributions: "", maxZoom: 19 }),
                        }),
                        issueMarkerLayerRef.current,
                        tempMarkerLayerRef.current,
                    ],
                    view: new View({
                        center: mapBounds ? fromLonLat([mapBounds.lon, mapBounds.lat]) : DefaultCenter,
                        zoom: 10,
                        maxZoom: 20,
                        extent: extentRussia,
                    }),
                    controls: defaultControls({ zoom: true }),
                });

                mapRef.current = map;

                const popup = new Overlay({
                    element: document.getElementById("map-popup")!,
                    autoPan: false,
                    
                });
                map.addOverlay(popup);

                console.log("Initial map.updateSize() called after dimensions check.");

				// Inside checkDimensionsAndInitialize, after map is created:
				map.on("moveend", () => {
					const view = map.getView();
					const center = toLonLat(view.getCenter()!);
					const extent = view.calculateExtent(map.getSize());
					const distance = getWidth(extent) / 2000;

					setMapBounds({
						lon: center[0],
						lat: center[1],
						distance: distance
					});
				});

                // Обработчик клика по карте
                map.on("click", (event) => {
                    console.log("Map clicked");
                    const feature = map.forEachFeatureAtPixel(event.pixel, function (feature) {
                        return feature as Feature<Point>;
                    });

                    // Скрываем попап и очищаем временную метку при любом новом клике
                    setPopupInfo(null);
                    popup.setPosition(undefined);
                    tempMarkerSourceRef.current.clear();


                    if (feature) {
                        // Если клик был по существующей метке заявки
                        const clickedIssueId = feature.get('issueId');
                        // Находим полную информацию о заявке по ID из загруженных данных
                        const clickedIssue = latestIssuesDataRef.current.find(issue => issue.issueId === clickedIssueId);
						console.log("clicked iss", clickedIssue, issuesData)

                        if (clickedIssue) {
                            const coordinate = (feature.getGeometry() as Point).getCoordinates();
                            const lonLat = toLonLat(coordinate);
                            // Устанавливаем информацию о кликнутой заявке для попапа
                            setPopupInfo({ coordinate: lonLat, pixel: event.pixel, issue: clickedIssue });
                            popup.setPosition(coordinate);
							moveTo(map, coordinate)
                        }

                    } else {
                        // Если клик был по пустой области карты
                        const coordinate = event.coordinate;
                        const lonLat = toLonLat(coordinate);

                        // Создаем новую временную метку и добавляем ее на слой временных меток
                        const tempMarker = new Feature({
                            geometry: new Point(coordinate),
                        });
                        tempMarkerSourceRef.current.addFeature(tempMarker);

                        // Устанавливаем информацию о координатах для создания новой заявки в попап
                        // Поле 'issue' отсутствует, что используется для определения типа попапа
                        setPopupInfo({ coordinate: lonLat, pixel: event.pixel });
                        popup.setPosition(coordinate);
						moveTo(map, coordinate)
                    }
                });

                // После успешной инициализации карты начинаем наблюдение за изменениями размеров
                resizeObserver = new ResizeObserver(() => {
                    if (mapRef.current) {
                        console.log("Map container resized, updating map size");
                        mapRef.current.updateSize();
                    }
                });
                resizeObserver.observe(currentMapTarget);

                 // Очищаем запрос requestAnimationFrame после успешной инициализации
                if (animationFrameId !== null) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }


            } else {
                 // Размеры все еще нулевые, планируем следующую проверку на следующий кадр анимации
                 console.log("Map target has zero dimensions, requesting next animation frame...");
                 animationFrameId = requestAnimationFrame(checkDimensionsAndInitialize);
            }
        };

		if (!mapContainerRef.current) {
			console.error("Map target element #map not found!");
            requestAnimationFrame(() => {
                console.log("Retrying to find #map element...");
                checkDimensionsAndInitialize();
            });
			return;
		}

        // Начинаем процесс проверки размеров и инициализации
        checkDimensionsAndInitialize();


		// Функция очистки при размонтировании компонента
		return () => {
			console.log("Map cleanup running");
            // Отключаем наблюдателя и отменяем запрос requestAnimationFrame
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }

            // Удаляем карту, только если она была успешно создана
            if (mapRef.current) {
			    mapRef.current.setTarget(undefined);
			    mapRef.current = null;
            }
			issueMarkerSourceRef.current.clear();
			tempMarkerSourceRef.current.clear();
		};
    // Этот эффект должен запускаться когда обновляются завки
	}, []);

	useEffect(() => {
		if(isLoading) return
		latestIssuesDataRef.current = issuesData || [];
		const source = issueMarkerSourceRef.current;
		if (!issuesData) return;

		const existingFeatures = source.getFeatures();
		const existingFeaturesMap = new Map();
		existingFeatures.forEach(el => {
			existingFeaturesMap.set(el.get('issueId').toString(), el)
		})

		const newDataIds = new Set(latestIssuesDataRef.current.map(i => i.issueId));
		// 1. REMOVE: If it's on map but gone from DB
		existingFeatures.forEach(feature => {
			const id = feature.get('issueId');
			if (!newDataIds.has(id)) {
				source.removeFeature(feature);
			}
		});

		// 2. PROCESS DATA: Add new or Update existing
		issuesData.forEach(issue => {
			const existingFeature = existingFeaturesMap.get(issue.issueId.toString());

			if (existingFeature) {
				// CASE: UPDATE
				// This updates the metadata without touching the geometry/icon.
				// No blinking occurs.
				existingFeature.setProperties({
					shortDescription: issue.shortDescription,
					userName: issue.userName,
					userPoints: issue.userPoints,
					typeName: issue.typeName,
				});
			} else {
				// CASE: ADD
				if (!issue.latitude || !issue.longitude) return;
				const lat = parseFloat(issue.latitude);
				const lon = parseFloat(issue.longitude);

				if (!isNaN(lat) && !isNaN(lon)) {
					const marker = new Feature({
						geometry: new Point(fromLonLat([lon, lat])),
						issueId: issue.issueId,
						shortDescription: issue.shortDescription,
						userName: issue.userName,
						userPoints: issue.userPoints,
						typeName: issue.typeName,
					});
					source.addFeature(marker);
				}
			}
		});
	}, [issuesData]);

	
useEffect(() => {
	if (!mapRef.current || isFirstLoadHandled.current) return;
	const map = mapRef.current

	const searchParams = new URLSearchParams(location.search)
    const longitude = searchParams.get("longitude") || ''
    const latitude = searchParams.get("latitude") || ''
    const issueId = searchParams.get("issueId") || ''

	let coordinate: Coordinate | undefined = undefined

	if (issueId) {
		const issue = latestIssuesDataRef.current.find(i => i.issueId === parseInt(issueId));
		if (issue?.latitude && issue?.longitude) {
			coordinate = fromLonLat([parseFloat(issue.longitude), parseFloat(issue.latitude)]);
		}
	} else if (longitude && latitude) {
		coordinate = fromLonLat([parseFloat(longitude), parseFloat(latitude)]);
	} else {
		if(isFetchingIp.current) return
		isFetchingIp.current = true
		fetch('https://api.ipify.org?format=json')
		.then(response => response.json())
		.then(data => 
			{
				if(!data.ip) throw new Error("no ip received")
				return fetch(`/ip/json/${data.ip}`)
			}
		)
		.then(response => response.json())
		.then(data => {
			console.log(data)
			const lon = Number(data.lon);
			const lat = Number(data.lat);
			const projected = fromLonLat([lon, lat]);
			const point = new Point(projected);
			if(!Number.isNaN(lon) && !Number.isNaN(lat) && point.intersectsExtent(extentRussia)) {
				moveTo(map, projected, 12)
			} else {
				moveTo(map, DefaultCenter, 12)
			}
			isFirstLoadHandled.current = true
		}).catch(error => {
			console.log(error)
		}).finally(()=> {
			isFetchingIp.current = false
		})
	}
	if(coordinate) {
		isFirstLoadHandled.current = true
		setTimeout(() => {
			const pixel = map.getPixelFromCoordinate(coordinate);
			if (!pixel) return;
			pixel[1]-=10 // ^ чтобы попасть на всплывашку
			const event = new MapBrowserEvent<KeyboardEvent | WheelEvent | PointerEvent>("click", map, new PointerEvent("click"));
			event.coordinate = coordinate
			event.pixel = pixel
			map.dispatchEvent(event);
		}, 100)
	}
}, [issuesData]);

	// Обработчик кнопки "Создать заявку"
	const handleCreateReport = () => {
		// Проверяем, что popupInfo существует и не содержит информации о существующей заявке
		if (popupInfo && !popupInfo.issue) {
			const { coordinate } = popupInfo;

			navigate(
				`/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.CREATE_REPORT}?latitude=${coordinate[1]}&longitude=${coordinate[0]}`,
			);
		}
	};

	// Обработка ошибки загрузки заявок
	if (issuesError) {
		return <div>Ошибка загрузки заявок: {issuesError.message}</div>;
	}

	// Отображение загрузки заявок (опционально)
	if (!issuesData) {
		return <div>Загрузка заявок...</div>;
	}

	return (
		<div style={{ width: "100%", height: "100%", position: "relative" }}>
			{/* Элемент, куда будет рендериться карта OpenLayers */}
			<div id="map" ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

			{/* Кнопка быстрого отчёта - только на мобильных устройствах */}
			<div
				className="fixed bottom-6 left-6 z-40 md:hidden"
			>
				<QuickReportButton />
			</div>

			{/* Попап для отображения информации о заявке или создания новой */}
			<div
				id="map-popup"
				className="ol-popup"
				style={{
					backgroundColor: "#333",
					color: "white",
					padding: "10px",
					borderRadius: "5px",
					border: "1px solid black",
					position: "absolute",
					bottom: "12px",
					left: "-50px",
                    // Увеличиваем ширину попапа
					width: "250px", // Увеличено с 200px до 250px (можно настроить)
					// Отображаем попап только если есть информация в popupInfo
					display: popupInfo ? 'block' : 'none'
				}}
			>
				<div onClick={() => {
					tempMarkerSourceRef.current.clear();
					setPopupInfo(null)
					// if(e.currentTarget.parentNode) {
					// 	e.currentTarget.parentNode.setPosition(undefined);
					// }
				}}
				style={{
					position: "absolute",
					top: "5px",
					right: "5px"
				}}
				title="закрыть"
				>
					<SquareX />
				</div>
				{popupInfo?.issue && (
					<div onClick={() => {
						if(popupInfo.issue) {
							navigate(`/${FRONT_PATHS.APP}/${FRONT_PATHS.REPORTS}/${popupInfo.issue.issueId}`);
						}
					}}
					style={{
						position: "absolute",
						top: "35px",
						right: "5px"
					}}
					title="подробнее"
					>
						<EyeIcon />
					</div>
				)}
				
				{/* Проверяем, есть ли информация в popupInfo перед отображением содержимого */}
				{popupInfo && (
					<div>
						{popupInfo.issue ? (
							// Попап для отображения информации о существующей заявке
							<>
								<h4>Информация о заявке</h4>
								<p>ID заявки: {popupInfo.issue.issueId}</p>
                                {/* Добавляем отображение типа заявки с явным переносом строк */}
                                {/* Используем style={{ wordBreak: 'break-word' }} для переноса длинных слов */}
                                <p style={{ wordBreak: 'break-word' }}>Тип заявки: {popupInfo.issue.typeName || 'Неизвестно'}</p>
								<p style={{ wordBreak: 'break-word' }}>Описание: {popupInfo.issue.shortDescription || 'Нет описания'}</p>
								<p>Создатель: {popupInfo.issue.userName || 'Неизвестно'}</p>
								<p>Рейтинг создателя: {popupInfo.issue.userPoints !== null ? popupInfo.issue.userPoints : 'Нет данных'}</p>
								{popupInfo.issue.matureContent && <p className="text-destructive">Опасное содержание!</p>}
								{/* Опционально: кнопка для перехода к полной информации о заявке */}
								{/* <button onClick={() => navigate(`/${FRONT_PATHS.APP}/${FRONT_PATHS.DASHBOARD}/${FRONT_PATHS.REPORTS}/${popupInfo.issue.issueId}`)}>Подробнее</button> */}
							</>
						) : (
							// Попап для создания новой заявки (клик по пустой области)
							<>
								<h4>Создать новую заявку</h4>
								<p>
									Координаты:{" "}
									{popupInfo.coordinate.map((coord) => coord.toFixed(7)).join(", ")}
								</p>
								<button
									onClick={handleCreateReport}
									style={{
										backgroundColor: "#555",
										color: "white",
										border: "none",
										padding: "5px 10px",
										borderRadius: "3px",
										cursor: "pointer",
									}}
								>
									Создать заявку
								</button>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export default DarkMapSPB;