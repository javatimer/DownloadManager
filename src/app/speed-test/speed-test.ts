
import { Component, signal } from '@angular/core';

interface SpeedTestHistoryItem {
  download: string;
  upload: string;
  ping: string;
  jitter: string;
  time: string;
}

@Component({
  selector: 'app-speed-test',
  standalone: true,
  templateUrl: './speed-test.html',
  styleUrl: './speed-test.css',
})
export class SpeedTest {
  protected readonly running = signal(false);
  protected readonly downloadSpeed = signal('—');
  protected readonly uploadSpeed = signal('—');
  protected readonly ping = signal('—');
  protected readonly jitter = signal('—');
  protected readonly progress = signal(0);
  protected readonly error = signal('');
  protected readonly lastTestAt = signal('');
  protected readonly history = signal<SpeedTestHistoryItem[]>([]);

  private tester?: Speedtest;

  protected start(): void {
    this.error.set('');
    this.running.set(true);
    this.progress.set(0);

    this.downloadSpeed.set('—');
    this.uploadSpeed.set('—');
    this.ping.set('—');
    this.jitter.set('—');

    try {
      const tester = new Speedtest();
      this.tester = tester;

      tester.setParameter('url_dl', 'http://localhost:8085/backend/garbage.php?cors=true');

      tester.setParameter('url_ul', 'http://localhost:8085/backend/empty.php?cors=true');

      tester.setParameter('url_ping', 'http://localhost:8085/backend/empty.php?cors=true');

      tester.setParameter('url_getIp', 'http://localhost:8085/backend/getIP.php?cors=true');

      tester.onupdate = data => {
        this.downloadSpeed.set(String(data.dlStatus));
        this.uploadSpeed.set(String(data.ulStatus));
        this.ping.set(String(data.pingStatus));
        this.jitter.set(String(data.jitterStatus));

        const currentProgress = Math.max(data.dlProgress, data.ulProgress, data.pingProgress);

        this.progress.set(Math.round(currentProgress * 100));
      };

      tester.onend = aborted => {
        this.running.set(false);

        if (aborted) {
          this.error.set('Тест остановлен.');
        } else {
          this.progress.set(100);
        }

        if (!aborted) {
          //this.lastTestAt.set(new Date().toLocaleTimeString());

          const time = new Date().toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });

          this.lastTestAt.set(time);

          const result: SpeedTestHistoryItem = {
            download: this.downloadSpeed(),
            upload: this.uploadSpeed(),
            ping: this.ping(),
            jitter: this.jitter(),
            time,
          };

          //помещает новый результат в начало массива.
          //обновляет сигнал, поэтому Angular сможет автоматически обновить шаблон.
          this.history.update(items => [result, ...items].slice(0, 5)); // оставляет только пять последних записей.
        }

        this.tester = undefined;
      };

      tester.start();
    } catch (error) {
      this.running.set(false);
      this.error.set('Не удалось запустить тест.');
      console.error(error);
    }
  }

  protected stop(): void {
    this.tester?.abort();
  }
}
