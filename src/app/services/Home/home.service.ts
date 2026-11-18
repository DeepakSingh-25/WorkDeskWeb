import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { Task, TaskStatus } from '../../Interface/task';
import { Issue, Sprint } from '../../Interface/agile';
import { Milestone, Project } from '../../Interface/project';
import {
  CalendarItem, FeedItem, HomeContext, HomeMention, HomeMilestone, HomeNotification, HomeSprint, InboxItem, MyProject
} from '../../Interface/home';
import { ProjectService } from '../Project/project.service';
import { TaskService } from '../Task/task.service';
import { WorkflowService } from '../Workflow/workflow.service';
import { TeamService } from '../Team/team.service';
import { AgileService } from '../Agile/agile.service';
import { AuthService } from '../Auth/auth.service';
import { CURRENT_USER_ID, PROJECTS, userName, ymd } from '../Shared/mock-directory';

/** forkJoin that also emits for an empty list. */
function all<T>(list: Observable<T>[]): Observable<T[]> {
  return list.length ? forkJoin(list) : of([]);
}

/**
 * Main dashboard ("My work") aggregator.
 *
 * NOTE: OM-API me abhi dashboard endpoints nahi hain. Ye service READ-ONLY tarike se
 * Project / Task / Workflow / Team / Agile in-memory services ka data jodti hai.
 * Sirf Notifications list (read/unread), favourites aur inbox snooze/archive state
 * yahin memory me rakhe jaate hain (page refresh par reset).
 */
@Injectable({
  providedIn: 'root'
})
export class HomeService {
  readonly meID = CURRENT_USER_ID;
  readonly meName = userName(CURRENT_USER_ID);

  private favourites = new Set<number>([1]);
  private notifications: HomeNotification[] | null = null;
  private notificationsFor: string | null = null;   // token jiske liye notifications bani
  private inboxState: { [key: string]: { Read?: boolean; Archived?: boolean; SnoozedUntil?: string } } = {};

  private unread$ = new BehaviorSubject<number>(0);
  private inboxPending$ = new BehaviorSubject<number>(0);
  /** Unread notification count (nav badge). */
  readonly unreadCount$ = this.unread$.asObservable();
  /** Pending (unread, not archived/snoozed) inbox items (nav badge). */
  readonly inboxCount$ = this.inboxPending$.asObservable();

  // GET Projects/all ek Home page load me 4 baar (overview, notifications, inbox, badges) na jaaye —
  // chhota cache (30 s TTL), error par reset.
  private static readonly PROJECTS_TTL = 30000;
  private projects$: Observable<Project[]> | null = null;
  private projectsAt = 0;
  private projectsFor: string | null = null;   // token jiska cache hai — user badle to reset
  private milestones = new Map<number, Observable<Milestone[]>>();   // projects$ ke saath reset

  constructor(
    private projectService: ProjectService,
    private taskService: TaskService,
    private workflowService: WorkflowService,
    private teamService: TeamService,
    private agileService: AgileService,
    private authService: AuthService
  ) { }

  // ---------------- Context ----------------

  getContext(): Observable<HomeContext> {
    return forkJoin({
      projects: this.getProjects(),
      tasks: this.taskService.getTasks({}),
      approvals: this.workflowService.getApprovals(),
      leaves: this.teamService.getLeaves(),
      holidays: this.teamService.getHolidays(),
    }).pipe(switchMap(src => {
      // Projects API live hai — "my projects" asli logged-in user (Guid) se; baaki mock data CURRENT_USER_ID par hi.
      const me = (this.authService.getUserId() || '').toLowerCase();
      const isMe = (id: string | null | undefined) => !!me && (id || '').toLowerCase() === me;
      const mine = src.projects.filter(p => isMe(p.ManagerID) || (p.MemberIDs || []).some(isMe));
      const agileIDs = PROJECTS.map(p => p.ID).filter(id => mine.some(p => p.ID === id));
      return forkJoin({
        // Ek project ka 404 poora forkJoin na gira de.
        milestones: all(mine.map(p => this.getMilestones(p.ID))),
        sprints: all(agileIDs.map(id => this.agileService.getSprints(id))),
        issues: all(agileIDs.map(id => this.agileService.getIssues(id, { AssigneeID: this.meID }))),
      }).pipe(map(more => {
        const today = this.today();
        const milestones: HomeMilestone[] = more.milestones.flat()
          .map(m => ({ ...m, ProjectName: mine.find(p => p.ID === m.ProjectID)?.Name || '' }));
        const sprints: HomeSprint[] = more.sprints.flat()
          .map((s: Sprint) => ({ ...s, ProjectName: PROJECTS.find(p => p.ID === s.ProjectID)?.Name || '' }));
        const activeIDs = sprints.filter(s => s.State === 'Active').map(s => s.ID);
        const myTasks = src.tasks.filter(t => t.AssigneeID === this.meID);
        const projects: MyProject[] = mine.map(p => {
          const next = milestones.filter(m => m.ProjectID === p.ID && m.Status !== 'Completed')
            .sort((a, b) => a.DueDate.localeCompare(b.DueDate))[0] || null;
          return {
            ...p,
            Role: isMe(p.ManagerID) ? 'Manager' : 'Member',
            MyOpenTasks: myTasks.filter(t => t.ProjectID === p.ID && t.Status !== 'Done').length,
            NextMilestone: next as Milestone | null,
            DaysLeft: this.daysBetween(today, p.EndDate),
            Favourite: this.favourites.has(p.ID),
          };
        });
        return {
          Tasks: src.tasks,
          MyTasks: myTasks,
          Projects: projects,
          Milestones: milestones,
          Approvals: src.approvals.filter(a => a.Status === 'Pending' && a.ApproverID === this.meID),
          Leaves: src.leaves.filter(l => l.UserID === this.meID && l.Status !== 'Rejected'),
          Holidays: src.holidays,
          Sprints: sprints,
          SprintIssues: more.issues.flat().filter((i: Issue) => !!i.SprintID && activeIDs.includes(i.SprintID)),
        };
      }));
    }));
  }

  // ---------------- Projects ----------------

  /**
   * Live `GET Projects/all`, cached for PROJECTS_TTL. Projects.View na ho to 403 — tab khaali list,
   * taaki baaki dashboard chalta rahe (aur cache reset, agli baar dobara try).
   */
  private getProjects(): Observable<Project[]> {
    const token = this.authService.getToken();
    if (!this.projects$ || this.projectsFor !== token || Date.now() - this.projectsAt > HomeService.PROJECTS_TTL) {
      this.projectsFor = token;
      const req$: Observable<Project[]> = this.projectService.getAllProjects(false).pipe(
        catchError(() => {
          if (this.projects$ === req$) this.projects$ = null;
          return of([] as Project[]);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.projects$ = req$;
      this.projectsAt = Date.now();
      this.milestones.clear();
    }
    return this.projects$;
  }

  /** Per-project `GET …/milestones`, cached as long as projects$ (overview / notifications / inbox ek hi baar mangen). */
  private getMilestones(ProjectID: number): Observable<Milestone[]> {
    let ms$ = this.milestones.get(ProjectID);
    if (!ms$) {
      // Ek project ka 404 poora forkJoin na gira de; error par entry hata do, agli baar retry.
      ms$ = this.projectService.getMilestones(ProjectID).pipe(
        catchError(() => {
          this.milestones.delete(ProjectID);
          return of([] as Milestone[]);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.milestones.set(ProjectID, ms$);
    }
    return ms$;
  }

  isFavourite(ID: number): boolean {
    return this.favourites.has(ID);
  }

  toggleFavourite(ID: number): Observable<{ Status: string; Favourite: boolean }> {
    if (this.favourites.has(ID)) this.favourites.delete(ID); else this.favourites.add(ID);
    const fav = this.favourites.has(ID);
    return of({ Status: fav ? 'Added to Favourites' : 'Removed from Favourites', Favourite: fav });
  }

  // ---------------- Tasks ----------------

  setTaskStatus(ID: number, Status: TaskStatus): Observable<any> {
    return this.taskService.updateTaskField(ID, { Status }).pipe(tap(() => this.refreshCounts()));
  }

  /** Minutes the current user logged per day (yyyy-MM-dd) for the given tasks. */
  getMyWorklogMinutes(tasks: Task[]): Observable<{ [day: string]: number }> {
    return all(tasks.map(t => this.taskService.getWorklogs(t.ID))).pipe(map(lists => {
      const byDay: { [day: string]: number } = {};
      lists.flat().filter(w => w.UserName === this.meName).forEach(w => byDay[w.WorkDate] = (byDay[w.WorkDate] || 0) + w.Minutes);
      return byDay;
    }));
  }

  /** Comments (on any task) that mention the current user. */
  getMentions(tasks: Task[]): Observable<HomeMention[]> {
    const first = this.meName.split(' ')[0].toLowerCase();
    return all(tasks.map(t => this.taskService.getComments(t.ID).pipe(map(list => list
      .filter(c => c.UserName !== this.meName && (c.Mentions.includes(this.meName) || c.Text.toLowerCase().includes('@' + first)))
      .map(c => ({
        ID: c.ID, TaskID: t.ID, TaskKey: t.Key, TaskTitle: t.Title, ProjectName: t.ProjectName,
        UserName: c.UserName, Text: c.Text, CreatedOn: this.clampNow(c.CreatedOn, c.ID)
      }))))))
      .pipe(map(l => l.flat().sort((a, b) => b.CreatedOn.localeCompare(a.CreatedOn))));
  }

  // ---------------- Inbox ----------------

  getInbox(): Observable<InboxItem[]> {
    return this.getContext().pipe(switchMap(ctx => this.getMentions(ctx.Tasks).pipe(map(mentions => {
      const items: InboxItem[] = [];
      const recent = Date.now() - 3 * 86400000;
      ctx.MyTasks.filter(t => t.Status !== 'Done' && t.Status !== 'In Review').forEach(t => items.push(this.inboxRow({
        Key: 'task-' + t.ID, Type: 'task', RefID: t.ID, Ref: t.Key, Title: t.Title, Snippet: `${t.ReporterName} assigned this task to you`,
        FromName: t.ReporterName, ProjectName: t.ProjectName, ReceivedOn: this.clampNow(t.CreatedOn, t.ID), DueOn: t.DueDate, Priority: t.Priority,
        TaskStatus: t.Status, Unread: new Date(t.CreatedOn).getTime() > recent, Link: '/tasks', QueryParams: { task: t.ID }
      })));
      ctx.Approvals.forEach(a => items.push(this.inboxRow({
        Key: 'approval-' + a.ID, Type: 'approval', RefID: a.ID, Ref: a.Key, Title: a.Title,
        Snippet: `${a.Type} · ${a.WorkflowName} · step ${a.CurrentStep} of ${a.TotalSteps}`,
        FromName: userName(a.RequesterID), ProjectName: '', ReceivedOn: this.clampNow(a.SubmittedOn, a.ID), DueOn: a.DueOn ? a.DueOn.substring(0, 10) : '',
        Priority: a.Priority, TaskStatus: '', Unread: true, Link: '/workflows'
      })));
      mentions.forEach(m => items.push(this.inboxRow({
        Key: 'mention-' + m.ID, Type: 'mention', RefID: m.TaskID, Ref: m.TaskKey, Title: m.TaskTitle, Snippet: m.Text,
        FromName: m.UserName, ProjectName: m.ProjectName, ReceivedOn: m.CreatedOn, DueOn: '', Priority: '', TaskStatus: '',
        Unread: new Date(m.CreatedOn).getTime() > recent, Link: '/tasks', QueryParams: { task: m.TaskID, tab: 'comments' }
      })));
      ctx.Tasks.filter(t => t.Status === 'In Review' && (t.AssigneeID === this.meID || t.ReporterName === this.meName)).forEach(t => items.push(this.inboxRow({
        Key: 'review-' + t.ID, Type: 'review', RefID: t.ID, Ref: t.Key, Title: t.Title,
        Snippet: t.AssigneeID === this.meID ? 'Your task is waiting for review' : `${t.AssigneeName} sent this task for your review`,
        FromName: t.AssigneeID === this.meID ? t.ReporterName : t.AssigneeName, ProjectName: t.ProjectName, ReceivedOn: this.clampNow(t.UpdatedOn, t.ID),
        DueOn: t.DueDate, Priority: t.Priority, TaskStatus: t.Status, Unread: true, Link: '/tasks', QueryParams: { task: t.ID }
      })));
      items.sort((a, b) => b.ReceivedOn.localeCompare(a.ReceivedOn));
      this.inboxPending$.next(items.filter(i => this.isPending(i)).length);
      return items;
    }))));
  }

  setInboxState(item: InboxItem, patch: { Read?: boolean; Archived?: boolean; SnoozedUntil?: string }) {
    this.inboxState[item.Key] = { ...this.inboxState[item.Key], ...patch };
    Object.assign(item, {
      Unread: patch.Read !== undefined ? !patch.Read : item.Unread,
      Archived: patch.Archived ?? item.Archived,
      SnoozedUntil: patch.SnoozedUntil ?? item.SnoozedUntil,
    });
  }

  updateInboxCount(items: InboxItem[]) {
    this.inboxPending$.next(items.filter(i => this.isPending(i)).length);
  }

  isSnoozed(i: InboxItem): boolean {
    return !!i.SnoozedUntil && i.SnoozedUntil > new Date().toISOString();
  }

  private isPending(i: InboxItem): boolean {
    return i.Unread && !i.Archived && !this.isSnoozed(i);
  }

  private inboxRow(row: Omit<InboxItem, 'Archived' | 'SnoozedUntil'>): InboxItem {
    const st = this.inboxState[row.Key] || {};
    return { ...row, Unread: st.Read !== undefined ? !st.Read : row.Unread, Archived: !!st.Archived, SnoozedUntil: st.SnoozedUntil || '' };
  }

  // ---------------- Notifications (seeded once, kept in memory) ----------------

  getNotifications(): Observable<HomeNotification[]> {
    // Notifications pichhle user ke projects / milestones se bani hon to reset.
    const token = this.authService.getToken();
    if (this.notificationsFor !== token) {
      this.notifications = null;
      this.notificationsFor = token;
    }
    if (this.notifications) return of(this.notifications.map(n => ({ ...n })));
    return this.getContext().pipe(
      switchMap(ctx => this.getMentions(ctx.Tasks).pipe(map(m => this.seedNotifications(ctx, m)))),
      map(list => {
        if (!this.notifications) this.notifications = list;
        this.emitUnread();
        return this.notifications.map(n => ({ ...n }));
      }));
  }

  markRead(ID: number, Read = true): Observable<{ Status: string }> {
    const n = this.notifications?.find(x => x.ID === ID);
    if (n) n.Read = Read;
    this.emitUnread();
    return of({ Status: 'Notification Updated Successfully...' });
  }

  markAllRead(): Observable<{ Status: string }> {
    this.notifications?.forEach(n => n.Read = true);
    this.emitUnread();
    return of({ Status: 'All Notifications Marked as Read' });
  }

  deleteNotification(ID: number): Observable<{ Status: string }> {
    if (this.notifications) this.notifications = this.notifications.filter(n => n.ID !== ID);
    this.emitUnread();
    return of({ Status: 'Notification Deleted Successfully!' });
  }

  /** Recomputes both nav badges. */
  refreshCounts() {
    // Sirf badges — error par chup-chaap purana count rehne do.
    this.getNotifications().subscribe({ error: () => { } });
    this.getInbox().subscribe({ error: () => { } });
  }

  private emitUnread() {
    this.unread$.next((this.notifications || []).filter(n => !n.Read).length);
  }

  private seedNotifications(ctx: HomeContext, mentions: HomeMention[]): HomeNotification[] {
    const list: Omit<HomeNotification, 'ID' | 'Read'>[] = [];
    const today = this.today();
    const at = (day: string, hh: number) => this.clampNow(new Date(`${day}T${String(hh).padStart(2, '0')}:00:00`).toISOString());
    const twoWeeks = Date.now() - 14 * 86400000;

    ctx.MyTasks.filter(t => t.Status !== 'Done' && new Date(t.CreatedOn).getTime() > twoWeeks).forEach(t => list.push({
      Type: 'assignment', Title: `${t.Key} assigned to you`, Text: t.Title, ActorName: t.ReporterName, ProjectName: t.ProjectName,
      CreatedOn: this.clampNow(t.CreatedOn, t.ID), Link: '/tasks', QueryParams: { task: t.ID }
    }));
    mentions.slice(0, 8).forEach(m => list.push({
      Type: 'mention', Title: `${m.UserName} mentioned you on ${m.TaskKey}`, Text: m.Text, ActorName: m.UserName,
      ProjectName: m.ProjectName, CreatedOn: m.CreatedOn, Link: '/tasks', QueryParams: { task: m.TaskID, tab: 'comments' }
    }));
    ctx.Approvals.forEach(a => list.push({
      Type: 'approval', Title: `Approval needed: ${a.Key}`, Text: a.Title, ActorName: userName(a.RequesterID), ProjectName: a.WorkflowName,
      CreatedOn: this.clampNow(a.SubmittedOn, a.ID), Link: '/workflows'
    }));
    ctx.MyTasks.filter(t => t.Status !== 'Done' && t.DueDate && t.DueDate >= today && this.daysBetween(today, t.DueDate) <= 1).forEach(t => list.push({
      Type: 'due', Title: `${t.Key} is due ${t.DueDate === today ? 'today' : 'tomorrow'}`, Text: t.Title, ActorName: 'System',
      ProjectName: t.ProjectName, CreatedOn: at(today, 8), Link: '/tasks', QueryParams: { task: t.ID }
    }));
    ctx.MyTasks.filter(t => t.Status !== 'Done' && t.DueDate && t.DueDate < today).slice(0, 5).forEach(t => list.push({
      Type: 'overdue', Title: `${t.Key} is overdue by ${this.daysBetween(t.DueDate, today)}d`, Text: t.Title, ActorName: 'System',
      ProjectName: t.ProjectName, CreatedOn: at(today, 7), Link: '/tasks', QueryParams: { task: t.ID }
    }));
    ctx.Milestones.filter(m => m.Status !== 'Completed' && this.daysBetween(today, m.DueDate) >= -3 && this.daysBetween(today, m.DueDate) <= 10).forEach(m => {
      const left = this.daysBetween(today, m.DueDate);
      list.push({
        Type: 'milestone', Title: left < 0 ? `Milestone missed: ${m.Title}` : `Milestone due in ${left}d: ${m.Title}`, Text: `${m.Progress}% complete · owner ${m.OwnerName}`,
        ActorName: 'System', ProjectName: m.ProjectName, CreatedOn: at(this.addDays(today, -Math.min(2, Math.max(0, 10 - left) % 3)), 9),
        Link: `/projects/${m.ProjectID}/milestones`
      });
    });
    ctx.Sprints.filter(s => s.State === 'Active').forEach(s => list.push({
      Type: 'sprint', Title: `${s.Name} started`, Text: s.Goal || 'Sprint is now active', ActorName: 'System', ProjectName: s.ProjectName,
      CreatedOn: at(s.StartDate, 10), Link: '/agile/board', QueryParams: { project: s.ProjectID }
    }));

    const twoDays = Date.now() - 2 * 86400000;
    return list.sort((a, b) => b.CreatedOn.localeCompare(a.CreatedOn)).slice(0, 40)
      .map((n, i) => ({ ...n, ID: i + 1, Read: new Date(n.CreatedOn).getTime() < twoDays || i % 4 === 3 }));
  }

  // ---------------- Calendar ----------------

  getCalendarItems(ctx: HomeContext): CalendarItem[] {
    const today = this.today();
    const items: CalendarItem[] = [];
    ctx.MyTasks.filter(t => !!t.DueDate).forEach(t => items.push({
      ID: 't' + t.ID, Type: 'task', Title: `${t.Key} ${t.Title}`, Date: t.DueDate, Meta: `${t.ProjectName} · ${t.Status}`,
      Done: t.Status === 'Done', Late: t.Status !== 'Done' && t.DueDate < today, Link: '/tasks', QueryParams: { task: t.ID }
    }));
    ctx.Milestones.forEach(m => items.push({
      ID: 'm' + m.ID, Type: 'milestone', Title: `◆ ${m.Title}`, Date: m.DueDate, Meta: `${m.ProjectName} · ${m.Status}`,
      Done: m.Status === 'Completed', Late: m.Status !== 'Completed' && m.DueDate < today, Link: `/projects/${m.ProjectID}/milestones`
    }));
    ctx.Leaves.forEach(l => {
      for (let d = l.FromDate; d <= l.ToDate; d = this.addDays(d, 1)) {
        items.push({
          ID: `l${l.ID}-${d}`, Type: 'leave', Title: `${l.Type} leave${l.HalfDay ? ' (½)' : ''}`, Date: d, Meta: `${l.Status} · ${l.Reason}`,
          Done: false, Late: false, Link: '/team'
        });
      }
    });
    ctx.Holidays.forEach(h => items.push({
      ID: 'h' + h.Date, Type: 'holiday', Title: h.Name, Date: h.Date, Meta: 'Public holiday', Done: false, Late: false, Link: '/team'
    }));
    ctx.Sprints.forEach(s => {
      items.push({ ID: `s${s.ID}a`, Type: 'sprint', Title: `▶ ${s.Name} starts`, Date: s.StartDate, Meta: `${s.ProjectName} · ${s.State}`, Done: s.State === 'Completed', Late: false, Link: '/agile/board', QueryParams: { project: s.ProjectID } });
      items.push({ ID: `s${s.ID}b`, Type: 'sprint', Title: `■ ${s.Name} ends`, Date: s.EndDate, Meta: `${s.ProjectName} · ${s.State}`, Done: s.State === 'Completed', Late: false, Link: '/agile/board', QueryParams: { project: s.ProjectID } });
    });
    return items;
  }

  // ---------------- Activity feed ----------------

  getActivityFeed(ctx: HomeContext): Observable<FeedItem[]> {
    const ids = ctx.Projects.map(p => p.ID);
    const tasks = ctx.Tasks.filter(t => ids.includes(t.ProjectID) || t.AssigneeID === this.meID);
    return all(tasks.map(t => this.taskService.getActivity(t.ID).pipe(map(list => list.map(a => ({
      ID: 'a' + a.ID, Type: a.Type, UserName: a.UserName, Text: a.Text, Target: `${t.Key} ${t.Title}`,
      ProjectID: t.ProjectID, ProjectName: t.ProjectName, CreatedOn: this.clampNow(a.CreatedOn, a.ID), Link: '/tasks', QueryParams: { task: t.ID }
    } as FeedItem)))))).pipe(map(lists => {
      const feed = lists.flat();
      const today = this.today();
      ctx.Milestones.filter(m => m.Status === 'Completed' && m.DueDate <= today).forEach(m => feed.push({
        ID: 'm' + m.ID, Type: 'milestone', UserName: m.OwnerName, Text: 'completed the milestone', Target: m.Title,
        ProjectID: m.ProjectID, ProjectName: m.ProjectName, CreatedOn: new Date(`${m.DueDate}T17:00:00`).toISOString(), Link: `/projects/${m.ProjectID}/milestones`
      }));
      ctx.Sprints.filter(s => s.State !== 'Planned' && s.StartDate <= today).forEach(s => feed.push({
        ID: 's' + s.ID, Type: 'sprint', UserName: ctx.Projects.find(p => p.ID === s.ProjectID)?.ManagerName || 'Scrum Master', Text: 'started the sprint',
        Target: s.Name, ProjectID: s.ProjectID, ProjectName: s.ProjectName, CreatedOn: new Date(`${s.StartDate}T10:00:00`).toISOString(),
        Link: '/agile/board', QueryParams: { project: s.ProjectID }
      }));
      return feed.sort((a, b) => b.CreatedOn.localeCompare(a.CreatedOn));
    }));
  }

  // ---------------- helpers ----------------

  today(): string {
    return ymd(new Date());
  }

  addDays(day: string, n: number): string {
    const d = new Date(day + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  daysBetween(from: string, to: string): number {
    return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000);
  }

  /** Monday of the week containing `day`. */
  weekStart(day: string): string {
    const d = new Date(day + 'T00:00:00');
    return this.addDays(day, -((d.getDay() + 6) % 7));
  }

  /** Seed dates can lie in the future; pull them back into the recent past (spread by `seed`). */
  private clampNow(iso: string, seed = 0): string {
    const now = Date.now();
    return new Date(iso).getTime() > now ? new Date(now - ((seed % 12) + 1) * 47 * 60000).toISOString() : iso;
  }
}
