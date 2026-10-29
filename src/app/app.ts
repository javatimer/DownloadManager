import { Component, computed, effect, inject, Signal, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DownloadManager } from './downloads/download-manager';
import { DownloadItem } from './downloads/download-item';
import { interval, take, mergeMap, map } from 'rxjs';
import { SpeedTest } from './speed-test/speed-test';
import { ThemeService } from './theme.service';

type Category = 'all' | 'downloading' | 'completed' | 'paused' | 'errors';

type SortField = 'name' | 'size' | 'progress' | 'speed';

type SortDirection = 'asc' | 'desc';

@Component({
  imports: [SpeedTest],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('DownloadManager');
  protected readonly sortField = signal<SortField>('name');
  protected readonly sortDirection = signal<SortDirection>('asc');
  protected readonly selectedCategory = signal<Category>('all');
  protected readonly url = signal('');
  protected readonly showAddUrl = signal(false);
  protected readonly downloadManager = inject(DownloadManager);
  protected readonly themeService = inject(ThemeService);
  protected readonly downloads: Signal<DownloadItem[]> = toSignal(this.downloadManager.downloads$, { initialValue: [] });
  protected readonly selectedIds = signal<string[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly filteredDownloads = computed(() => {
    //const downloads = this.downloads();
    const downloads = this.searchedDownloads();
    switch (this.selectedCategory()) {
      case 'downloading':
        return downloads.filter(d => d.status === 'downloading');
      case 'completed':
        return downloads.filter(d => d.status === 'completed');
      case 'paused':
        return downloads.filter(d => d.status === 'paused');
      case 'errors':
        return downloads.filter(d => d.status === 'failed');
      default:
        return downloads;
    }
  });

  protected readonly categoryCounts = computed(() => {
    const downloads = this.downloads();

    return {
      all: downloads.length,
      downloading: downloads.filter(d => d.status === 'downloading').length,
      completed: downloads.filter(d => d.status === 'completed').length,
      paused: downloads.filter(d => d.status === 'paused').length,
      errors: downloads.filter(d => d.status === 'failed').length,
    };
  });

  protected readonly allVisibleSelected = computed(() => {
    const visible = this.filteredDownloads();
    const selected = this.selectedIds();
    return visible.length > 0 && visible.every(download => selected.includes(download.id));
  });

  protected readonly sortedDownloads = computed(() => {
    const downloads = [...this.filteredDownloads()];
    const field = this.sortField();
    const direction = this.sortDirection();

    downloads.sort((a, b) => {
      let result: number;

      switch (field) {
        case 'name':
          result = a.name.localeCompare(b.name);
          break;

        case 'size':
          result = a.size - b.size;
          break;

        case 'progress': {
          const progressA = a.size > 0 ? a.loaded / a.size : 0;
          const progressB = b.size > 0 ? b.loaded / b.size : 0;
          result = progressA - progressB;
          break;
        }

        case 'speed':
          result = a.speed - b.speed;
          break;
      }

      return direction === 'asc' ? result : -result;
    });

    return downloads;
  });

  protected readonly searchedDownloads = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();

    if (!query) {
      return this.downloads();
    }

    return this.downloads().filter(download => download.name.toLowerCase().includes(query));
  });

  constructor() {
    this.loadSettings();

    this.downloadManager.allCompleted$
      .pipe(takeUntilDestroyed())
      .subscribe(() => console.log('Все загрузки успешно завершены!'));

    effect(() => {
      this.sortField();
      this.sortDirection();
      this.selectedCategory();
      this.searchQuery();
      this.saveSettings();
    });
  }

  start(id: string): void {
    this.downloadManager.start(id);
  }

  pause(id: string): void {
    this.downloadManager.pause(id);
  }

  resume(id: string): void {
    this.downloadManager.resume(id);
  }

  cancel(id: string): void {
    this.downloadManager.cancel(id);
  }

  retry(id: string): void {
    this.downloadManager.retry(id);
  }

  remove(id: string): void {
    this.downloadManager.remove(id);
  }

  protected getEta(download: DownloadItem): string {
    if (download.status !== 'downloading' || download.speed <= 0 || download.size <= 0) {
      return '—';
    }

    const remainingBytes = download.size - download.loaded;
    const seconds = Math.ceil(remainingBytes / download.speed);

    if (seconds < 60) {
      return `${seconds} sec`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return `${minutes} min ${remainingSeconds} sec`;
    }

    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  }

  protected selectCategory(category: Category): void {
    this.selectedCategory.set(category);
  }

  protected openAddUrl(): void {
    this.showAddUrl.set(true);
  }

  protected addUrl(): void {
    const url = this.url().trim();

    if (!url) {
      return;
    }

    this.downloadManager.add(url);

    this.url.set('');
    this.showAddUrl.set(false);
  }

  protected toggleSelection(id: string, checked: boolean): void {
    this.selectedIds.update(ids => checked ? [...new Set([...ids, id])] : ids.filter(selectedId => selectedId !== id));
  }

  protected startSelected(): void {
    for (const id of this.selectedIds()) {
      const download = this.downloads().find(item => item.id === id);

      if (!download) {
        continue;
      }

      if (download.status === 'paused') {
        this.resume(id);
      } else if (download.status === 'queued' || download.status === 'cancelled' || download.status === 'failed') {
        this.start(id);
      }
    }
  }

  protected pauseSelected(): void {
    for (const id of this.selectedIds()) {
      this.pause(id);
    }
  }

  protected cancelSelected(): void {
    for (const id of this.selectedIds()) {
      this.cancel(id);
    }
  }

  protected toggleSelectAll(checked: boolean): void {
    const visibleIds = this.filteredDownloads().map(download => download.id);

    this.selectedIds.update(selected => {
      if (checked) {
        return [...new Set([...selected, ...visibleIds])];
      }

      return selected.filter(id => !visibleIds.includes(id));
    });
  }

  protected sortBy(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDirection.update(direction =>
        direction === 'asc' ? 'desc' : 'asc'
      );
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  private saveSettings(): void {
    localStorage.setItem('download-manager-settings', JSON.stringify({
      sortField: this.sortField(),
      sortDirection: this.sortDirection(),
      selectedCategory: this.selectedCategory(),
      searchQuery: this.searchQuery(),
    }));
  }

  private loadSettings(): void {
    const saved = localStorage.getItem('download-manager-settings');

    if (!saved) return;

    try {
      const settings = JSON.parse(saved);

      if (['all', 'downloading', 'completed', 'paused', 'errors'].includes(settings.selectedCategory)) {
        this.selectedCategory.set(settings.selectedCategory);
      }

      if (['name', 'size', 'progress', 'speed'].includes(settings.sortField)) {
        this.sortField.set(settings.sortField);
      }

      if (['asc', 'desc'].includes(settings.sortDirection)) {
        this.sortDirection.set(settings.sortDirection);
      }

      if (typeof settings.searchQuery === 'string') {
        this.searchQuery.set(settings.searchQuery);
      }
    } catch {
      console.warn('Не удалось восстановить настройки Download Manager');
    }
  }

  mergeMapDemo() {
    interval(1000)
      .pipe(
        take(3),
        mergeMap(id => {
          console.log(`Запуск загрузки ${id}`);

          return interval(500).pipe(
            take(3),
            map(step => `Загрузка ${id}: шаг ${step + 1}`)
          );
        }, 2)
      )
      .subscribe(console.log);
  }

  requestStart(id: string) {
    this.downloadManager.requestStart(id);
  }
}
