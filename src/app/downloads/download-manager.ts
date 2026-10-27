import { Service, DestroyRef, inject } from '@angular/core';
import { DownloadItem } from './download-item';
import { BehaviorSubject, Observable, Subject, interval, scan, distinctUntilChanged, filter, finalize, map, mergeMap, takeWhile, takeUntil, catchError, of, EMPTY } from 'rxjs';
import { DownloadEvent } from './download-event';
import { downloadReducer } from './download-reducer';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const defaultDownloads: DownloadItem[] = [
    {
        id: '1',
        name: 'python-3.14.pkg',
        size: 120_000_000,
        loaded: 0,
        speed: 0,
        status: 'queued'
    },
    {
        id: '2',
        name: 'luajit.tar.gz',
        size: 15_000_000,
        loaded: 0,
        speed: 0,
        status: 'queued'
    },
    {
        id: '3',
        name: 'docker-compose.pkg',
        size: 45_000_000,
        loaded: 0,
        speed: 0,
        status: 'queued'
    }
];


const DOWNLOADS_STORAGE_KEY = 'download-manager-downloads';

function loadDownloads(): DownloadItem[] {
    try {
        const saved = localStorage.getItem(DOWNLOADS_STORAGE_KEY);

        if (!saved) {
            return defaultDownloads;
        }

        const downloads: unknown = JSON.parse(saved);

        if (!Array.isArray(downloads)) {
            return defaultDownloads;
        }

        return downloads
            .filter((item): item is DownloadItem =>
                typeof item?.id === 'string' &&
                typeof item?.name === 'string' &&
                typeof item?.size === 'number' &&
                typeof item?.loaded === 'number' &&
                typeof item?.speed === 'number' &&
                ['queued', 'downloading', 'paused', 'completed', 'cancelled', 'failed']
                    .includes(item?.status)
            )
            .map(download => ({
                ...download,
                speed: 0,
                status: download.status === 'downloading'
                    ? 'paused'
                    : download.status
            }));
    } catch {
        console.warn('Не удалось восстановить загрузки');
        return defaultDownloads;
    }
}

const initialDownloads = loadDownloads();


/**
 interval(500) создаёт периодические события;

map() рассчитывает новый прогресс на основе текущего состояния;

takeWhile(..., true) пропускает последнее событие, которое доводит загрузку до 100%;

takeUntil(stop$) завершает поток при паузе или отмене;

finalize() очищает запись из stopRequests.
 */
@Service()
export class DownloadManager {
    private readonly startRequests$ = new Subject<string>();
    private readonly stopRequests = new Map<string, Subject<void>>();
    private readonly eventsSubject = new Subject<DownloadEvent>();
    private readonly downloadsSubject = new BehaviorSubject<DownloadItem[]>(initialDownloads);
    private readonly destroyRef = inject(DestroyRef);

    readonly downloads$: Observable<DownloadItem[]> = this.downloadsSubject.asObservable();

    readonly allCompleted$: Observable<void> = this.downloads$
        .pipe(
            map(downloads => downloads.length > 0 && downloads.every(download => download.status === 'completed')), // проверяет, завершены ли все загрузки
            distinctUntilChanged(), // не позволяет повторно сообщать об одном и том же состоянии.
            filter((completed): completed is true => completed), // пропускает только успешное завершение всей группы.
            map(() => undefined) // превращает результат в событие типа void.
        );

    constructor() {
        this.eventsSubject
            .pipe(
                scan(downloadReducer, initialDownloads),
                takeUntilDestroyed()
            )
            .subscribe(downloads => {
                this.downloadsSubject.next(downloads);
                try {
                    localStorage.setItem(
                        DOWNLOADS_STORAGE_KEY,
                        JSON.stringify(downloads)
                    );
                } catch {
                    console.warn('Не удалось сохранить загрузки');
                }
            });

        this.startRequests$
            .pipe(
                mergeMap(id => {
                    const download = this.downloadsSubject.value.find(item => item.id === id);

                    if (!download || download.status !== 'queued') {
                        return EMPTY;
                    }

                    console.log(`Запуск загрузки ${id}`);

                    this.stopRequests.set(id, new Subject<void>());
                    this.updateStatus(id, 'downloading');

                    return this.createDownloadStream(id)
                        .pipe(
                            catchError(error => {
                                console.error(`Ошибка загрузки ${id}:`, error);
                                this.updateStatus(id, 'failed');
                                return EMPTY;
                            }),
                            finalize(() => this.stopRequests.delete(id))
                        );
                }, 2),
                takeUntilDestroyed()
            )
            .subscribe(event => this.eventsSubject.next(event));

        this.destroyRef.onDestroy(() => {
            for (const stop$ of this.stopRequests.values()) {
                stop$.next();
                stop$.complete();
            }
            this.stopRequests.clear();
        });
    }

    add(url: string): void {
        const normalizedUrl = url.trim();

        if (!normalizedUrl) {
            return;
        }

        const item: DownloadItem = {
            id: crypto.randomUUID(),
            name: normalizedUrl.split('/').pop() || normalizedUrl,
            size: 0,
            loaded: 0,
            speed: 0,
            status: 'queued'
        };

        this.eventsSubject.next({
            type: 'added',
            download: item
        });
    }

    start(id: string): void {
        this.requestStart(id);
    }

    pause(id: string): void {
        const download = this.downloadsSubject.value.find(item => item.id === id);

        if (!download || download.status !== 'downloading') {
            return;
        }

        this.stopDownload(id);
        this.updateStatus(id, 'paused');
    }

    resume(id: string): void {
        const download = this.downloadsSubject.value.find(item => item.id === id);

        if (!download || download.status !== 'paused') {
            return;
        }

        this.updateStatus(id, 'queued');
        this.requestStart(id);
    }

    cancel(id: string): void {
        const download = this.downloadsSubject.value.find(item => item.id === id);

        if (!download || download.status === 'completed' || download.status === 'cancelled') {
            return;
        }

        this.stopDownload(id);
        this.updateStatus(id, 'cancelled');
    }

    requestStart(id: string): void {
        const download = this.downloadsSubject.value.find(item => item.id === id);

        if (!download) {
            return;
        }

        if (download.status === 'cancelled') {
            this.eventsSubject.next({
                type: 'reset',
                id
            });
        } else if (download.status === 'failed') {
            this.updateStatus(id, 'queued');
        } else if (download.status !== 'queued') {
            return;
        }

        this.startRequests$.next(id);
    }

    retry(id: string): void {
        const download = this.downloadsSubject.value.find(item => item.id === id);

        if (!download || download.status !== 'failed') {
            return;
        }

        this.requestStart(id);
    }

    remove(id: string): void {
        const download = this.downloadsSubject.value.find(item => item.id === id);

        if (!download) {
            return;
        }

        this.stopDownload(id);

        this.eventsSubject.next({
            type: 'removed',
            id
        });
    }

    private stopDownload(id: string): void {
        const stop$ = this.stopRequests.get(id);

        stop$?.next();
        stop$?.complete();

        this.stopRequests.delete(id);
    }

    private createDownloadStream(id: string): Observable<DownloadEvent> {
        const stop$ = this.stopRequests.get(id)!;

        return interval(500)
            .pipe(
                map(() => {
                    if (id === '2') throw new Error('Тестовая ошибка загрузки');

                    const download = this.downloadsSubject.value.find(item => item.id === id);

                    if (!download) {
                        throw new Error(`Загрузка ${id} не найдена`);
                    }

                    const loaded = Math.min(download.loaded + 2_000_000, download.size);

                    return {
                        type: 'progress' as const,
                        id,
                        loaded,
                        speed: 4_000_000
                    };
                }),
                takeWhile(event => {
                    const download = this.downloadsSubject.value.find(item => item.id === id);
                    return !!download && event.loaded < download.size;
                }, true),
                takeUntil(stop$)
            );
    }

    private updateStatus(id: string, status: DownloadItem['status']): void {
        this.eventsSubject.next({
            type: 'statusChanged',
            id,
            status
        });
    }
}
