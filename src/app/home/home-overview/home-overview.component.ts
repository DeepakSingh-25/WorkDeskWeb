import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexGrid, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexXAxis, ApexYAxis
} from 'ng-apexcharts';
import { Task } from '../../Interface/task';
import { CalendarItem, FeedItem, HomeContext, HomeLink, HomeNotification, MyProject } from '../../Interface/home';
import { HomeService } from '../../services/Home/home.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { HomeUi } from '../home-ui';

@Component({
    selector: 'app-home-overview',
    templateUrl: './home-overview.component.html',
    styleUrl: './home-overview.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeOverviewComponent implements OnInit {
  ui = HomeUi;
  firstName = '';
  todayDate = new Date();
  ctx: HomeContext | null = null;

  kpi = { open: 0, dueToday: 0, overdue: 0, approvals: 0, minutesWeek: 0 };
  showMore = false;
  taskTitles: { [id: number]: string } = {};
  focus: Task[] = [];
  projects: MyProject[] = [];
  week: { date: string; items: CalendarItem[] }[] = [];
  notifications: HomeNotification[] = [];
  activity: FeedItem[] = [];

  // charts
  statusSeries: ApexNonAxisChartSeries = [];
  statusLabels: string[] = HomeUi.taskStatuses;
  statusColors: string[] = HomeUi.taskStatuses.map(s => HomeUi.statusColor(s));
  donutChart: ApexChart = { type: 'donut', height: 280, fontFamily: 'Poppins, sans-serif' };
  donutOptions: ApexPlotOptions = { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'My tasks' } } } } };
  legendBottom: ApexLegend = { position: 'bottom' };
  legendTop: ApexLegend = { position: 'top', horizontalAlign: 'right' };
  noLabels: ApexDataLabels = { enabled: false };

  trendSeries: ApexAxisChartSeries = [];
  trendChart: ApexChart = { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: 'Poppins, sans-serif' };
  trendXAxis: ApexXAxis = { categories: [] };
  trendYAxis: ApexYAxis = { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => `${Math.round(v)}` } };
  trendPlot: ApexPlotOptions = { bar: { borderRadius: 4, columnWidth: '55%' } };
  trendStroke: ApexStroke = { show: true, width: 2, colors: ['transparent'] };
  trendColors = ['#029848', '#0043E0'];
  grid: ApexGrid = { borderColor: '#ededed' };

  constructor(
    private homeService: HomeService,
    private router: Router,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService
  ) {
    this.firstName = this.homeService.meName.split(' ')[0];
  }

  get greeting(): string {
    return HomeUi.greeting();
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loaderService.showLoader();
    this.homeService.getContext().subscribe({
      next: ctx => {
        this.ctx = ctx;
        this.build(ctx);
        this.loaderService.hideLoader();
        const monday = this.homeService.weekStart(this.homeService.today());
        this.homeService.getMyWorklogMinutes(ctx.MyTasks).subscribe(byDay => {
          this.kpi.minutesWeek = Object.keys(byDay).filter(d => d >= monday).reduce((s, d) => s + byDay[d], 0);
        });
        this.homeService.getActivityFeed(ctx).subscribe(feed => this.activity = feed.slice(0, 6));
      },
      error: () => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('error', 'Unable to load dashboard');
      }
    });
    // Dashboard ka error toast upar hi aa jaata hai — yahan chup-chaap khaali list.
    this.homeService.getNotifications().subscribe({
      next: list => this.notifications = list.slice(0, 5),
      error: () => this.notifications = []
    });
  }

  private build(ctx: HomeContext) {
    const today = this.homeService.today();
    const open = ctx.MyTasks.filter(t => t.Status !== 'Done');
    this.kpi.open = open.length;
    this.kpi.dueToday = open.filter(t => t.DueDate === today).length;
    this.kpi.overdue = open.filter(t => t.DueDate && t.DueDate < today).length;
    this.kpi.approvals = ctx.Approvals.length;
    this.taskTitles = {};
    ctx.Tasks.forEach(t => this.taskTitles[t.ID] = t.Title);

    this.focus = open.filter(t => t.DueDate && t.DueDate <= today)
      .sort((a, b) => a.DueDate.localeCompare(b.DueDate) || HomeUi.priorityOptions.indexOf(b.Priority) - HomeUi.priorityOptions.indexOf(a.Priority));

    this.projects = [...ctx.Projects].filter(p => p.Status !== 'Cancelled')
      .sort((a, b) => Number(b.Favourite) - Number(a.Favourite) || b.MyOpenTasks - a.MyOpenTasks).slice(0, 4);

    // this week
    const monday = this.homeService.weekStart(today);
    const items = this.homeService.getCalendarItems(ctx);
    this.week = Array.from({ length: 7 }, (_, i) => {
      const date = this.homeService.addDays(monday, i);
      return { date, items: items.filter(x => x.Date === date) };
    });

    // donut
    this.statusSeries = HomeUi.taskStatuses.map(s => ctx.MyTasks.filter(t => t.Status === s).length);

    // completed vs created, last 8 weeks
    const cats: string[] = [], done: number[] = [], created: number[] = [];
    for (let w = 7; w >= 0; w--) {
      const from = this.homeService.addDays(monday, -7 * w), to = this.homeService.addDays(from, 6);
      const inRange = (iso: string) => { const d = HomeUi.localDay(iso); return d >= from && d <= to; };
      cats.push(new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
      done.push(ctx.MyTasks.filter(t => t.Status === 'Done' && inRange(t.UpdatedOn)).length);
      created.push(ctx.MyTasks.filter(t => inRange(t.CreatedOn)).length);
    }
    this.trendXAxis = { categories: cats };
    this.trendSeries = [{ name: 'Finished', data: done }, { name: 'New', data: created }];
  }

  daysText(d: number): string {
    return d === -1 ? '1 day late' : d < 0 ? `${-d} days late` : d === 1 ? '1 day left' : `${d} days left`;
  }

  markDone(t: Task) {
    this.homeService.setTaskStatus(t.ID, 'Done').subscribe(() => {
      this.notificationsService.showNotification('success', `"${HomeUi.stripKey(t.Title)}" marked as done`);
      this.load();
    });
  }

  openTask(t: Task) {
    this.router.navigate(['/tasks'], { queryParams: { task: t.ID } });
  }

  go(x: HomeLink) {
    this.router.navigate([x.Link], { queryParams: x.QueryParams || {} });
  }

  openNotification(n: HomeNotification) {
    this.homeService.markRead(n.ID).subscribe();
    this.go(n);
  }

  dayName(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  }

  dayNum(date: string): number {
    return new Date(date + 'T00:00:00').getDate();
  }

  isToday(date: string): boolean {
    return date === this.homeService.today();
  }
}
