import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

// Login / signup / password pages always stay in day mode. Keep in sync with
// the pre-paint script in index.html.
const LIGHT_ONLY_PAGES = ['/', '/login', '/signup', '/forgot', '/reset-password'];

// Light/dark mode. The choice is applied on <html> as data-theme (our dark.css)
// and data-bs-theme (Bootstrap 5.3 components). index.html applies the saved
// value before Angular boots so the page doesn't flash white.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private current: Theme = 'light';

  constructor(router: Router) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { }
    this.apply(saved === 'dark' ? 'dark' : 'light');
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.render());
  }

  get theme(): Theme { return this.current; }
  get isDark(): boolean { return this.current === 'dark'; }

  toggle(): void {
    this.apply(this.isDark ? 'light' : 'dark');
    try { localStorage.setItem(STORAGE_KEY, this.current); } catch { }
  }

  // Logout clears localStorage; call this afterwards to keep the user's mode.
  persist(): void {
    try { localStorage.setItem(STORAGE_KEY, this.current); } catch { }
  }

  private apply(theme: Theme): void {
    this.current = theme;
    this.render();
  }

  // The saved choice is kept as-is; light-only pages just don't show it.
  private render(): void {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const shown: Theme = LIGHT_ONLY_PAGES.includes(path.toLowerCase()) ? 'light' : this.current;
    const root = document.documentElement;
    root.setAttribute('data-theme', shown);
    root.setAttribute('data-bs-theme', shown);
  }
}
