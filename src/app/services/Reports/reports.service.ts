import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, delay, forkJoin, from, map, mergeMap, of, switchMap, toArray } from 'rxjs';
import { Milestone, Project } from '../../Interface/project';
import { Task, TaskPriority, Worklog } from '../../Interface/task';
import {
  DatePreset, ExportDataset, ExportFilter, ExportFormat, ExportHistory, MemberProductivity, ProjectPerformance,
  ReportBase, ReportFilter, ReportScope, ReportTask, ReportWorklog, ScheduledExport, TeamProductivity
} from '../../Interface/reports';
import { ProjectService } from '../Project/project.service';
import { TaskService } from '../Task/task.service';
import { PROJECTS, TEAMS, USERS, CURRENT_USER_ID, userName, teamName, ymd } from '../Shared/mock-directory';
import { ExportColumn, exportCsv, exportExcel, exportPdf } from '../Shared/export.util';

/**
 * Reports & Analytics service.
 *
 * NOTE: OM-API me abhi Reports endpoints nahi hain. Ye service ProjectService / TaskService
 * ka mock data READ karke reports banati hai (taaki numbers baaki screens se match karein),
 * aur purani history (last ~12 weeks ke completed tasks + worklogs) deterministic tarike se
 * synthesize karti hai. Scheduled exports / export history in-memory hain (refresh par reset).
 * Koi email nahi bheja jata.
 */
@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private latency = 200;

  private filterSubject = new BehaviorSubject<ReportFilter>(this.makeFilter('last30'));
  readonly filter$ = this.filterSubject.asObservable();

  private scheduled: ScheduledExport[] = [];
  private history: ExportHistory[] = [];
  private projectNames = new Map<number, string>(PROJECTS.map(p => [p.ID, p.Name]));

  constructor(private projectService: ProjectService, private taskService: TaskService) {
    this.seedSchedules();
  }

  // =================================================================== Filter

  get filter(): ReportFilter {
    return this.filterSubject.value;
  }

  setFilter(changes: Partial<ReportFilter>) {
    const next = { ...this.filter, ...changes };
    if (changes.Preset && changes.Preset !== 'custom') Object.assign(next, this.presetRange(changes.Preset));
    if (next.From > next.To) [next.From, next.To] = [next.To, next.From];
    this.filterSubject.next(next);
  }

  resetFilter() {
    this.filterSubject.next(this.makeFilter('last30'));
  }

  presetRange(preset: DatePreset): { From: string; To: string } {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    switch (preset) {
      case 'week': {
        const mon = this.monday(ymd(t));
        return { From: mon, To: this.addDays(mon, 6) };
      }
      case 'month':
        return { From: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), To: ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
      case 'quarter': {
        const q = Math.floor(t.getMonth() / 3) * 3;
        return { From: ymd(new Date(t.getFullYear(), q, 1)), To: ymd(new Date(t.getFullYear(), q + 3, 0)) };
      }
      default:
        return { From: this.addDays(ymd(t), -29), To: ymd(t) };
    }
  }

  private makeFilter(preset: DatePreset): ReportFilter {
    return { Preset: preset, ...this.presetRange(preset), ProjectIDs: [], TeamID: null };
  }

  rangeLabel(f: ReportFilter = this.filter): string {
    const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${fmt(f.From)} – ${fmt(f.To)}`;
  }

  filterSummary(f: ReportFilter = this.filter): string {
    const parts = [this.rangeLabel(f)];
    if (f.ProjectIDs.length) parts.push(`Projects: ${f.ProjectIDs.map(id => this.projectNames.get(id) || `#${id}`).join(', ')}`);
    if (f.TeamID) parts.push(`Team: ${teamName(f.TeamID)}`);
    return parts.join(' · ');
  }

  // =================================================================== Base data

  /** Loads projects, milestones, tasks and worklogs from the mock services (read-only). */
  getBase(): Observable<ReportBase> {
    return forkJoin([
      // Projects.View na ho to 403 — projects khaali maan kar baaki report banti rahe.
      this.projectService.getAllProjects(false).pipe(catchError(() => of([] as Project[]))),
      this.taskService.getTasks({})
    ]).pipe(switchMap(([pr, tasks]) => {
      const projects = pr || [];
      const wl$: Observable<Worklog[][]> = tasks.length ? forkJoin(tasks.map(t => this.taskService.getWorklogs(t.ID))) : of([]);
      // Ek project ka 404 poora load na gira de; ek saath max 4 requests (100+ projects par flood nahi).
      const ms$: Observable<Milestone[][]> = projects.length
        ? from(projects).pipe(
            mergeMap(p => this.projectService.getMilestones(p.ID).pipe(catchError(() => of([] as Milestone[]))), 4),
            toArray())
        : of([]);
      return forkJoin([wl$, ms$]).pipe(map(([wls, mss]) => this.build(projects, tasks, wls.flat(), mss.flat())));
    }));
  }

  private build(projects: Project[], tasks: Task[], worklogs: Worklog[], milestones: Milestone[]): ReportBase {
    projects.forEach(p => this.projectNames.set(p.ID, p.Name));
    const today = this.today();
    const rTasks: ReportTask[] = tasks.map(t => {
      const created = ymd(new Date(t.CreatedOn));
      let completed: string | null = null;
      if (t.Status === 'Done') {
        completed = t.UpdatedOn && t.UpdatedOn !== t.CreatedOn ? ymd(new Date(t.UpdatedOn)) : this.addDays(created, 5);
        if (completed > today) completed = today;
      }
      return this.toReportTask({
        ID: t.ID, Key: t.Key, ProjectID: t.ProjectID, ProjectName: t.ProjectName, Title: t.Title, Status: t.Status,
        Priority: t.Priority, AssigneeID: t.AssigneeID, AssigneeName: t.AssigneeName, CreatedOn: created,
        StartDate: t.StartDate, DueDate: t.DueDate, CompletedOn: completed, EstimateHours: t.EstimateHours,
        LoggedHours: Math.round((t.LoggedMinutes || 0) / 6) / 10, IsHistory: false
      });
    });
    const taskMap = new Map(rTasks.map(t => [t.ID, t]));
    const rLogs: ReportWorklog[] = worklogs.map(w => {
      const t = taskMap.get(w.TaskID);
      const u = USERS.find(x => x.Name === w.UserName);
      const p = projects.find(x => x.ID === t?.ProjectID);
      return {
        ID: w.ID, TaskID: w.TaskID, TaskKey: t?.Key || '', TaskTitle: t?.Title || '', ProjectID: t?.ProjectID || 0,
        ProjectName: t?.ProjectName || '', UserID: u?.ID || 0, UserName: w.UserName, TeamID: u?.TeamID ?? null,
        WorkDate: w.WorkDate, Hours: Math.round(w.Minutes / 6) / 10, Note: w.Note,
        Billable: this.isBillable(p, w.ID)
      };
    });

    const history = this.synthesizeHistory(projects, rTasks.length ? Math.max(...rTasks.map(t => t.ID)) : 0);
    return {
      Projects: projects,
      Milestones: milestones,
      Tasks: [...rTasks, ...history.tasks],
      Worklogs: [...rLogs, ...history.logs].sort((a, b) => b.WorkDate.localeCompare(a.WorkDate) || b.ID - a.ID)
    };
  }

  private toReportTask(t: Omit<ReportTask, 'TeamID' | 'StoryPoints' | 'CycleDays' | 'OnTime'>): ReportTask {
    const u = USERS.find(x => x.ID === t.AssigneeID);
    const cycle = t.CompletedOn ? Math.max(1, this.daysBetween(t.StartDate && t.StartDate < t.CompletedOn ? t.StartDate : t.CreatedOn, t.CompletedOn)) : null;
    return {
      ...t,
      TeamID: u?.TeamID ?? null,
      StoryPoints: t.EstimateHours <= 4 ? 2 : t.EstimateHours <= 8 ? 3 : t.EstimateHours <= 12 ? 5 : 8,
      CycleDays: cycle,
      OnTime: t.CompletedOn ? (!t.DueDate || t.CompletedOn <= t.DueDate) : null
    };
  }

  private isBillable(p: Project | undefined, seed: number): boolean {
    if (!p || p.ClientName === 'Internal') return false;
    return this.hash(seed * 7 + p.ID) % 6 !== 0;
  }

  /** Deterministic completed tasks + worklogs for the 3..12 weeks before this week. */
  private synthesizeHistory(projects: Project[], lastTaskId: number): { tasks: ReportTask[]; logs: ReportWorklog[] } {
    const titles = ['Bug fixes batch', 'API hardening', 'Report tweaks', 'UI polish', 'Performance tuning', 'Unit test coverage',
      'Code review fixes', 'Release preparation', 'Documentation update', 'Security patches', 'Search improvements', 'Data cleanup'];
    const priorities: TaskPriority[] = ['Medium', 'High', 'Low', 'Medium', 'Critical', 'High'];
    const notes = ['Implementation', 'Review comments', 'Testing & fixes', 'Pairing session', 'Deployment checks'];
    const tasks: ReportTask[] = [];
    const logs: ReportWorklog[] = [];
    let id = Math.max(100000, lastTaskId + 1), logId = 500000;
    const thisMonday = this.monday(this.today());

    PROJECTS.forEach((dp, pi) => {
      const p = projects.find(x => x.ID === dp.ID);
      if (!p) return;
      // Projects ab live hain (member IDs = Guid), history abhi mock USERS (numeric) par banti hai — Team live hone tak.
      const members = USERS.map(u => u.ID);
      let seq = 1;
      for (let w = 12; w >= 3; w--) {
        const h0 = this.hash(pi * 100 + w);
        const count = 1 + (h0 % 3);
        for (let c = 0; c < count; c++) {
          const h = this.hash(pi * 1000 + w * 10 + c);
          const created = this.addDays(thisMonday, -w * 7 + (h % 5));
          const cycle = 2 + (h % 8);
          const completed = this.addDays(created, cycle);
          const due = this.addDays(created, 4 + (h % 6));
          const uid = members[(h >>> 3) % members.length];
          const est = [4, 6, 8, 12, 16][(h >>> 5) % 5];
          const ratio = 0.75 + ((h >>> 7) % 7) / 10;
          const t = this.toReportTask({
            ID: id, Key: `${dp.Prefix}-H${seq++}`, ProjectID: dp.ID, ProjectName: dp.Name,
            Title: titles[(h >>> 2) % titles.length], Status: 'Done', Priority: priorities[(h >>> 4) % priorities.length],
            AssigneeID: uid, AssigneeName: userName(uid), CreatedOn: created, StartDate: created, DueDate: due,
            CompletedOn: completed, EstimateHours: est, LoggedHours: 0, IsHistory: true
          });
          // worklogs on working days between created and completed
          const days: string[] = [];
          for (let d = 0; d <= cycle; d++) {
            const day = this.addDays(created, d);
            const dow = new Date(day + 'T00:00:00').getDay();
            if (dow !== 0 && dow !== 6) days.push(day);
          }
          if (!days.length) days.push(created);
          const total = Math.round(est * ratio * 2) / 2;
          let left = total;
          days.forEach((day, i) => {
            const hrs = i === days.length - 1 ? left : Math.max(0.5, Math.round(total / days.length * 2) / 2);
            if (hrs <= 0) return;
            left = Math.round((left - hrs) * 10) / 10;
            const u = USERS.find(x => x.ID === uid);
            logs.push({
              ID: logId, TaskID: id, TaskKey: t.Key, TaskTitle: t.Title, ProjectID: dp.ID, ProjectName: dp.Name,
              UserID: uid, UserName: userName(uid), TeamID: u?.TeamID ?? null, WorkDate: day, Hours: hrs,
              Note: notes[(h + i) % notes.length], Billable: this.isBillable(p, logId)
            });
            logId++;
            t.LoggedHours = Math.round((t.LoggedHours + hrs) * 10) / 10;
          });
          tasks.push(t);
          id++;
        }
      }
    });
    return { tasks, logs };
  }

  /** Narrows the base data with a filter. */
  scope(base: ReportBase, f: ReportFilter = this.filter): ReportScope {
    const pSet = f.ProjectIDs.length ? new Set(f.ProjectIDs) : null;
    const userIDs = USERS.filter(u => !f.TeamID || u.TeamID === f.TeamID).map(u => u.ID);
    const uSet = new Set(userIDs);
    const projects = base.Projects.filter(p => !pSet || pSet.has(p.ID));
    const tasks = base.Tasks.filter(t => (!pSet || pSet.has(t.ProjectID)) && (!f.TeamID || (t.AssigneeID != null && uSet.has(t.AssigneeID))));
    const all = base.Worklogs.filter(w => (!pSet || pSet.has(w.ProjectID)) && (!f.TeamID || uSet.has(w.UserID)));
    return {
      Filter: f,
      Projects: projects,
      Milestones: base.Milestones.filter(m => !pSet || pSet.has(m.ProjectID)),
      Tasks: tasks,
      AllWorklogs: all,
      Worklogs: all.filter(w => w.WorkDate >= f.From && w.WorkDate <= f.To),
      UserIDs: userIDs
    };
  }

  // =================================================================== Calculations

  inRange(d: string | null, f: ReportFilter): boolean {
    return !!d && d >= f.From && d <= f.To;
  }

  completedInRange(s: ReportScope): ReportTask[] {
    return s.Tasks.filter(t => this.inRange(t.CompletedOn, s.Filter));
  }

  overdue(tasks: ReportTask[]): ReportTask[] {
    const today = this.today();
    return tasks.filter(t => t.Status !== 'Done' && !!t.DueDate && t.DueDate < today);
  }

  /** Working days between from..to, capped at today (capacity can't be consumed in the future). */
  workingDays(from: string, to: string): number {
    const end = to > this.today() ? this.today() : to;
    let n = 0;
    for (let d = from; d <= end; d = this.addDays(d, 1)) {
      const dow = new Date(d + 'T00:00:00').getDay();
      if (dow !== 0 && dow !== 6) n++;
    }
    return n;
  }

  capacityHours(userIDs: number[], f: ReportFilter): number {
    const days = this.workingDays(f.From, f.To);
    return USERS.filter(u => userIDs.includes(u.ID)).reduce((s, u) => s + u.WeeklyCapacityHours / 5 * days, 0);
  }

  /** Monday dates of the `n` weeks ending with the week containing `end`. */
  weekStarts(end: string, n = 12): string[] {
    const last = this.monday(end);
    return Array.from({ length: n }, (_, i) => this.addDays(last, -(n - 1 - i) * 7));
  }

  weekLabel(monday: string): string {
    return new Date(monday + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  weeklyCounts(tasks: ReportTask[], weeks: string[], field: 'CreatedOn' | 'CompletedOn', value: (t: ReportTask) => number = () => 1): number[] {
    return weeks.map(w => {
      const end = this.addDays(w, 6);
      return tasks.filter(t => { const d = t[field]; return !!d && d >= w && d <= end; }).reduce((s, t) => s + value(t), 0);
    });
  }

  plannedProgress(p: Project): number {
    if (p.Status === 'Completed') return 100;
    const total = Math.max(1, this.daysBetween(p.StartDate, p.EndDate));
    const elapsed = Math.min(total, Math.max(0, this.daysBetween(p.StartDate, this.today())));
    return Math.round(elapsed / total * 100);
  }

  projectPerformance(s: ReportScope): ProjectPerformance[] {
    const today = this.today();
    return s.Projects.map(p => {
      const planned = this.plannedProgress(p);
      const ev = Math.round(p.Budget * p.Progress / 100);
      const open = s.Tasks.filter(t => t.ProjectID === p.ID && t.Status !== 'Done');
      return {
        ID: p.ID, Code: p.Code, Name: p.Name, ManagerName: p.ManagerName, Status: p.Status, Health: p.Health, Currency: p.Currency,
        Progress: p.Progress, Planned: planned, ScheduleVariance: p.Progress - planned,
        Budget: p.Budget, Spent: p.Spent, BudgetUsed: p.Budget ? Math.round(p.Spent / p.Budget * 100) : 0,
        EarnedValue: ev, CostVariance: ev - p.Spent, CPI: p.Spent ? Math.round(ev / p.Spent * 100) / 100 : 0,
        OpenTasks: open.length, OverdueTasks: open.filter(t => t.DueDate && t.DueDate < today).length,
        Milestones: s.Milestones.filter(m => m.ProjectID === p.ID)
      };
    });
  }

  private stats(tasks: ReportTask[]) {
    const onTime = tasks.filter(t => t.OnTime).length;
    const cycles = tasks.map(t => t.CycleDays || 0);
    return {
      Completed: tasks.length,
      Throughput: tasks.reduce((x, t) => x + t.StoryPoints, 0),
      OnTimePct: tasks.length ? Math.round(onTime / tasks.length * 100) : 0,
      AvgCycleDays: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length * 10) / 10 : 0
    };
  }

  memberProductivity(s: ReportScope): MemberProductivity[] {
    const done = this.completedInRange(s);
    const weeks = this.weekStarts(s.Filter.To, 8);
    return USERS.filter(u => s.UserIDs.includes(u.ID)).map(u => {
      const mine = done.filter(t => t.AssigneeID === u.ID);
      const hours = Math.round(s.Worklogs.filter(w => w.UserID === u.ID).reduce((x, w) => x + w.Hours, 0) * 10) / 10;
      const cap = Math.round(this.capacityHours([u.ID], s.Filter));
      return {
        UserID: u.ID, Name: u.Name, Designation: u.Designation, TeamID: u.TeamID, TeamName: teamName(u.TeamID),
        ...this.stats(mine), Hours: hours, CapacityHours: cap, Utilization: cap ? Math.round(hours / cap * 100) : 0,
        Weekly: this.weeklyCounts(s.Tasks.filter(t => t.AssigneeID === u.ID), weeks, 'CompletedOn', t => t.StoryPoints)
      };
    });
  }

  teamProductivity(s: ReportScope): TeamProductivity[] {
    const members = this.memberProductivity(s);
    const done = this.completedInRange(s);
    const weeks = this.weekStarts(s.Filter.To, 8);
    return TEAMS.filter(t => members.some(m => m.TeamID === t.ID)).map(team => {
      const ms = members.filter(m => m.TeamID === team.ID);
      const ids = ms.map(m => m.UserID);
      const hours = ms.reduce((x, m) => x + m.Hours, 0);
      const cap = ms.reduce((x, m) => x + m.CapacityHours, 0);
      return {
        TeamID: team.ID, Name: team.Name, Members: ms.length,
        ...this.stats(done.filter(t => t.AssigneeID != null && ids.includes(t.AssigneeID))),
        Hours: Math.round(hours * 10) / 10, Utilization: cap ? Math.round(hours / cap * 100) : 0,
        Weekly: this.weeklyCounts(s.Tasks.filter(t => t.AssigneeID != null && ids.includes(t.AssigneeID)), weeks, 'CompletedOn', t => t.StoryPoints)
      };
    });
  }

  // =================================================================== Export center datasets

  readonly datasets: { key: ExportDataset; label: string; description: string }[] = [
    { key: 'Projects', label: 'Projects', description: 'Schedule, budget and health of every project' },
    { key: 'Tasks', label: 'Tasks', description: 'Tasks with status, dates, estimates and time' },
    { key: 'Worklogs', label: 'Worklogs', description: 'Every time entry with person, task and hours' },
    { key: 'Members', label: 'Team members', description: 'People with throughput and utilization' },
    { key: 'Milestones', label: 'Milestones', description: 'Project milestones and their progress' },
  ];

  datasetStatuses(ds: ExportDataset): string[] {
    switch (ds) {
      case 'Projects': return ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
      case 'Tasks': return ['To Do', 'In Progress', 'In Review', 'Done'];
      case 'Worklogs': return ['Billable', 'Non-billable'];
      case 'Members': return ['Active', 'Invited', 'Inactive'];
      default: return ['Pending', 'In Progress', 'Completed', 'Delayed'];
    }
  }

  datasetColumns(ds: ExportDataset): ExportColumn[] {
    const money = (v: number) => v == null ? '' : v.toLocaleString('en-IN');
    const pct = (v: number) => v == null ? '' : `${v}%`;
    const date = (v: string | null) => v ? this.displayDate(v) : '';
    switch (ds) {
      case 'Projects': return [
        { key: 'Code', label: 'Code' }, { key: 'Name', label: 'Project' }, { key: 'ClientName', label: 'Client' },
        { key: 'ManagerName', label: 'Manager' }, { key: 'Status', label: 'Status' }, { key: 'Health', label: 'Health' },
        { key: 'Priority', label: 'Priority' }, { key: 'StartDate', label: 'Start', format: date }, { key: 'EndDate', label: 'End', format: date },
        { key: 'Progress', label: 'Progress', format: pct }, { key: 'Budget', label: 'Budget', format: money },
        { key: 'Spent', label: 'Spent', format: money }, { key: 'TotalTasks', label: 'Total tasks' }, { key: 'CompletedTasks', label: 'Completed tasks' },
      ];
      case 'Tasks': return [
        { key: 'Key', label: 'Key' }, { key: 'Title', label: 'Title' }, { key: 'ProjectName', label: 'Project' },
        { key: 'AssigneeName', label: 'Assignee' }, { key: 'Status', label: 'Status' }, { key: 'Priority', label: 'Priority' },
        { key: 'CreatedOn', label: 'Created', format: date }, { key: 'DueDate', label: 'Due', format: date },
        { key: 'CompletedOn', label: 'Completed', format: date }, { key: 'EstimateHours', label: 'Estimate (h)' },
        { key: 'LoggedHours', label: 'Logged (h)' }, { key: 'CycleDays', label: 'Cycle (days)' },
        { key: 'OnTime', label: 'On time', format: (v: boolean | null) => v == null ? '' : v ? 'Yes' : 'No' },
      ];
      case 'Worklogs': return [
        { key: 'WorkDate', label: 'Date', format: date }, { key: 'UserName', label: 'Person' }, { key: 'ProjectName', label: 'Project' },
        { key: 'TaskKey', label: 'Task key' }, { key: 'TaskTitle', label: 'Task' }, { key: 'Hours', label: 'Hours' },
        { key: 'Billable', label: 'Billable' }, { key: 'Note', label: 'Note' },
      ];
      case 'Members': return [
        { key: 'Name', label: 'Name' }, { key: 'Email', label: 'Email' }, { key: 'Designation', label: 'Designation' },
        { key: 'TeamName', label: 'Team' }, { key: 'Location', label: 'Location' }, { key: 'Status', label: 'Status' },
        { key: 'Completed', label: 'Tasks completed' }, { key: 'Throughput', label: 'Throughput (pts)' },
        { key: 'OnTimePct', label: 'On-time %', format: pct }, { key: 'Hours', label: 'Hours logged' },
        { key: 'Utilization', label: 'Utilization', format: pct },
      ];
      default: return [
        { key: 'ProjectName', label: 'Project' }, { key: 'Title', label: 'Milestone' }, { key: 'OwnerName', label: 'Owner' },
        { key: 'StartDate', label: 'Start', format: date }, { key: 'DueDate', label: 'Due', format: date },
        { key: 'Status', label: 'Status' }, { key: 'Progress', label: 'Progress', format: pct },
        { key: 'CompletedTasks', label: 'Tasks done' }, { key: 'TotalTasks', label: 'Total tasks' },
      ];
    }
  }

  datasetRows(base: ReportBase, ds: ExportDataset, f: ExportFilter): any[] {
    const pOk = (id: number) => !f.ProjectID || id === f.ProjectID;
    const inR = (d: string | null | undefined) => !!d && d >= f.From && d <= f.To;
    switch (ds) {
      case 'Projects':
        return base.Projects.filter(p => pOk(p.ID) && (!f.Status || p.Status === f.Status) && p.StartDate <= f.To && p.EndDate >= f.From);
      case 'Tasks':
        return base.Tasks.filter(t => pOk(t.ProjectID) && (!f.Status || t.Status === f.Status)
          && t.CreatedOn <= f.To && (t.CompletedOn || (t.DueDate > f.To ? t.DueDate : f.To)) >= f.From)
          .sort((a, b) => b.CreatedOn.localeCompare(a.CreatedOn));
      case 'Worklogs':
        return base.Worklogs.filter(w => pOk(w.ProjectID) && inR(w.WorkDate)
          && (!f.Status || (f.Status === 'Billable') === w.Billable));
      case 'Members': {
        const rf: ReportFilter = { Preset: 'custom', From: f.From, To: f.To, ProjectIDs: f.ProjectID ? [f.ProjectID] : [], TeamID: null };
        const prod = this.memberProductivity(this.scope(base, rf));
        const proj = f.ProjectID ? base.Projects.find(p => p.ID === f.ProjectID) : null;
        return USERS.filter(u => (!f.Status || u.Status === f.Status) && (!proj || proj.MemberIDs.includes(String(u.ID)))).map(u => {
          const m = prod.find(x => x.UserID === u.ID);
          return { ...u, TeamName: teamName(u.TeamID), Completed: m?.Completed || 0, Throughput: m?.Throughput || 0,
            OnTimePct: m?.OnTimePct || 0, Hours: m?.Hours || 0, Utilization: m?.Utilization || 0 };
        });
      }
      default:
        return base.Milestones.filter(m => pOk(m.ProjectID) && (!f.Status || m.Status === f.Status) && m.StartDate <= f.To && m.DueDate >= f.From)
          .map(m => ({ ...m, ProjectName: base.Projects.find(p => p.ID === m.ProjectID)?.Name || '' }));
    }
  }

  // =================================================================== Export + history

  /** Generates the file and records it in the history. Returns false when the PDF popup was blocked. */
  runExport(format: ExportFormat, title: string, rows: any[], columns: ExportColumn[], meta: {
    source: string; fileName: string; subtitle?: string; dataset?: ExportDataset | null; filter?: ExportFilter | null; record?: boolean
  }): boolean {
    const stamp = this.today().replace(/-/g, '');
    const fileName = `${meta.fileName}-${stamp}`;
    let ok = true;
    if (format === 'CSV') exportCsv(rows, columns, fileName);
    else if (format === 'Excel') exportExcel(rows, columns, fileName, title);
    else ok = exportPdf(title, rows, columns, meta.subtitle);
    if (ok && meta.record !== false) {
      this.history.unshift({
        ID: Math.max(0, ...this.history.map(h => h.ID)) + 1,
        FileName: `${fileName}.${format === 'CSV' ? 'csv' : format === 'Excel' ? 'xls' : 'pdf'}`,
        Title: title, Source: meta.source, Dataset: meta.dataset ?? null, Format: format, Rows: rows.length,
        ColumnKeys: columns.map(c => c.key), Filter: meta.filter ?? null, ExportedOn: new Date().toISOString(),
        ExportedBy: userName(CURRENT_USER_ID),
        Snapshot: meta.dataset ? undefined : { rows, columns, subtitle: meta.subtitle }
      });
      if (this.history.length > 30) this.history.length = 30;
    }
    return ok;
  }

  getExportHistory(): Observable<ExportHistory[]> {
    return this.respond([...this.history]);
  }

  clearExportHistory(): Observable<any> {
    this.history = [];
    return this.respond({ Status: 'Export History Deleted Successfully!' });
  }

  getScheduledExports(): Observable<ScheduledExport[]> {
    return this.respond(this.scheduled.map(s => ({ ...s, Recipients: [...s.Recipients] })));
  }

  scheduledExportAddEdit(data: Omit<ScheduledExport, 'ID' | 'NextRun' | 'CreatedBy'> & { ID: number }): Observable<any> {
    if (data.ID) {
      const s = this.scheduled.find(x => x.ID === data.ID);
      if (!s) return this.respond({ Status: 'Scheduled Export Not Found' });
      Object.assign(s, { ...data, Recipients: [...data.Recipients], NextRun: this.nextRun(data.Frequency) });
      return this.respond({ Status: 'Scheduled Export Updated Successfully...' });
    }
    const ID = Math.max(0, ...this.scheduled.map(s => s.ID)) + 1;
    this.scheduled.push({ ...data, ID, Recipients: [...data.Recipients], NextRun: this.nextRun(data.Frequency), CreatedBy: userName(CURRENT_USER_ID) });
    return this.respond({ Status: 'Scheduled Export Added Successfully...' });
  }

  toggleScheduledExport(ID: number, Active: boolean): Observable<any> {
    const s = this.scheduled.find(x => x.ID === ID);
    if (s) s.Active = Active;
    return this.respond({ Status: 'Scheduled Export Updated Successfully...' });
  }

  deleteScheduledExport(ID: number): Observable<any> {
    this.scheduled = this.scheduled.filter(s => s.ID !== ID);
    return this.respond({ Status: 'Scheduled Export Deleted Successfully!' });
  }

  nextRun(freq: ScheduledExport['Frequency']): string {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    if (freq === 'Daily') d.setDate(d.getDate() + 1);
    else if (freq === 'Weekly') d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    else d.setMonth(d.getMonth() + 1, 1);
    return d.toISOString();
  }

  private seedSchedules() {
    this.scheduled = [
      { ID: 1, Name: 'Weekly project status', Dataset: 'Projects', Format: 'Excel', Frequency: 'Weekly',
        Recipients: ['aarav.sharma@example.com', 'neha.gupta@example.com'], NextRun: this.nextRun('Weekly'), Active: true, CreatedBy: 'Aarav Sharma' },
      { ID: 2, Name: 'Daily timesheet dump', Dataset: 'Worklogs', Format: 'CSV', Frequency: 'Daily',
        Recipients: ['vikram.singh@example.com'], NextRun: this.nextRun('Daily'), Active: true, CreatedBy: 'Vikram Singh' },
      { ID: 3, Name: 'Monthly milestone review', Dataset: 'Milestones', Format: 'PDF', Frequency: 'Monthly',
        Recipients: ['sneha.iyer@example.com', 'priya.verma@example.com'], NextRun: this.nextRun('Monthly'), Active: false, CreatedBy: 'Sneha Iyer' },
    ];
  }

  // =================================================================== Helpers

  displayDate(s: string): string {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  today(): string {
    return ymd(new Date());
  }

  addDays(s: string, n: number): string {
    const d = new Date(s + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  daysBetween(from: string, to: string): number {
    return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000);
  }

  monday(s: string): string {
    const d = new Date(s + 'T00:00:00');
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return ymd(d);
  }

  private hash(n: number): number {
    let x = (n + 0x9e3779b9) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  }

  private respond<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }
}
