import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // Современный способ задержки инициализации в Angular 22+
    provideAppInitializer(() => {
      return new Promise<void>((resolve) => {
        // Задерживаем скрытие сплэш-скрина на 3 секунды
        setTimeout(() => resolve(), 3000);
      });
    })
  ]
};
