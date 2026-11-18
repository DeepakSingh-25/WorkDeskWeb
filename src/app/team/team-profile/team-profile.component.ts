import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexGrid, ApexLegend, ApexPlotOptions, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis
} from 'ng-apexcharts';
import { Task, Worklog } from '../../Interface/task';
import { DepartmentItem, Holiday, LeaveRequest, TeamItem, TeamMember, WorkloadRow } from '../../Interface/team';
import { TeamService } from '../../services/Team/team.service';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { TeamUi } from '../team-ui';

@Component({
    selector: 'app-team-profile',
    templateUrl: './team-profile.component.html',
    styleUrl: './team-profile.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TeamProfileComponent implements OnInit, OnDestroy {
  ui = TeamUi;
  memberId = 0;
  member: TeamMember | null = null;
  notFound = false;
  members: TeamMember[] = [];
  teams: TeamItem[] = [];
  departments: DepartmentItem[] = [];
  tasks: Task[] = [];
  worklogs: Worklog[] = [];
  leaves: LeaveRequest[] = [];
  holidays: Holiday[] = [];
  workload: WorkloadRow | null = null;
  today = TeamUi.today();

  kpi = { completed30: 0, onTime: 0, doneCount: 0, cycle: 0, logged: 0, capacity: 0 };

  // capacity editor
  capacityHours: number | null = 40;
  workingDays: number[] = [];
  weekOrder = [1, 2, 3, 4, 5, 6, 0];
  capacityDirty = false;
  showMoreCharts = false;

  // charts
  grid: ApexGrid = { borderColor: '#ededed', strokeDashArray: 0 };
  noLabels: ApexDataLabels = { enabled: false };
  legendTop: ApexLegend = { position: 'top', horizontalAlign: 'right' };
  doneSeries: ApexAxisChartSeries = [];
  doneChart: ApexChart = { type: 'bar', height: 260, toolbar: { show: false }, fontFamily: 'Poppins, sans-serif' };
  doneXAxis: ApexXAxis = { categories: [] };
  doneYAxis: ApexYAxis = { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => `${Math.round(v)}` } };
  donePlot: ApexPlotOptions = { bar: { borderRadius: 4, columnWidth: '45%' } };
  doneColors = ['#029848'];
  doneTooltip: ApexTooltip = { y: { formatter: (v: number) => `${v} task${v === 1 ? '' : 's'}` } };

  hoursSeries: ApexAxisChartSeries = [];
  hoursChart: ApexChart = { type: 'line', height: 260, toolbar: { show: false }, fontFamily: 'Poppins, sans-serif' };
  hoursXAxis: ApexXAxis = { categories: [] };
  hoursYAxis: ApexYAxis = { min: 0, labels: { formatter: (v: number) => `${Math.round(v)}h` } };
  hoursStroke: ApexStroke = { curve: 'smooth', width: [3, 2], dashArray: [0, 6] };
  hoursColors = ['#0043E0', '#FB6240'];
  hoursTooltip: ApexTooltip = { y: { formatter: (v: number) => `${v}h` } };

  private subs = new Subscription();

  constructor(private route: ActivatedRoute, private router: Router, private teamService: TeamService, private taskService: TaskService,
    private notificationsService: NotificationsService, private loaderService: LoaderService) { }

  ngOnInit() {
    this.subs.add(this.route.paramMap.subscribe(p => {
      this.memberId = Number(p.get('id'));
      this.load();
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  load() {
    this.loaderService.showLoader();
    forkJoin([
      this.teamService.getMembers(), this.teamService.getTeams(), this.teamService.getDepartments(),
      this.teamService.getLeaves(), this.teamService.getHolidays(), this.taskService.getTasks({ AssigneeID: this.memberId })
    ]).pipe(
      switchMap(([m, t, d, l, h, tasks]) => {
        const logs$ = tasks.length ? forkJoin(tasks.map(x => this.taskService.getWorklogs(x.ID))).pipe(map(r => r.flat())) : of([] as Worklog[]);
        return logs$.pipe(map(logs => ({ m, t, d, l, h, tasks, logs })));
      })
    ).subscribe({
      next: ({ m, t, d, l, h, tasks, logs }) => {
        this.members = m;
        this.teams = t;
        this.departments = d;
        this.leaves = l;
        this.holidays = h;
        this.tasks = tasks;
        this.member = m.find(x => x.ID === this.memberId) || null;
        this.notFound = !this.member;
        if (this.member) {
          this.worklogs = logs.filter(w => w.UserName === this.member!.Name);
          this.capacityHours = this.member.WeeklyCapacityHours;
          this.workingDays = [...this.member.WorkingDays];
          this.capacityDirty = false;
          this.compute();
        }
        this.loaderService.hideLoader();
      },
      error: () => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
      }
    });
  }

  private weekCapacity(m: TeamMember, monday: string): number {
    let cap = 0;
    for (let i = 0; i < 7; i++) cap += TeamUi.dayCapacity(m, TeamUi.addDays(monday, i), this.leaves, this.holidays).cap;
    return Math.round(cap * 10) / 10;
  }

  private compute() {
    const m = this.member!;
    const done = this.tasks.filter(t => t.Status === 'Done');
    const since30 = TeamUi.addDays(this.today, -30);
    const doneDates = done.map(t => ({ t, on: TeamUi.completedOn(t) }));
    const onTime = doneDates.filter(x => !x.t.DueDate || x.on <= x.t.DueDate).length;
    const cycles = doneDates.map(x => Math.max(0, TeamUi.daysBetween(x.t.StartDate || x.on, x.on)));

    // hours logged in the last 4 weeks vs capacity
    const thisMonday = TeamUi.weekStart();
    const from4 = TeamUi.addDays(thisMonday, -28);
    const logged = this.worklogs.filter(w => w.WorkDate >= from4 && w.WorkDate < thisMonday).reduce((s, w) => s + w.Minutes, 0) / 60;
    let cap4 = 0;
    for (let i = 1; i <= 4; i++) cap4 += this.weekCapacity(m, TeamUi.addDays(thisMonday, -7 * i));

    this.kpi = {
      completed30: doneDates.filter(x => x.on >= since30).length,
      doneCount: done.length,
      onTime: done.length ? Math.round(onTime / done.length * 100) : 0,
      cycle: cycles.length ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length * 10) / 10 : 0,
      logged: Math.round(logged * 10) / 10,
      capacity: Math.round(cap4)
    };

    // 8 weeks charts (current week last)
    const weeks = Array.from({ length: 8 }, (_, i) => TeamUi.addDays(thisMonday, -7 * (7 - i)));
    const label = (d: string) => TeamUi.parse(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const cats = weeks.map(label);
    const inWeek = (d: string, w: string) => d >= w && d < TeamUi.addDays(w, 7);
    this.doneXAxis = { categories: cats, title: { text: 'Week starting' } };
    this.doneSeries = [{ name: 'Completed', data: weeks.map(w => doneDates.filter(x => inWeek(x.on, w)).length) }];
    this.hoursXAxis = { categories: cats };
    this.hoursSeries = [
      { name: 'Hours logged', data: weeks.map(w => Math.round(this.worklogs.filter(x => inWeek(x.WorkDate, w)).reduce((s, x) => s + x.Minutes, 0) / 60 * 10) / 10) },
      { name: 'Capacity', data: weeks.map(w => this.weekCapacity(m, w)) }
    ];

    this.workload = TeamUi.computeWorkload(m, this.tasks, this.leaves, this.holidays);
  }

  // ---------------- view data ----------------

  get manager(): TeamMember | undefined {
    return this.members.find(x => x.ID === this.member?.ManagerID);
  }

  get reports(): TeamMember[] {
    return this.members.filter(x => x.ManagerID === this.member?.ID && x.Status !== 'Inactive');
  }

  get openTasks(): Task[] {
    return this.tasks.filter(t => t.Status !== 'Done').sort((a, b) => (a.DueDate || '9999').localeCompare(b.DueDate || '9999'));
  }

  get upcomingLeave(): LeaveRequest[] {
    return this.leaves.filter(l => l.UserID === this.memberId && l.ToDate >= this.today && l.Status !== 'Rejected');
  }

  get loggedPct(): number {
    return this.kpi.capacity ? Math.round(this.kpi.logged / this.kpi.capacity * 100) : 0;
  }

  teamName(ID: number | null): string {
    return TeamUi.teamLabel(ID, this.teams);
  }

  deptName(ID: number | null): string {
    return TeamUi.deptLabel(ID, this.departments);
  }

  rangeLabel(l: LeaveRequest): string {
    const fmt = (d: string) => TeamUi.parse(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return l.FromDate === l.ToDate ? fmt(l.FromDate) : `${fmt(l.FromDate)} – ${fmt(l.ToDate)}`;
  }

  openTask(ID: number) {
    this.router.navigate(['/tasks'], { queryParams: { task: ID } });
  }

  // ---------------- capacity editor ----------------

  toggleDay(d: number) {
    this.workingDays = this.workingDays.includes(d) ? this.workingDays.filter(x => x !== d) : [...this.workingDays, d];
    this.capacityDirty = true;
  }

  get hoursPerDay(): number {
    return this.workingDays.length ? Math.round((this.capacityHours || 0) / this.workingDays.length * 10) / 10 : 0;
  }

  get capacityError(): string {
    const h = Number(this.capacityHours);
    if (this.capacityHours === null || (this.capacityHours as unknown) === '') return 'Weekly Capacity is Required';
    if (isNaN(h) || h < 0 || h > 80) return 'Enter 0 – 80 hours';
    if (!this.workingDays.length) return 'Select at least one working day';
    return '';
  }

  resetCapacity() {
    if (!this.member) return;
    this.capacityHours = this.member.WeeklyCapacityHours;
    this.workingDays = [...this.member.WorkingDays];
    this.capacityDirty = false;
  }

  saveCapacity() {
    if (!this.member || this.capacityError) return;
    this.loaderService.showLoader();
    this.teamService.updateCapacity(this.member.ID, Number(this.capacityHours), this.workingDays).subscribe(res => {
      this.loaderService.hideLoader();
      this.notificationsService.showNotification('success', res.Status);
      this.load();
    });
  }
}
