import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
  ApexAxisChartSeries, ApexChart, ApexNonAxisChartSeries, ApexPlotOptions, ApexXAxis, ApexYAxis
} from 'ng-apexcharts';
import { ReportScope, ReportTask } from '../../Interface/reports';
import { ExportColumn } from '../../services/Shared/export.util';
import { ReportPageBase, chartOf } from '../report-page-base';

@Component({
    selector: 'app-report-tasks',
    templateUrl: './report-tasks.component.html',
    styleUrl: './report-tasks.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReportTasksComponent extends ReportPageBase {
  kpi = { Completed: 0, Created: 0, AvgCycle: 0, OnTimePct: 0, Overdue: 0, Points: 0 };
  showMoreCharts = false;

  completed: ReportTask[] = [];
  sortColumn: keyof ReportTask = 'CompletedOn';
  sortColumnDir: 'asc' | 'desc' = 'desc';
  recordsPerPageOptions = [10, 25, 50];
  cardsPerPage = 10;
  currentPage = 1;

  weeklySeries: ApexAxisChartSeries = [];
  weeklyChart: ApexChart = chartOf('bar', 300);
  weeklyXAxis: ApexXAxis = { categories: [] };
  weeklyPlot: ApexPlotOptions = { bar: { columnWidth: '60%', borderRadius: 3 } };
  weeklyColors = ['#C9D3EA', '#0043E0'];
  intYAxis: ApexYAxis = { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => `${Math.round(v)}` } };

  stackSeries: ApexAxisChartSeries = [];
  stackChart: ApexChart = chartOf('bar', 300, { stacked: true });
  stackXAxis: ApexXAxis = { categories: ['Critical', 'High', 'Medium', 'Low'] };
  stackPlot: ApexPlotOptions = { bar: { horizontal: true, barHeight: '55%', borderRadius: 2 } };
  stackColors = ['#8A94A6', '#0043E0', '#7A3FE4', '#029848'];

  onTimeSeries: ApexNonAxisChartSeries = [];
  onTimeChart: ApexChart = chartOf('donut', 280);
  onTimeLabels = ['On time', 'Late'];
  onTimeColors = ['#029848', '#FB6240'];
  donutOptions: ApexPlotOptions = { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Finished' } } } } };

  agingSeries: ApexAxisChartSeries = [];
  agingChart: ApexChart = chartOf('bar', 280);
  agingXAxis: ApexXAxis = { categories: ['1–3 days', '4–7 days', '8–14 days', '15+ days'] };
  agingPlot: ApexPlotOptions = { bar: { columnWidth: '50%', borderRadius: 4, distributed: true } };
  agingColors = ['#ffa529', '#F58A34', '#FB6240', '#E0401C'];

  exportColumns: ExportColumn<ReportTask>[] = [
    { key: 'Key', label: 'Key' }, { key: 'Title', label: 'Task' }, { key: 'ProjectName', label: 'Project' },
    { key: 'AssigneeName', label: 'Assignee' }, { key: 'Priority', label: 'Priority' },
    { key: 'CreatedOn', label: 'Created', format: v => this.displayDate(v) }, { key: 'DueDate', label: 'Due', format: v => v ? this.displayDate(v) : '' },
    { key: 'CompletedOn', label: 'Completed', format: v => this.displayDate(v) }, { key: 'CycleDays', label: 'Days to finish' },
    { key: 'OnTime', label: 'On time', format: v => v ? 'Yes' : 'No' }, { key: 'EstimateHours', label: 'Estimate (h)' }, { key: 'LoggedHours', label: 'Logged (h)' },
  ];

  compute(s: ReportScope) {
    const r = this.reports;
    const f = s.Filter;
    const done = r.completedInRange(s);
    const created = s.Tasks.filter(t => r.inRange(t.CreatedOn, f));
    const overdue = r.overdue(s.Tasks);
    const onTime = done.filter(t => t.OnTime).length;
    this.kpi = {
      Completed: done.length, Created: created.length,
      AvgCycle: done.length ? this.round1(done.reduce((x, t) => x + (t.CycleDays || 0), 0) / done.length) : 0,
      OnTimePct: done.length ? Math.round(onTime / done.length * 100) : 0,
      Overdue: overdue.length, Points: done.reduce((x, t) => x + t.StoryPoints, 0)
    };

    const weeks = r.weekStarts(f.To, 12);
    this.weeklyXAxis = { categories: weeks.map(w => r.weekLabel(w)), labels: { rotate: -45 } };
    this.weeklySeries = [
      { name: 'New', data: r.weeklyCounts(s.Tasks, weeks, 'CreatedOn') },
      { name: 'Finished', data: r.weeklyCounts(s.Tasks, weeks, 'CompletedOn') },
    ];

    // status mix by priority for tasks that were active in the range
    const active = s.Tasks.filter(t => t.CreatedOn <= f.To && (!t.CompletedOn || t.CompletedOn >= f.From));
    const prios = ['Critical', 'High', 'Medium', 'Low'];
    this.stackSeries = ['To Do', 'In Progress', 'In Review', 'Done'].map(st => ({
      name: st, data: prios.map(p => active.filter(t => t.Priority === p && t.Status === st).length)
    }));

    this.onTimeSeries = [onTime, done.length - onTime];

    const today = r.today();
    const ages = overdue.map(t => r.daysBetween(t.DueDate, today));
    this.agingSeries = [{
      name: 'Late tasks',
      data: [ages.filter(a => a <= 3).length, ages.filter(a => a >= 4 && a <= 7).length,
        ages.filter(a => a >= 8 && a <= 14).length, ages.filter(a => a >= 15).length]
    }];

    this.completed = done;
    this.sortRows();
    this.currentPage = 1;
  }

  // ---- table
  orderBy(col: keyof ReportTask) {
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
    this.completed = [...this.completed].sort((a, b) => {
      const x = a[c] as any, y = b[c] as any;
      const r = typeof x === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
      return this.sortColumnDir === 'desc' ? -r : r;
    });
  }

  get pageRows(): ReportTask[] {
    const start = (this.currentPage - 1) * Number(this.cardsPerPage);
    return this.completed.slice(start, start + Number(this.cardsPerPage));
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.completed.length / Number(this.cardsPerPage)));
  }

  get pageNumbers(): number[] {
    const start = Math.max(1, Math.min(this.currentPage - 2, this.totalPages - 4));
    return Array.from({ length: Math.min(5, this.totalPages) }, (_, i) => start + i);
  }

  goToPage(p: number) { this.currentPage = p; }
  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }
  onRecordsPerPageChange() { this.currentPage = 1; }
}
