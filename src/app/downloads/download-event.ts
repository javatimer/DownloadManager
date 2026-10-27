import { DownloadItem, DownloadStatus } from './download-item';

export type DownloadEvent =
    | { type: 'added'; download: DownloadItem }
    | { type: 'started'; id: string }
    | { type: 'progress'; id: string; loaded: number; speed: number }
    | { type: 'statusChanged'; id: string; status: DownloadStatus }
    | { type: 'removed'; id: string }
    | { type: 'reset'; id: string };
