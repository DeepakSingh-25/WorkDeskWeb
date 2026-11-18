import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import {
  AcceptanceItem, Epic, EpicStatus, EpicSummary, Issue, IssueAddEdit, IssueFilter, IssuePriority, IssueStatus, IssueType,
  RetroCard, RetroColumn, Sprint, SprintCapacity, SprintDay, SprintSummary
} from '../../Interface/agile';
import { CURRENT_USER_ID, DirectoryUser, PROJECTS, USERS, daysFromToday, userName, ymd } from '../Shared/mock-directory';

/**
 * Sprint & Agile management service (backlog, sprints, epics, reports, retrospectives).
 *
 * NOTE: OM-API me abhi Agile endpoints nahi hain, isliye ye service in-memory mock data
 * use karti hai (page refresh par reset). Method shapes TaskService / TicketService jaise hain
 * (Observable + { Status }) — API aane par sirf body ko http call se replace karna hai.
 */
@Injectable({
  providedIn: 'root'
})
export class AgileService {
  private latency = 200;

  readonly currentUserID = CURRENT_USER_ID;
  readonly statuses: IssueStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];
  readonly types: IssueType[] = ['Story', 'Bug', 'Task'];
  readonly priorities: IssuePriority[] = ['Low', 'Medium', 'High', 'Critical'];
  readonly fibonacci = [1, 2, 3, 5, 8, 13, 21];
  readonly epicColors = ['#7A3FE4', '#0043E0', '#029848', '#C77800', '#0E9AA7', '#E0401C', '#D63384', '#5B6475'];

  /** Scrum team per project (user IDs from mock-directory). */
  private teams: { [projectID: number]: number[] } = {
    1: [1, 3, 4, 5, 6], 2: [2, 4, 5, 6, 1], 4: [8, 7, 3, 1, 6], 6: [7, 3, 5, 2, 8], 7: [6, 3, 4, 8, 5],
  };

  private issues: Issue[] = [];
  private epics: Epic[] = [];
  private sprints: Sprint[] = [];
  private retroCards: RetroCard[] = [];
  private keyCounter: { [projectID: number]: number } = {};
  private nextIssueID = 1;
  private nextEpicID = 1;
  private nextSprintID = 1;
  private nextCardID = 1;
  private rnd = this.random(7);

  constructor() {
    this.seed();
  }

  // ---------------- Lookups ----------------

  getProjects() {
    return PROJECTS;
  }

  getTeam(projectID: number): DirectoryUser[] {
    const ids = this.teams[projectID] || USERS.map(u => u.ID);
    return USERS.filter(u => ids.includes(u.ID));
  }

  // ---------------- Issues ----------------

  getIssues(projectID: number, filter: IssueFilter = {}): Observable<Issue[]> {
    const search = (filter.Search || '').trim().toLowerCase();
    const rows = this.issues
      .filter(i => i.ProjectID === projectID)
      .filter(i => !filter.Type || i.Type === filter.Type)
      .filter(i => !filter.EpicID || (filter.EpicID === -1 ? !i.EpicID : i.EpicID === filter.EpicID))
      .filter(i => !filter.AssigneeID || (filter.AssigneeID === -1 ? !i.AssigneeID : i.AssigneeID === filter.AssigneeID))
      .filter(i => !search || i.Title.toLowerCase().includes(search) || i.Key.toLowerCase().includes(search))
      .sort((a, b) => a.Rank - b.Rank);
    return this.respond(rows);
  }

  getIssue(ID: number): Observable<Issue | undefined> {
    return this.respond(this.issues.find(i => i.ID === ID));
  }

  issueAddEdit(model: IssueAddEdit): Observable<{ Status: string; ID?: number }> {
    if (model.AddEdit === 'A') {
      const ranks = this.issues.filter(i => i.ProjectID === model.ProjectID).map(i => i.Rank);
      const issue = this.newIssue(model.ProjectID, model.Type, model.Title.trim(), {
        Description: model.Description || '',
        AsA: model.AsA, IWant: model.IWant, SoThat: model.SoThat,
        StoryPoints: model.StoryPoints ?? null,
        Priority: model.Priority || 'Medium',
        AssigneeID: model.AssigneeID ?? null,
        EpicID: model.EpicID ?? null,
        SprintID: model.SprintID ?? null,
        AcceptanceCriteria: (model.AcceptanceCriteria || []).filter(a => a.Text.trim()),
        Rank: (ranks.length ? Math.max(...ranks) : 0) + 10,
        CreatedOn: daysFromToday(0),
      });
      this.issues.push(issue);
      this.afterChange(issue.SprintID);
      return this.respond({ Status: 'Issue Added Successfully...', ID: issue.ID });
    }
    const i = this.issues.find(x => x.ID === model.ID);
    if (!i) return this.respond({ Status: 'Issue Not Found' });
    const oldSprint = i.SprintID;
    Object.assign(i, {
      Type: model.Type, Title: model.Title.trim(), Description: model.Description ?? i.Description,
      AsA: model.AsA ?? i.AsA, IWant: model.IWant ?? i.IWant, SoThat: model.SoThat ?? i.SoThat,
      StoryPoints: model.StoryPoints === undefined ? i.StoryPoints : model.StoryPoints,
      Priority: model.Priority || i.Priority,
      AssigneeID: model.AssigneeID === undefined ? i.AssigneeID : model.AssigneeID,
      EpicID: model.EpicID === undefined ? i.EpicID : model.EpicID,
      SprintID: model.SprintID === undefined ? i.SprintID : model.SprintID,
      AcceptanceCriteria: model.AcceptanceCriteria ? model.AcceptanceCriteria.filter(a => a.Text.trim()) : i.AcceptanceCriteria,
    });
    i.AssigneeName = userName(i.AssigneeID);
    this.afterChange(oldSprint, i.SprintID);
    return this.respond({ Status: 'Issue Updated Successfully...', ID: i.ID });
  }

  updateIssueField(ID: number, patch: Partial<Issue>): Observable<{ Status: string }> {
    const i = this.issues.find(x => x.ID === ID);
    if (!i) return this.respond({ Status: 'Issue Not Found' });
    const oldSprint = i.SprintID;
    Object.assign(i, patch);
    if ('AssigneeID' in patch) i.AssigneeName = userName(i.AssigneeID);
    if ('Status' in patch) i.CompletedOn = i.Status === 'Done' ? (i.CompletedOn || daysFromToday(0)) : null;
    this.afterChange(oldSprint, i.SprintID);
    return this.respond({ Status: 'Issue Updated Successfully...' });
  }

  deleteIssue(ID: number): Observable<{ Status: string }> {
    const i = this.issues.find(x => x.ID === ID);
    this.issues = this.issues.filter(x => x.ID !== ID);
    this.afterChange(i?.SprintID ?? null);
    return this.respond({ Status: 'Issue Deleted Successfully!' });
  }

  /** Move an issue to a sprint (or backlog when null) and place it before `beforeID` (end of list when null). */
  moveIssue(ID: number, sprintID: number | null, beforeID: number | null): Observable<{ Status: string }> {
    const i = this.issues.find(x => x.ID === ID);
    if (!i) return this.respond({ Status: 'Issue Not Found' });
    const oldSprint = i.SprintID;
    i.SprintID = sprintID;
    const section = this.issues
      .filter(x => x.ProjectID === i.ProjectID && x.SprintID === sprintID && x.ID !== ID)
      .sort((a, b) => a.Rank - b.Rank);
    const idx = beforeID ? section.findIndex(x => x.ID === beforeID) : -1;
    section.splice(idx < 0 ? section.length : idx, 0, i);
    // sections are ranked independently, so renumber the project keeping every section's own order
    const others = this.issues.filter(x => x.ProjectID === i.ProjectID && x.SprintID !== sprintID).sort((a, b) => a.Rank - b.Rank);
    [...section, ...others].forEach((x, n) => x.Rank = (n + 1) * 10);
    this.afterChange(oldSprint, sprintID);
    return this.respond({ Status: 'Issue Updated Successfully...' });
  }

  // ---------------- Sprints ----------------

  getSprints(projectID: number): Observable<Sprint[]> {
    return this.respond(this.sprints.filter(s => s.ProjectID === projectID).sort((a, b) => a.StartDate.localeCompare(b.StartDate)));
  }

  getSprint(ID: number): Observable<Sprint | undefined> {
    return this.respond(this.sprints.find(s => s.ID === ID));
  }

  updateSprint(ID: number, patch: Partial<Pick<Sprint, 'Name' | 'Goal' | 'StartDate' | 'EndDate' | 'Capacity'>>): Observable<{ Status: string }> {
    const s = this.sprints.find(x => x.ID === ID);
    if (!s) return this.respond({ Status: 'Sprint Not Found' });
    Object.assign(s, patch);
    return this.respond({ Status: 'Sprint Updated Successfully...' });
  }

  /** Creates a new planned sprint right after the last sprint of the project. */
  createSprint(projectID: number): Observable<{ Status: string; ID: number }> {
    const list = this.sprints.filter(s => s.ProjectID === projectID).sort((a, b) => a.StartDate.localeCompare(b.StartDate));
    const last = list[list.length - 1];
    const prefix = PROJECTS.find(p => p.ID === projectID)?.Prefix || 'PRJ';
    const lastNo = last ? Number(last.Name.replace(/\D+/g, ' ').trim().split(' ').pop()) || list.length : 0;
    const start = last ? this.addDays(last.EndDate, 1) : daysFromToday(0);
    const s = this.newSprint(projectID, `${prefix} Sprint ${lastNo + 1}`, '', start, this.addDays(start, 13), 'Planned');
    this.sprints.push(s);
    return this.respond({ Status: 'Sprint Added Successfully...', ID: s.ID });
  }

  startSprint(ID: number): Observable<{ Status: string }> {
    const s = this.sprints.find(x => x.ID === ID);
    if (!s) return this.respond({ Status: 'Sprint Not Found' });
    if (this.sprints.some(x => x.ProjectID === s.ProjectID && x.State === 'Active')) {
      return this.respond({ Status: 'Another sprint is already active' });
    }
    s.State = 'Active';
    const items = this.sprintIssues(s.ID);
    s.CommittedPoints = this.points(items);
    s.History = [];
    this.snapshot(s);
    return this.respond({ Status: 'Sprint Started Successfully...' });
  }

  /** Completes a sprint; unfinished issues go to `moveTo` sprint (or backlog when null). */
  completeSprint(ID: number, moveTo: number | null): Observable<{ Status: string }> {
    const s = this.sprints.find(x => x.ID === ID);
    if (!s) return this.respond({ Status: 'Sprint Not Found' });
    this.snapshot(s);
    const items = this.sprintIssues(s.ID);
    const open = items.filter(i => i.Status !== 'Done');
    s.CompletedPoints = this.points(items.filter(i => i.Status === 'Done'));
    s.CarriedOverPoints = this.points(open);
    s.State = 'Completed';
    s.EndDate = s.EndDate < daysFromToday(0) ? s.EndDate : daysFromToday(0);
    open.forEach(i => i.SprintID = moveTo);
    if (moveTo) this.afterChange(moveTo);
    return this.respond({ Status: 'Sprint Completed Successfully...' });
  }

  getSprintSummary(ID: number): SprintSummary {
    const s = this.sprints.find(x => x.ID === ID);
    const items = this.sprintIssues(ID);
    if (!s) return { Committed: 0, Completed: 0, CarriedOver: 0, ScopeChange: 0, IssueCount: 0, DoneCount: 0 };
    const scope = s.History.length ? s.History[s.History.length - 1].Scope : this.points(items);
    const completed = s.State === 'Completed' ? s.CompletedPoints : this.points(items.filter(i => i.Status === 'Done'));
    return {
      Committed: s.CommittedPoints || this.points(items),
      Completed: completed,
      CarriedOver: s.State === 'Completed' ? s.CarriedOverPoints : 0,
      ScopeChange: s.State === 'Planned' ? 0 : scope - s.CommittedPoints,
      IssueCount: items.length,
      DoneCount: items.filter(i => i.Status === 'Done').length,
    };
  }

  /** Committed vs completed for the last `count` completed sprints (oldest first). */
  getVelocity(projectID: number, count = 6): { Name: string; Committed: number; Completed: number }[] {
    return this.sprints
      .filter(s => s.ProjectID === projectID && s.State === 'Completed')
      .sort((a, b) => a.StartDate.localeCompare(b.StartDate))
      .slice(-count)
      .map(s => ({ Name: s.Name, Committed: s.CommittedPoints, Completed: s.CompletedPoints }));
  }

  // ---------------- Epics ----------------

  getEpics(projectID: number): Observable<EpicSummary[]> {
    return this.respond(this.epics.filter(e => e.ProjectID === projectID).map(e => this.epicSummary(e)));
  }

  epicAddEdit(model: Partial<Epic> & { AddEdit: 'A' | 'E'; ProjectID: number; Name: string }): Observable<{ Status: string; ID?: number }> {
    if (model.AddEdit === 'A') {
      const prefix = PROJECTS.find(p => p.ID === model.ProjectID)?.Prefix || 'PRJ';
      const e: Epic = {
        ID: this.nextEpicID++, ProjectID: model.ProjectID, Key: `${prefix}-${this.nextKey(model.ProjectID)}`, Name: model.Name.trim(),
        Description: model.Description || '', Color: model.Color || this.epicColors[0], Status: model.Status || 'To Do',
        OwnerID: model.OwnerID ?? null, StartDate: model.StartDate || daysFromToday(0), TargetDate: model.TargetDate || daysFromToday(60),
      };
      this.epics.push(e);
      return this.respond({ Status: 'Epic Added Successfully...', ID: e.ID });
    }
    const e = this.epics.find(x => x.ID === model.ID);
    if (!e) return this.respond({ Status: 'Epic Not Found' });
    Object.assign(e, {
      Name: model.Name.trim(), Description: model.Description ?? e.Description, Color: model.Color || e.Color,
      Status: model.Status || e.Status, OwnerID: model.OwnerID === undefined ? e.OwnerID : model.OwnerID,
      StartDate: model.StartDate || e.StartDate, TargetDate: model.TargetDate || e.TargetDate,
    });
    return this.respond({ Status: 'Epic Updated Successfully...', ID: e.ID });
  }

  deleteEpic(ID: number): Observable<{ Status: string }> {
    this.epics = this.epics.filter(e => e.ID !== ID);
    this.issues.filter(i => i.EpicID === ID).forEach(i => i.EpicID = null);
    return this.respond({ Status: 'Epic Deleted Successfully!' });
  }

  // ---------------- Retrospective ----------------

  getRetroCards(sprintID: number): Observable<RetroCard[]> {
    return this.respond(this.retroCards.filter(c => c.SprintID === sprintID));
  }

  /** Action items of retros held before the given sprint (follow-up list). */
  getPreviousActionItems(projectID: number, beforeSprintID: number): Observable<(RetroCard & { SprintName: string })[]> {
    const current = this.sprints.find(s => s.ID === beforeSprintID);
    const earlier = this.sprints.filter(s => s.ProjectID === projectID && s.State === 'Completed' && (!current || s.StartDate < current.StartDate));
    return this.respond(this.retroCards
      .filter(c => c.Column === 'Action' && earlier.some(s => s.ID === c.SprintID))
      .map(c => ({ ...c, SprintName: earlier.find(s => s.ID === c.SprintID)!.Name }))
      .sort((a, b) => Number(a.Done) - Number(b.Done) || (a.DueDate || '').localeCompare(b.DueDate || '')));
  }

  retroCardAdd(model: { SprintID: number; Column: RetroColumn; Text: string; OwnerID?: number | null; DueDate?: string | null }): Observable<{ Status: string }> {
    this.retroCards.push({
      ID: this.nextCardID++, SprintID: model.SprintID, Column: model.Column, Text: model.Text.trim(), AuthorID: this.currentUserID,
      Votes: [], OwnerID: model.OwnerID ?? null, DueDate: model.DueDate ?? null, Done: false, CreatedOn: daysFromToday(0),
    });
    return this.respond({ Status: 'Card Added Successfully...' });
  }

  retroCardUpdate(ID: number, patch: Partial<Pick<RetroCard, 'Text' | 'OwnerID' | 'DueDate' | 'Done'>>): Observable<{ Status: string }> {
    const c = this.retroCards.find(x => x.ID === ID);
    if (c) Object.assign(c, patch);
    return this.respond({ Status: 'Card Updated Successfully...' });
  }

  retroVote(ID: number): Observable<{ Status: string }> {
    const c = this.retroCards.find(x => x.ID === ID);
    if (c) {
      c.Votes = c.Votes.includes(this.currentUserID) ? c.Votes.filter(v => v !== this.currentUserID) : [...c.Votes, this.currentUserID];
    }
    return this.respond({ Status: 'Vote Updated Successfully...' });
  }

  retroCardDelete(ID: number): Observable<{ Status: string }> {
    this.retroCards = this.retroCards.filter(c => c.ID !== ID);
    return this.respond({ Status: 'Card Deleted Successfully!' });
  }

  // ---------------- helpers ----------------

  points(items: Issue[]): number {
    return items.reduce((s, i) => s + (i.StoryPoints || 0), 0);
  }

  private sprintIssues(sprintID: number): Issue[] {
    return this.issues.filter(i => i.SprintID === sprintID);
  }

  private epicSummary(e: Epic): EpicSummary {
    const items = this.issues.filter(i => i.EpicID === e.ID);
    const done = items.filter(i => i.Status === 'Done');
    const total = this.points(items), donePts = this.points(done);
    return {
      ...e, OwnerName: userName(e.OwnerID), StoryCount: items.length, DoneCount: done.length,
      TotalPoints: total, DonePoints: donePts, Progress: total ? Math.round(donePts / total * 100) : 0,
    };
  }

  /** keep today's history point of active sprints in sync with the issues */
  private afterChange(...sprintIDs: (number | null)[]) {
    sprintIDs.forEach(ID => {
      const s = this.sprints.find(x => x.ID === ID);
      if (s && s.State === 'Active') this.snapshot(s);
    });
  }

  private snapshot(s: Sprint) {
    const items = this.sprintIssues(s.ID);
    const by = (st: IssueStatus) => this.points(items.filter(i => i.Status === st));
    const today = daysFromToday(0);
    const day: SprintDay = {
      Date: today, Scope: this.points(items), ToDo: by('To Do'), InProgress: by('In Progress'), InReview: by('In Review'), Done: by('Done'),
    };
    const idx = s.History.findIndex(h => h.Date === today);
    if (idx >= 0) s.History[idx] = day; else s.History.push(day);
  }

  private nextKey(projectID: number): number {
    this.keyCounter[projectID] = (this.keyCounter[projectID] || 100) + 1;
    return this.keyCounter[projectID];
  }

  private newIssue(projectID: number, type: IssueType, title: string, extra: Partial<Issue>): Issue {
    const prefix = PROJECTS.find(p => p.ID === projectID)?.Prefix || 'PRJ';
    const issue: Issue = {
      ID: this.nextIssueID++, ProjectID: projectID, Key: `${prefix}-${this.nextKey(projectID)}`, Type: type, Title: title,
      Description: '', StoryPoints: null, Priority: 'Medium', AssigneeID: null, AssigneeName: '', Status: 'To Do',
      EpicID: null, SprintID: null, Rank: 0, AcceptanceCriteria: [], CreatedOn: daysFromToday(0), CompletedOn: null,
      ...extra,
    };
    issue.AssigneeName = userName(issue.AssigneeID);
    return issue;
  }

  private newSprint(projectID: number, name: string, goal: string, start: string, end: string, state: Sprint['State']): Sprint {
    const capacity: SprintCapacity[] = this.getTeam(projectID).map(u => ({
      UserID: u.ID, AvailableHours: Math.round(u.WeeklyCapacityHours * 2 * 0.8), FocusFactor: 10,
    }));
    return {
      ID: this.nextSprintID++, ProjectID: projectID, Name: name, Goal: goal, StartDate: start, EndDate: end, State: state,
      CommittedPoints: 0, CompletedPoints: 0, CarriedOverPoints: 0, Capacity: capacity, History: [],
    };
  }

  private addDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  private random(seed: number) {
    let a = seed;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  private pick<T>(list: T[]): T {
    return list[Math.floor(this.rnd() * list.length)];
  }

  private respond<T>(value: T): Observable<T> {
    return of(JSON.parse(JSON.stringify(value ?? null)) as T).pipe(delay(this.latency));
  }

  // ---------------- seed ----------------

  private seed() {
    const epicPool: { Name: string; Description: string }[] = [
      { Name: 'User Onboarding', Description: 'Sign-up, invitations and first-run experience.' },
      { Name: 'Reporting & Dashboards', Description: 'Operational dashboards, exports and scheduled reports.' },
      { Name: 'Notifications', Description: 'Email, in-app and push notifications with preferences.' },
      { Name: 'Performance & Stability', Description: 'Page speed, error budgets and monitoring.' },
      { Name: 'Integrations', Description: 'Third-party connectors, webhooks and public API.' },
      { Name: 'Security & Access', Description: 'Roles, permissions, SSO and audit trail.' },
      { Name: 'Mobile Experience', Description: 'Responsive layouts and offline support.' },
      { Name: 'Billing & Payments', Description: 'Invoices, payment gateway and plan upgrades.' },
    ];

    const pool: { Type: IssueType; Title: string; AsA?: string; IWant?: string; SoThat?: string }[] = [
      { Type: 'Story', Title: 'Login with Microsoft SSO', AsA: 'employee', IWant: 'to sign in with my Microsoft account', SoThat: 'I do not need another password' },
      { Type: 'Story', Title: 'Invite team members by email', AsA: 'workspace admin', IWant: 'to invite colleagues by email', SoThat: 'they can join quickly' },
      { Type: 'Story', Title: 'Dashboard KPI tiles with date range', AsA: 'manager', IWant: 'to filter KPI tiles by date range', SoThat: 'I can compare periods' },
      { Type: 'Story', Title: 'Export report to Excel', AsA: 'analyst', IWant: 'to export any report to Excel', SoThat: 'I can share it offline' },
      { Type: 'Story', Title: 'Notification preferences page', AsA: 'user', IWant: 'to choose which notifications I receive', SoThat: 'I am not spammed' },
      { Type: 'Story', Title: 'Global search across records', AsA: 'user', IWant: 'one search box for all records', SoThat: 'I find things faster' },
      { Type: 'Story', Title: 'Role based access for reports', AsA: 'admin', IWant: 'to restrict reports by role', SoThat: 'sensitive data stays private' },
      { Type: 'Story', Title: 'Audit trail for record changes', AsA: 'compliance officer', IWant: 'to see who changed what and when', SoThat: 'audits are easy' },
      { Type: 'Story', Title: 'Webhook on record created', AsA: 'integrator', IWant: 'a webhook when a record is created', SoThat: 'external systems stay in sync' },
      { Type: 'Story', Title: 'Bulk import from CSV', AsA: 'admin', IWant: 'to import records from a CSV file', SoThat: 'migration is quick' },
      { Type: 'Story', Title: 'Offline mode for field users', AsA: 'field user', IWant: 'to keep working without network', SoThat: 'data is not lost' },
      { Type: 'Story', Title: 'Saved filters on list pages', AsA: 'user', IWant: 'to save my list filters', SoThat: 'I do not rebuild them every day' },
      { Type: 'Story', Title: 'Scheduled email digest', AsA: 'manager', IWant: 'a weekly digest email', SoThat: 'I stay informed' },
      { Type: 'Story', Title: 'Online payment via gateway', AsA: 'customer', IWant: 'to pay invoices online', SoThat: 'payments are faster' },
      { Type: 'Story', Title: 'Dark mode toggle', AsA: 'user', IWant: 'a dark theme', SoThat: 'it is easier on the eyes' },
      { Type: 'Story', Title: 'Activity timeline on detail page', AsA: 'user', IWant: 'to see an activity timeline', SoThat: 'I know the history' },
      { Type: 'Story', Title: 'Two-factor authentication', AsA: 'security admin', IWant: 'to enforce 2FA', SoThat: 'accounts are protected' },
      { Type: 'Story', Title: 'Public REST API with keys', AsA: 'developer', IWant: 'API keys for the REST API', SoThat: 'I can automate tasks' },
      { Type: 'Story', Title: 'Push notifications on mobile', AsA: 'mobile user', IWant: 'push notifications', SoThat: 'I react quickly' },
      { Type: 'Story', Title: 'Plan upgrade flow', AsA: 'account owner', IWant: 'to upgrade my plan in-app', SoThat: 'I unlock features' },
      { Type: 'Bug', Title: 'Session expires while typing long forms' },
      { Type: 'Bug', Title: 'Date picker shows wrong timezone' },
      { Type: 'Bug', Title: 'Excel export misses last row' },
      { Type: 'Bug', Title: 'Dashboard chart flickers on resize' },
      { Type: 'Bug', Title: 'Duplicate email on password reset' },
      { Type: 'Bug', Title: 'Search ignores accented characters' },
      { Type: 'Bug', Title: 'Avatar upload fails for PNG over 2 MB' },
      { Type: 'Bug', Title: 'Pagination resets after editing a row' },
      { Type: 'Bug', Title: 'Mobile menu overlaps header on iOS' },
      { Type: 'Bug', Title: 'Invoice total rounding off by 0.01' },
      { Type: 'Task', Title: 'Upgrade Angular and dependencies' },
      { Type: 'Task', Title: 'Set up staging CI/CD pipeline' },
      { Type: 'Task', Title: 'Add API integration tests' },
      { Type: 'Task', Title: 'Write runbook for on-call' },
      { Type: 'Task', Title: 'Configure application monitoring alerts' },
      { Type: 'Task', Title: 'Database index review' },
      { Type: 'Task', Title: 'Design review of new navigation' },
      { Type: 'Task', Title: 'Security scan and dependency audit' },
      { Type: 'Task', Title: 'Load test checkout endpoints' },
      { Type: 'Task', Title: 'Clean up feature flags' },
    ];

    const goals = [
      'Ship the onboarding flow end-to-end',
      'Stabilise reporting and fix top customer bugs',
      'Deliver notification preferences and digest',
      'Release integrations beta to pilot customers',
      'Harden security and finish audit trail',
    ];
    const retroWell = ['Great collaboration between QA and devs', 'Daily stand-ups stayed under 15 minutes', 'Demo went smoothly with stakeholders',
      'Pairing on tricky bugs helped a lot', 'CI pipeline was green most of the sprint', 'Clear acceptance criteria on stories'];
    const retroImprove = ['Stories entered the sprint without designs', 'Too many unplanned support requests', 'Code reviews waited more than a day',
      'Estimates were too optimistic for API work', 'Staging environment was down twice'];
    const retroActions = ['Add "design ready" to Definition of Ready', 'Rotate a support shield person each sprint', 'Set a 4h SLA for code reviews',
      'Spike before estimating integration stories', 'Automate staging health check'];

    PROJECTS.forEach((p, pi) => {
      const team = this.teams[p.ID] || [1, 2, 3];
      let rank = 10;
      const nextRank = () => (rank += 10);

      // epics
      const epics: Epic[] = [0, 1, 2, 3].map(n => {
        const t = epicPool[(pi * 2 + n) % epicPool.length];
        const status: EpicStatus = n === 0 ? 'Done' : n === 3 ? 'To Do' : 'In Progress';
        return {
          ID: this.nextEpicID++, ProjectID: p.ID, Key: `${p.Prefix}-${this.nextKey(p.ID)}`, Name: t.Name, Description: t.Description,
          Color: this.epicColors[(pi + n) % this.epicColors.length], Status: status, OwnerID: team[n % team.length],
          StartDate: daysFromToday(-60 + n * 14), TargetDate: daysFromToday(n === 0 ? -6 : 20 + n * 18),
        };
      });
      this.epics.push(...epics);

      // sprints
      const base = 18 + pi * 3;
      const sprintDefs: { off: number; state: Sprint['State'] }[] = [
        { off: -46, state: 'Completed' }, { off: -32, state: 'Completed' }, { off: -18, state: 'Completed' },
        { off: -4, state: 'Active' }, { off: 10, state: 'Planned' },
      ];
      const sprints = sprintDefs.map((d, n) =>
        this.newSprint(p.ID, `${p.Prefix} Sprint ${base + n}`, goals[(pi + n) % goals.length], daysFromToday(d.off), daysFromToday(d.off + 13), d.state));
      sprints[4].Goal = '';
      this.sprints.push(...sprints);

      let poolIdx = pi * 7;
      const nextTemplate = () => pool[(poolIdx++) % pool.length];
      const make = (sprint: Sprint | null, status: IssueStatus, opts: { points?: boolean; assignee?: boolean; epic?: boolean; created?: string; done?: string } = {}) => {
        const t = nextTemplate();
        const epic = opts.epic === false ? null : (t.Type === 'Task' && this.rnd() < 0.5 ? null : this.pick(epics).ID);
        const points = opts.points === false ? null : this.pick(t.Type === 'Bug' ? [1, 2, 3] : [1, 2, 3, 3, 5, 5, 8, 13]);
        const criteria: AcceptanceItem[] = t.Type === 'Story'
          ? [{ Text: 'Happy path works as described', Done: status === 'Done' },
             { Text: 'Validation messages are shown for invalid input', Done: status === 'Done' },
             { Text: 'Covered by automated tests', Done: status === 'Done' && this.rnd() < 0.8 }]
          : t.Type === 'Bug' ? [{ Text: 'Issue no longer reproducible', Done: status === 'Done' }, { Text: 'Regression test added', Done: status === 'Done' }] : [];
        const description = t.Type === 'Story'
          ? `As a ${t.AsA}, I want ${t.IWant}, so that ${t.SoThat}.`
          : t.Type === 'Bug' ? `Steps to reproduce are attached in the support ticket. Affects ${p.Name}.` : `Technical task for ${p.Name}.`;
        const issue = this.newIssue(p.ID, t.Type, t.Title, {
          Description: description, AsA: t.AsA, IWant: t.IWant, SoThat: t.SoThat,
          StoryPoints: points, Priority: this.pick<IssuePriority>(t.Type === 'Bug' ? ['High', 'Critical', 'Medium'] : ['Low', 'Medium', 'Medium', 'High']),
          AssigneeID: opts.assignee === false ? null : this.pick(team), Status: status, EpicID: epic, SprintID: sprint?.ID ?? null,
          Rank: nextRank(), AcceptanceCriteria: criteria, CreatedOn: opts.created || daysFromToday(-50 + Math.floor(this.rnd() * 40)),
          CompletedOn: status === 'Done' ? (opts.done || daysFromToday(-1)) : null,
        });
        this.issues.push(issue);
        return issue;
      };

      // completed sprints: all items done, synthetic carry-over and scope change
      sprints.slice(0, 3).forEach((s, n) => {
        const count = 6 + Math.floor(this.rnd() * 3);
        const items: Issue[] = [];
        for (let k = 0; k < count; k++) {
          items.push(make(s, 'Done', { created: this.addDays(s.StartDate, -10), done: this.addDays(s.StartDate, 2 + Math.floor(this.rnd() * 11)) }));
        }
        const done = this.points(items);
        const carried = [3, 5, 2][(n + pi) % 3];
        const scopeChange = [0, 3, 2][(n + pi * 2) % 3];
        s.CompletedPoints = done;
        s.CarriedOverPoints = carried;
        s.CommittedPoints = done + carried - scopeChange;
        s.History = this.syntheticHistory(s.StartDate, 14, s.CommittedPoints, scopeChange, done);
      });

      // active sprint
      const active = sprints[3];
      const statusMix: IssueStatus[] = ['Done', 'Done', 'Done', 'In Review', 'In Review', 'In Progress', 'In Progress', 'To Do', 'To Do', 'To Do'];
      statusMix.forEach(st => make(active, st, { created: this.addDays(active.StartDate, -6), done: daysFromToday(-Math.floor(this.rnd() * 4)) }));
      const items = this.sprintIssues(active.ID);
      const scopeAdded = items[items.length - 1].StoryPoints || 0;      // last item was added after start
      items[items.length - 1].CreatedOn = daysFromToday(-2);
      active.CommittedPoints = this.points(items) - scopeAdded;
      const doneNow = this.points(items.filter(i => i.Status === 'Done'));
      active.History = this.syntheticHistory(active.StartDate, 4, active.CommittedPoints, scopeAdded, doneNow, 2);
      this.snapshot(active);

      // planned sprint (pre-planned items)
      for (let k = 0; k < 4; k++) make(sprints[4], 'To Do');

      // product backlog (~20 items, some not refined yet)
      for (let k = 0; k < 20; k++) {
        make(null, 'To Do', { points: k < 14, assignee: k % 3 !== 2, epic: k % 5 !== 4 });
      }

      // retrospectives for completed sprints
      sprints.slice(0, 3).forEach((s, n) => {
        const add = (Column: RetroColumn, Text: string, extra: Partial<RetroCard> = {}) => this.retroCards.push({
          ID: this.nextCardID++, SprintID: s.ID, Column, Text, AuthorID: this.pick(team),
          Votes: team.filter(() => this.rnd() < 0.45), OwnerID: null, DueDate: null, Done: false, CreatedOn: s.EndDate, ...extra,
        });
        for (let k = 0; k < 4; k++) add('Well', retroWell[(n + k + pi) % retroWell.length]);
        for (let k = 0; k < 3; k++) add('Improve', retroImprove[(n + k + pi) % retroImprove.length]);
        for (let k = 0; k < 2; k++) {
          add('Action', retroActions[(n * 2 + k + pi) % retroActions.length], {
            OwnerID: this.pick(team), DueDate: this.addDays(s.EndDate, 7 + k * 4), Done: n < 2 && (k === 0 || n === 0),
          });
        }
      });
    });
  }

  /**
   * Plausible daily history: `days` entries from `start`; scope grows by `scopeChange` on `changeDay`;
   * done points follow an S-curve towards `finalDone`.
   */
  private syntheticHistory(start: string, days: number, committed: number, scopeChange: number, finalDone: number, changeDay = 3): SprintDay[] {
    const out: SprintDay[] = [];
    for (let i = 0; i < days; i++) {
      const frac = days === 1 ? 1 : i / (days - 1);
      const scope = committed + (i >= changeDay ? scopeChange : 0);
      const curve = frac < 0.15 ? 0 : Math.pow((frac - 0.15) / 0.85, 1.3);
      const done = Math.min(scope, Math.round(finalDone * curve));
      const open = scope - done;
      const inProgress = Math.round(open * 0.35 * Math.min(1, frac * 4 + 0.2));
      const inReview = Math.round(open * 0.2 * Math.min(1, frac * 3));
      out.push({ Date: this.addDays(start, i), Scope: scope, ToDo: open - inProgress - inReview, InProgress: inProgress, InReview: inReview, Done: done });
    }
    return out;
  }
}
