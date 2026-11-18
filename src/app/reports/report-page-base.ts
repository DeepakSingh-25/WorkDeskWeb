import { Directive, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApexChart, ApexDataLabels, ApexGrid, ApexLegend } from 'ng-apexcharts';
import { ReportBase, ReportScope } from '../Interface/reports';
import { ReportsService } from '../services/Reports/reports.service';
import { LoaderService } from '../services/Loader/loader.service';
import { NotificationsService } from '../services/notifications.service';
import { TaskUi } from '../task/task-ui';

export const CHART_FONT = 'Poppins, sans-serif';
export const PALETTE = ['#0043E0', '#029848', '#ffa529', '#7A3FE4', '#FB6240', '#00A3C4', '#8A94A6', '#C77800'];

export function chartOf(type: ApexChart['type'], height: number, extra: Partial<ApexChart> = {}): ApexChart {
  return { type, height, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: CHART_FONT, ...extra };
}

/**
 * Common behaviour of every report page: loads the base data once, then recomputes
 * whenever the shared filter (date range / projects / team) changes.
 */
@Directive()
export abstract class ReportPageBase implements OnInit, OnDestroy {
  ui = TaskUi;
  protected reports = inject(ReportsService);
  protected loaderService = inject(LoaderService);
  protected notificationsService = inject(NotificationsService);
  protected subs = new Subscription();

  base: ReportBase | null = null;
  scope: ReportScope | null = null;
  loading = true;

  // shared chart options
  grid: ApexGrid = { borderColor: '#ededed', strokeDashArray: 3 };
  noLabels: ApexDataLabels = { enabled: false };
  legendTop: ApexLegend = { position: 'top', horizontalAlign: 'right', fontFamily: CHART_FONT };
  legendBottom: ApexLegend = { position: 'bottom', fontFamily: CHART_FONT };
  noLegend: ApexLegend = { show: false };

  ngOnInit() {
    this.loaderService.showLoader();
    this.subs.add(this.reports.getBase().subscribe({
      next: base => {
        this.base = base;
        this.loading = false;
        this.loaderService.hideLoader();
        this.subs.add(this.reports.filter$.subscribe(f => {
          this.scope = this.reports.scope(base, f);
          this.compute(this.scope);
        }));
      },
      error: () => {
        this.loading = false;
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('error', 'Unable to load report data.');
      }
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  abstract compute(s: ReportScope): void;

  get filterSummary(): string {
    return this.reports.filterSummary();
  }

  get rangeLabel(): string {
    return this.reports.rangeLabel();
  }

  displayDate(s: string | null): string {
    return s ? this.reports.displayDate(s) : '—';
  }

  money(v: number, currency = 'INR'): string {
    const abs = Math.abs(v);
    const sym = currency === 'INR' ? '₹' : '';
    const txt = abs >= 100000 ? `${(abs / 100000).toFixed(1)}L` : abs >= 1000 ? `${(abs / 1000).toFixed(0)}K` : `${abs}`;
    return `${v < 0 ? '-' : ''}${sym}${txt}`;
  }

  round1(v: number): number {
    return Math.round(v * 10) / 10;
  }
}
