import { DownloadEvent } from './download-event';
import { DownloadItem } from './download-item';

export function downloadReducer(downloads: DownloadItem[], event: DownloadEvent): DownloadItem[] {
    if (event.type === 'reset') {
        return downloads.map(download =>
            download.id === event.id
                ? {
                    ...download,
                    loaded: 0,
                    speed: 0,
                    status: 'queued'
                }
                : download
        );
    }

    if (event.type === 'added') {
        return [...downloads, event.download];
    }

    if (event.type === 'removed') {
        return downloads.filter(download => download.id !== event.id);
    }

    return downloads.map(download => {
        if (download.id !== event.id) {
            return download;
        }

        switch (event.type) {
            case 'started':
                return {
                    ...download,
                    status: 'downloading'
                };

            case 'progress':
                return {
                    ...download,
                    loaded: event.loaded,
                    speed: event.speed,
                    status: event.loaded >= download.size ? 'completed' : 'downloading'
                };

            case 'statusChanged':
                return {
                    ...download,
                    status: event.status
                };
        }
    });
}
