import { Component, ChangeDetectionStrategy } from '@angular/core';
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { ApexAxisChartSeries, ApexChart, ApexPlotOptions, ApexTooltip, ApexXAxis, ApexYAxis } from 'ng-apexcharts';
import { ProjectPerformance, ReportScope } from '../../Interface/reports';
import { ExportColumn } from '../../services/Shared/export.util';
import { ReportPageBase, chartOf } from '../report-page-base';

@Component({
    selector: 'app-report-projects',
    templateUrl: './report-projects.component.html',
    styleUrl: './report-projects.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReportProjectsComponent extends ReportPageBase {
  faRight = faChevronRight;
  faDown = faChevronDown;

  rows: ProjectPerformance[] = [];
  sortColumn: keyof ProjectPerformance = 'Name';
  sortColumnDir: 'asc' | 'desc' = 'asc';
  expandedId: number | null = null;
  totals = { Budget: 0, Spent: 0, Open: 0, Overdue: 0, Behind: 0 };

  budgetSeries: ApexAxisChartSeries = [];
  budgetChart: ApexChart = chartOf('bar', 320);
  budgetXAxis: ApexXAxis = { categories: [] };
  budgetYAxis: ApexYAxis = { labels: { formatter: (v: number) => this.money(v) } };
  budgetPlot: ApexPlotOptions = { bar: { columnWidth: '55%', borderRadius: 3 } };
  budgetColors = ['#0043E0', '#ffa529'];
  budgetTooltip: ApexTooltip = { y: { formatter: (v: number) => `₹${v.toLocaleString('en-IN')}` } };

  progSeries: ApexAxisChartSeries = [];
  progChart: ApexChart = chartOf('bar', 320);
  progXAxis: ApexXAxis = { categories: [], max: 100, labels: { formatter: (v: string) => `${v}%` } };
  progPlot: ApexPlotOptions = { bar: { horizontal: true, barHeight: '70%', borderRadius: 3 } };
  progColors = ['#9AA7C7', '#029848'];
  pctTooltip: ApexTooltip = { y: { formatter: (v: number) => `${v}%` } };

  exportColumns: ExportColumn<ProjectPerformance>[] = [
    { key: 'Code', label: 'Code' }, { key: 'Name', label: 'Project' }, { key: 'ManagerName', label: 'Manager' },
    { key: 'Status', label: 'Status' }, { key: 'Health', label: 'Health' },
    { key: 'Progress', label: 'Work done %', format: v => `${v}%` }, { key: 'Planned', label: 'Planned %', format: v => `${v}%` },
    { key: 'ScheduleVariance', label: 'Schedule variance', format: v => `${v > 0 ? '+' : ''}${v}%` },
    { key: 'Budget', label: 'Budget' }, { key: 'Spent', label: 'Spent' }, { key: 'EarnedValue', label: 'Earned value' },
    { key: 'CostVariance', label: 'Cost variance' }, { key: 'CPI', label: 'Budget used vs work done' },
    { key: 'OpenTasks', label: 'Open tasks' }, { key: 'OverdueTasks', label: 'Late tasks' },
  ];

  compute(s: ReportScope) {
    this.rows = this.reports.projectPerformance(s);
    this.sortRows();
    this.totals = {
      Budget: this.rows.reduce((x, r) => x + r.Budget, 0),
      Spent: this.rows.reduce((x, r) => x + r.Spent, 0),
      Open: this.rows.reduce((x, r) => x + r.OpenTasks, 0),
      Overdue: this.rows.reduce((x, r) => x + r.OverdueTasks, 0),
      Behind: this.rows.filter(r => r.ScheduleVariance < -5 && r.Status !== 'Completed').length
    };

    const names = this.rows.map(r => r.Name);
    this.budgetXAxis = { categories: names };
    this.budgetSeries = [
      { name: 'Budget', data: this.rows.map(r => r.Budget) },
      { name: 'Spent', data: this.rows.map(r => r.Spent) },
    ];
    this.progXAxis = { categories: this.rows.map(r => r.Name), max: 100, tickAmount: 4, labels: { formatter: (v: string) => `${v}%` } };
    this.progSeries = [
      { name: 'Plan', data: this.rows.map(r => r.Planned) },
      { name: 'Done', data: this.rows.map(r => r.Progress) },
    ];
  }

  orderBy(col: keyof ProjectPerformance) {
    if (this.sortColumn === col) this.sortColumnDir = this.sortColumnDir === 'asc' ? 'desc' : 'asc';
    else { this.sortColumn = col; this.sortColumnDir = 'asc'; }
    this.sortRows();
  }

  sortIcon(col: string): string {
    return this.sortColumn === col && this.sortColumnDir === 'desc'
      ? '../../assets/images/certificate/bottom-arrow.svg' : '../../assets/images/certificate/top-arrow.svg';
  }

  private sortRows() {
    const c = this.sortColumn;
    this.rows = [...this.rows].sort((a, b) => {
      const x = a[c] as any, y = b[c] as any;
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return this.sortColumnDir === 'desc' ? -r : r;
    });
  }

  toggle(id: number) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  varianceClass(v: number): string {
    return v >= 0 ? 'pos' : v >= -10 ? 'warn' : 'neg';
  }

  /** Plain words for schedule variance: "On plan", "5% ahead", "12% behind". */
  scheduleText(v: number): string {
    return v === 0 ? 'On plan' : v > 0 ? `${v}% ahead` : `${-v}% behind`;
  }
}
