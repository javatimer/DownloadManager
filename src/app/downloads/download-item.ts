export type DownloadStatus =
    | 'queued'
    | 'downloading'
    | 'paused'
    | 'completed'
    | 'cancelled'
    | 'failed';

export interface DownloadItem {
    id: string;
    name: string;
    size: number;
    loaded: number;
    speed: number;
    status: DownloadStatus;
}