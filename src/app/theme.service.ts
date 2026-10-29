import { Service, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Service()
export class ThemeService {
    // Сигнал темы, инициализирующийся из localStorage или системных настроек
    private themeSignal = signal<Theme>(this.getInitialTheme());

    // Публичный доступ к сигналу (только для чтения снаружи)
    readonly currentTheme = this.themeSignal.asReadonly();

    constructor() {
        // Эффект автоматически отслеживает изменение сигнала themeSignal
        effect(() => {
            const theme = this.themeSignal();
            // Обновляем атрибут на теге <html> для работы CSS
            document.documentElement.setAttribute('data-theme', theme);
            // Сохраняем выбор пользователя
            localStorage.setItem('theme', theme);
        });
    }

    toggleTheme(): void {
        this.themeSignal.update(current => current === 'light' ? 'dark' : 'light');
    }

    private getInitialTheme(): Theme {
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme === 'light' || savedTheme === 'dark') {
            return savedTheme;
        }
        // Если пользователь заходит впервые — смотрим на настройки его ОС
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
}
