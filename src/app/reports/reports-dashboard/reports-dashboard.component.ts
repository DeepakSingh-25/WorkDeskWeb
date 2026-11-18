import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
  ApexAxisChartSeries, ApexChart, ApexFill, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis
} from 'ng-apexcharts';
import { MemberProductivity, ReportScope } from '../../Interface/reports';
import { ExportColumn } from '../../services/Shared/export.util';
import { ReportPageBase, chartOf } from '../report-page-base';

interface Kpi { label: string; value: string; sub: string; box: string; }

@Component({
    selector: 'app-reports-dashboard',
    templateUrl: './reports-dashboard.component.html',
    styleUrl: './reports-dashboard.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReportsDashboardComponent extends ReportPageBase {
  kpis: Kpi[] = [];
  contributors: MemberProductivity[] = [];
  topContributors: MemberProductivity[] = [];
  hasHours = false;
  showMoreCharts = false;

  // created vs completed
  trendSeries: ApexAxisChartSeries = [];
  trendChart: ApexChart = chartOf('line', 300);
  trendXAxis: ApexXAxis = { categories: [] };
  trendStroke: ApexStroke = { curve: 'smooth', width: [3, 3] };
  trendColors = ['#9AA7C7', '#0043E0'];
  trendYAxis: ApexYAxis = { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => `${Math.round(v)}` } };

  // project health donut
  healthSeries: ApexNonAxisChartSeries = [];
  healthChart: ApexChart = chartOf('donut', 300);
  healthLabels = ['On Track', 'At Risk', 'Off Track'];
  healthColors = ['#029848', '#ffa529', '#FB6240'];
  donutOptions: ApexPlotOptions = { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Projects' } } } } };

  // hours by project
  hoursSeries: ApexAxisChartSeries = [];
  hoursChart: ApexChart = chartOf('bar', 300);
  hoursXAxis: ApexXAxis = { categories: [] };
  hoursPlot: ApexPlotOptions = { bar: { horizontal: true, borderRadius: 4, barHeight: '55%', distributed: true } };
  hoursColors = ['#0043E0', '#029848', '#ffa529', '#7A3FE4', '#FB6240', '#00A3C4', '#8A94A6'];
  hoursTooltip: ApexTooltip = { y: { formatter: (v: number) => `${v} h` } };
  hoursFill: ApexFill = { opacity: 0.9 };

  exportColumns: ExportColumn<MemberProductivity>[] = [
    { key: 'Name', label: 'Member' }, { key: 'TeamName', label: 'Team' }, { key: 'Completed', label: 'Tasks completed' },
    { key: 'Throughput', label: 'Story points finished' }, { key: 'OnTimePct', label: 'Finished on time', format: v => `${v}%` },
    { key: 'Hours', label: 'Hours logged' }, { key: 'CapacityHours', label: 'Available hours' },
    { key: 'Utilization', label: 'Share of available time logged', format: v => `${v}%` },
  ];

  compute(s: ReportScope) {
    const r = this.reports;
    const done = r.completedInRange(s);
    const onTime = done.filter(t => t.OnTime).length;
    const overdue = r.overdue(s.Tasks);
    const active = s.Projects.filter(p => p.Status === 'In Progress');
    const created = s.Tasks.filter(t => r.inRange(t.CreatedOn, s.Filter)).length;

    this.kpis = [
      { label: 'Active projects', value: `${active.length}`, sub: `of ${s.Projects.length} projects`, box: 'box-1' },
      { label: 'Tasks finished', value: `${done.length}`, sub: `${created} new tasks came in`, box: 'box-3' },
      { label: 'Finished on time', value: done.length ? `${Math.round(onTime / done.length * 100)}%` : '—', sub: `${onTime} of ${done.length} tasks`, box: 'box-4' },
      { label: 'Late tasks', value: `${overdue.length}`, sub: 'still open after the due date', box: 'box-2' },
    ];

    // trend
    const weeks = r.weekStarts(s.Filter.To, 12);
    this.trendXAxis = { categories: weeks.map(w => r.weekLabel(w)), labels: { rotate: -45 } };
    this.trendSeries = [
      { name: 'New', data: r.weeklyCounts(s.Tasks, weeks, 'CreatedOn') },
      { name: 'Finished', data: r.weeklyCounts(s.Tasks, weeks, 'CompletedOn') },
    ];

    // health
    this.healthSeries = this.healthLabels.map(h => s.Projects.filter(p => p.Health === h).length);

    // hours by project
    const byProject = s.Projects.map(p => ({ name: p.Name, hours: this.round1(s.Worklogs.filter(w => w.ProjectID === p.ID).reduce((x, w) => x + w.Hours, 0)) }))
      .filter(x => x.hours > 0).sort((a, b) => b.hours - a.hours);
    this.hoursXAxis = { categories: byProject.map(x => x.name) };
    this.hoursSeries = [{ name: 'Hours', data: byProject.map(x => x.hours) }];
    this.hasHours = byProject.length > 0;

    // contributors
    this.contributors = r.memberProductivity(s).sort((a, b) => b.Hours - a.Hours || b.Throughput - a.Throughput);
    this.topContributors = this.contributors.filter(c => c.Hours > 0 || c.Completed > 0).slice(0, 5);
  }
}
