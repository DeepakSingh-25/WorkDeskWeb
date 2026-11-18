import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from '../../Interface/project';
import {
  ActivityType, Subtask, Task, TaskActivity, TaskAttachment, TaskComment, TaskDependency, TaskStatus, Worklog
} from '../../Interface/task';

export interface TaskFilter {
  ProjectID?: number | null;
  Status?: string;
  Priority?: string;
  AssigneeID?: number | null;
  Search?: string;
  DueFrom?: string;
  DueTo?: string;
}

/**
 * Task management service.
 *
 * NOTE: OM-API me abhi Task endpoints nahi hain, isliye ye service in-memory mock data
 * use karti hai (page refresh par reset). Method shapes TicketService jaise hain
 * (Result / FilterRecords / Status) — API aane par sirf body ko http call se replace karna hai.
 */
@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private baseUrl = environment.baseUrl;
  private latency = 200;

  /** Logged-in user. Replace with the real profile once auth exposes it. */
  readonly currentUser = { ID: 1, Name: 'Aarav Sharma' };

  readonly statuses: TaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];

  private projects = [
    { ID: 1, Name: 'CRM Portal Revamp', Prefix: 'CRM' },
    { ID: 2, Name: 'HRMS Mobile App', Prefix: 'HRM' },
    { ID: 4, Name: 'Data Warehouse Setup', Prefix: 'DWH' },
    { ID: 6, Name: 'Network Monitoring (NMS)', Prefix: 'NMS' },
    { ID: 7, Name: 'Sales Desk Automation', Prefix: 'SDA' },
  ];

  private users = [
    { ID: 1, Name: 'Aarav Sharma' }, { ID: 2, Name: 'Priya Verma' }, { ID: 3, Name: 'Rohit Mehta' },
    { ID: 4, Name: 'Sneha Iyer' }, { ID: 5, Name: 'Karan Patel' }, { ID: 6, Name: 'Neha Gupta' },
    { ID: 7, Name: 'Vikram Singh' }, { ID: 8, Name: 'Ananya Rao' },
  ];

  private tasks: Task[] = [];
  private subtasks: Subtask[] = [];
  private dependencies: TaskDependency[] = [];
  private comments: TaskComment[] = [];
  private attachments: TaskAttachment[] = [];
  private worklogs: Worklog[] = [];
  private activities: TaskActivity[] = [];
  private timers: { [taskId: number]: number } = {};   // running timer start (ms)

  constructor(private http: HttpClient) {
    this.seed();
  }

  // ---------------- Lookups ----------------

  getProjectOptions(): Observable<{ ID: number; Name: string }[]> {
    return this.respond(this.projects.map(p => ({ ID: p.ID, Name: p.Name })));
  }

  getUserOptions(): Observable<{ ID: number; Name: string }[]> {
    return this.respond(this.users.map(u => ({ ...u })));
  }

  getLabelOptions(): Observable<string[]> {
    return this.respond(Array.from(new Set(['Frontend', 'Backend', 'API', 'Bug', 'UI', 'Testing', 'DevOps', 'Docs',
      ...this.tasks.flatMap(t => t.Labels)])).sort());
  }

  // ---------------- Tasks ----------------

  getPaginatedTaskList(startIndex: number, length: number, sortColumn: string, sortColumnDir: string,
    filter: TaskFilter): Observable<PagedResult<Task>> {
    let rows = this.filterTasks(filter);
    rows = [...rows].sort((a: any, b: any) => {
      const x = a[sortColumn], y = b[sortColumn];
      let r: number;
      if (sortColumn === 'Priority') r = this.priorityRank(a.Priority) - this.priorityRank(b.Priority);
      else if (sortColumn === 'Status') r = this.statuses.indexOf(a.Status) - this.statuses.indexOf(b.Status);
      else r = typeof x === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
      return sortColumnDir === 'desc' ? -r : r;
    });
    return this.respond({ Result: rows.slice(startIndex, startIndex + length).map(t => this.decorate(t)), FilterRecords: rows.length });
  }

  getTasks(filter: TaskFilter): Observable<Task[]> {
    return this.respond(this.filterTasks(filter).map(t => this.decorate(t)));
  }

  getStatusCounts(filter: TaskFilter): Observable<{ [status: string]: number }> {
    const rows = this.filterTasks({ ...filter, Status: '' });
    const counts: { [s: string]: number } = { All: rows.length };
    this.statuses.forEach(s => counts[s] = rows.filter(t => t.Status === s).length);
    counts['Overdue'] = rows.filter(t => t.Status !== 'Done' && t.DueDate < this.today()).length;
    return this.respond(counts);
  }

  getTaskByID(ID: number): Observable<Task | undefined> {
    const t = this.tasks.find(x => x.ID === Number(ID));
    return this.respond(t ? this.decorate(t) : undefined);
  }

  taskAddEdit(data: Partial<Task> & { AddEdit: 'A' | 'E'; Subtasks?: string[] }): Observable<any> {
    const project = this.projects.find(p => p.ID === data.ProjectID);
    const assignee = this.users.find(u => u.ID === data.AssigneeID);
    const now = new Date().toISOString();

    if (data.AddEdit === 'A') {
      const ID = Math.max(0, ...this.tasks.map(t => t.ID)) + 1;
      const seq = this.tasks.filter(t => t.ProjectID === data.ProjectID).length + 1;
      const task: Task = {
        ID, Key: `${project?.Prefix || 'TSK'}-${seq}`, ProjectID: data.ProjectID!, ProjectName: project?.Name || '',
        Title: data.Title!, Description: data.Description || '', Status: data.Status || 'To Do',
        Priority: data.Priority || 'Medium', AssigneeID: data.AssigneeID ?? null, AssigneeName: assignee?.Name || '',
        ReporterName: this.currentUser.Name, StartDate: data.StartDate || '', DueDate: data.DueDate || '',
        EstimateHours: Number(data.EstimateHours) || 0, Labels: data.Labels || [], CreatedOn: now, UpdatedOn: now
      };
      this.tasks.unshift(task);
      this.log(ID, 'created', 'created this task');
      (data.Subtasks || []).filter(s => s.trim()).forEach(s => this.addSubtaskInternal(ID, s.trim()));
      return this.respond({ Status: 'Task Added Successfully...', ID });
    }

    const t = this.tasks.find(x => x.ID === data.ID);
    if (!t) return this.respond({ Status: 'Task Not Found' });
    if (t.Status !== data.Status) this.log(t.ID, 'status', `changed status from ${t.Status} to ${data.Status}`);
    if (t.AssigneeID !== (data.AssigneeID ?? null)) this.log(t.ID, 'assignee', assignee ? `assigned to ${assignee.Name}` : 'removed the assignee');
    const changed = (['Title', 'Description', 'Priority', 'StartDate', 'DueDate', 'EstimateHours'] as const)
      .filter(k => String((t as any)[k] ?? '') !== String((data as any)[k] ?? ''));
    if (changed.length) this.log(t.ID, 'updated', `updated ${changed.map(c => c.replace(/([A-Z])/g, ' $1').trim().toLowerCase()).join(', ')}`);
    if (data.ProjectID !== t.ProjectID) {
      t.ProjectID = data.ProjectID!;
      t.ProjectName = project?.Name || '';
    }
    Object.assign(t, {
      Title: data.Title, Description: data.Description || '', Status: data.Status, Priority: data.Priority,
      AssigneeID: data.AssigneeID ?? null, AssigneeName: assignee?.Name || '', StartDate: data.StartDate || '',
      DueDate: data.DueDate || '', EstimateHours: Number(data.EstimateHours) || 0, Labels: data.Labels || [], UpdatedOn: now
    });
    return this.respond({ Status: 'Task Updated Successfully...', ID: t.ID });
  }

  /** Partial quick update used by board drag/drop, calendar reschedule and inline drawer edits. */
  updateTaskField(ID: number, changes: Partial<Pick<Task, 'Status' | 'Priority' | 'AssigneeID' | 'DueDate' | 'StartDate' | 'Title'>>): Observable<any> {
    const t = this.tasks.find(x => x.ID === ID);
    if (!t) return this.respond({ Status: 'Task Not Found' });
    if (changes.Status && changes.Status !== t.Status) this.log(ID, 'status', `changed status from ${t.Status} to ${changes.Status}`);
    if (changes.Priority && changes.Priority !== t.Priority) this.log(ID, 'updated', `changed priority to ${changes.Priority}`);
    if (changes.DueDate !== undefined && changes.DueDate !== t.DueDate) this.log(ID, 'updated', `changed due date to ${changes.DueDate || 'none'}`);
    if (changes.Title && changes.Title !== t.Title) this.log(ID, 'updated', 'renamed the task');
    if (changes.AssigneeID !== undefined && changes.AssigneeID !== t.AssigneeID) {
      const u = this.users.find(x => x.ID === changes.AssigneeID);
      t.AssigneeName = u?.Name || '';
      this.log(ID, 'assignee', u ? `assigned to ${u.Name}` : 'removed the assignee');
    }
    Object.assign(t, changes, { UpdatedOn: new Date().toISOString() });
    return this.respond({ Status: 'Task Updated Successfully...' });
  }

  deleteTask(ID: number): Observable<any> {
    this.tasks = this.tasks.filter(t => t.ID !== ID);
    this.subtasks = this.subtasks.filter(s => s.TaskID !== ID);
    this.dependencies = this.dependencies.filter(d => d.TaskID !== ID && d.DependsOnID !== ID);
    this.comments = this.comments.filter(c => c.TaskID !== ID);
    this.attachments = this.attachments.filter(a => a.TaskID !== ID);
    this.worklogs = this.worklogs.filter(w => w.TaskID !== ID);
    this.activities = this.activities.filter(a => a.TaskID !== ID);
    delete this.timers[ID];
    return this.respond({ Status: 'Task Deleted Successfully!' });
  }

  // ---------------- Subtasks ----------------

  getSubtasks(TaskID: number): Observable<Subtask[]> {
    return this.respond(this.subtasks.filter(s => s.TaskID === TaskID).map(s => ({ ...s })));
  }

  addSubtask(TaskID: number, Title: string): Observable<any> {
    this.addSubtaskInternal(TaskID, Title);
    this.log(TaskID, 'subtask', `added subtask “${Title}”`);
    return this.respond({ Status: 'Subtask Added Successfully...' });
  }

  toggleSubtask(ID: number): Observable<any> {
    const s = this.subtasks.find(x => x.ID === ID);
    if (s) {
      s.Done = !s.Done;
      this.log(s.TaskID, 'subtask', `${s.Done ? 'completed' : 'reopened'} subtask “${s.Title}”`);
    }
    return this.respond({ Status: 'Subtask Updated Successfully...' });
  }

  deleteSubtask(ID: number): Observable<any> {
    const s = this.subtasks.find(x => x.ID === ID);
    this.subtasks = this.subtasks.filter(x => x.ID !== ID);
    if (s) this.log(s.TaskID, 'subtask', `removed subtask “${s.Title}”`);
    return this.respond({ Status: 'Subtask Deleted Successfully!' });
  }

  // ---------------- Dependencies ----------------

  /** blockedBy = tasks this task waits on, blocking = tasks waiting on this one */
  getDependencies(TaskID: number): Observable<{ blockedBy: Task[]; blocking: Task[] }> {
    const blockedBy = this.dependencies.filter(d => d.TaskID === TaskID)
      .map(d => this.tasks.find(t => t.ID === d.DependsOnID)).filter(Boolean).map(t => this.decorate(t!));
    const blocking = this.dependencies.filter(d => d.DependsOnID === TaskID)
      .map(d => this.tasks.find(t => t.ID === d.TaskID)).filter(Boolean).map(t => this.decorate(t!));
    return this.respond({ blockedBy, blocking });
  }

  addDependency(TaskID: number, DependsOnID: number): Observable<any> {
    if (TaskID === DependsOnID) return this.respond({ Status: 'A task cannot depend on itself.' });
    if (this.dependencies.some(d => d.TaskID === TaskID && d.DependsOnID === DependsOnID)) {
      return this.respond({ Status: 'Dependency already exists.' });
    }
    if (this.reaches(DependsOnID, TaskID)) return this.respond({ Status: 'This would create a circular dependency.' });
    const ID = Math.max(0, ...this.dependencies.map(d => d.ID)) + 1;
    this.dependencies.push({ ID, TaskID, DependsOnID });
    const other = this.tasks.find(t => t.ID === DependsOnID);
    this.log(TaskID, 'dependency', `marked as blocked by ${other?.Key}`);
    return this.respond({ Status: 'Dependency Added Successfully...' });
  }

  removeDependency(TaskID: number, DependsOnID: number): Observable<any> {
    this.dependencies = this.dependencies.filter(d => !(d.TaskID === TaskID && d.DependsOnID === DependsOnID));
    const other = this.tasks.find(t => t.ID === DependsOnID);
    this.log(TaskID, 'dependency', `removed dependency on ${other?.Key}`);
    return this.respond({ Status: 'Dependency Removed Successfully!' });
  }

  // ---------------- Comments ----------------

  getComments(TaskID: number): Observable<TaskComment[]> {
    return this.respond(this.comments.filter(c => c.TaskID === TaskID)
      .sort((a, b) => a.CreatedOn.localeCompare(b.CreatedOn)).map(c => ({ ...c, Mentions: [...c.Mentions] })));
  }

  commentAddEdit(data: { ID: number; TaskID: number; Text: string }): Observable<any> {
    const mentions = this.users.map(u => u.Name).filter(n => data.Text.includes('@' + n));
    if (data.ID) {
      const c = this.comments.find(x => x.ID === data.ID);
      if (!c) return this.respond({ Status: 'Comment Not Found' });
      Object.assign(c, { Text: data.Text, Mentions: mentions, EditedOn: new Date().toISOString() });
      return this.respond({ Status: 'Comment Updated Successfully...' });
    }
    const ID = Math.max(0, ...this.comments.map(c => c.ID)) + 1;
    this.comments.push({ ID, TaskID: data.TaskID, UserName: this.currentUser.Name, Text: data.Text, Mentions: mentions, CreatedOn: new Date().toISOString() });
    this.log(data.TaskID, 'comment', mentions.length ? `commented and mentioned ${mentions.join(', ')}` : 'added a comment');
    return this.respond({ Status: 'Comment Added Successfully...' });
  }

  deleteComment(ID: number): Observable<any> {
    const c = this.comments.find(x => x.ID === ID);
    this.comments = this.comments.filter(x => x.ID !== ID);
    if (c) this.log(c.TaskID, 'comment', 'deleted a comment');
    return this.respond({ Status: 'Comment Deleted Successfully!' });
  }

  // ---------------- Attachments ----------------

  getAttachments(TaskID: number): Observable<TaskAttachment[]> {
    return this.respond(this.attachments.filter(a => a.TaskID === TaskID).map(a => ({ ...a })));
  }

  uploadAttachments(TaskID: number, files: File[]): Observable<any> {
    files.forEach(f => {
      const ID = Math.max(0, ...this.attachments.map(a => a.ID)) + 1;
      this.attachments.push({
        ID, TaskID, FileName: f.name, FileSize: f.size, FileType: f.type || 'application/octet-stream',
        UploadedBy: this.currentUser.Name, UploadedOn: new Date().toISOString(), Url: URL.createObjectURL(f)
      });
      this.log(TaskID, 'attachment', `attached ${f.name}`);
    });
    return this.respond({ Status: files.length > 1 ? `${files.length} Files Uploaded Successfully...` : 'File Uploaded Successfully...' });
  }

  deleteAttachment(ID: number): Observable<any> {
    const a = this.attachments.find(x => x.ID === ID);
    if (a?.Url) URL.revokeObjectURL(a.Url);
    this.attachments = this.attachments.filter(x => x.ID !== ID);
    if (a) this.log(a.TaskID, 'attachment', `removed ${a.FileName}`);
    return this.respond({ Status: 'Attachment Deleted Successfully!' });
  }

  // ---------------- Worklogs / timer ----------------

  getWorklogs(TaskID: number): Observable<Worklog[]> {
    return this.respond(this.worklogs.filter(w => w.TaskID === TaskID)
      .sort((a, b) => (b.WorkDate + b.CreatedOn).localeCompare(a.WorkDate + a.CreatedOn)).map(w => ({ ...w })));
  }

  worklogAddEdit(data: { ID: number; TaskID: number; WorkDate: string; Minutes: number; Note: string }): Observable<any> {
    if (data.ID) {
      const w = this.worklogs.find(x => x.ID === data.ID);
      if (!w) return this.respond({ Status: 'Worklog Not Found' });
      Object.assign(w, { WorkDate: data.WorkDate, Minutes: data.Minutes, Note: data.Note });
      return this.respond({ Status: 'Worklog Updated Successfully...' });
    }
    const ID = Math.max(0, ...this.worklogs.map(w => w.ID)) + 1;
    this.worklogs.push({ ID, TaskID: data.TaskID, UserName: this.currentUser.Name, WorkDate: data.WorkDate, Minutes: data.Minutes, Note: data.Note, CreatedOn: new Date().toISOString() });
    this.log(data.TaskID, 'worklog', `logged ${this.formatMinutes(data.Minutes)}`);
    return this.respond({ Status: 'Time Logged Successfully...' });
  }

  deleteWorklog(ID: number): Observable<any> {
    this.worklogs = this.worklogs.filter(w => w.ID !== ID);
    return this.respond({ Status: 'Worklog Deleted Successfully!' });
  }

  getTimerStart(TaskID: number): number | null {
    return this.timers[TaskID] ?? null;
  }

  startTimer(TaskID: number) {
    this.timers[TaskID] = Date.now();
  }

  /** Stops the timer and returns elapsed minutes (min 1). */
  stopTimer(TaskID: number): number {
    const start = this.timers[TaskID];
    delete this.timers[TaskID];
    return start ? Math.max(1, Math.round((Date.now() - start) / 60000)) : 0;
  }

  // ---------------- Activity ----------------

  getActivity(TaskID: number): Observable<TaskActivity[]> {
    return this.respond(this.activities.filter(a => a.TaskID === TaskID)
      .sort((a, b) => b.CreatedOn.localeCompare(a.CreatedOn)).map(a => ({ ...a })));
  }

  // ---------------- helpers ----------------

  formatMinutes(min: number): string {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`;
  }

  private respond<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }

  private today(): string {
    return this.dateStr(new Date());
  }

  private dateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private addDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return this.dateStr(d);
  }

  private priorityRank(p: string): number {
    return ['Low', 'Medium', 'High', 'Critical'].indexOf(p);
  }

  private filterTasks(f: TaskFilter): Task[] {
    const s = (f.Search || '').toLowerCase();
    return this.tasks.filter(t =>
      (!f.ProjectID || t.ProjectID === Number(f.ProjectID)) &&
      (!f.Status || (f.Status === 'Overdue' ? t.Status !== 'Done' && !!t.DueDate && t.DueDate < this.today() : t.Status === f.Status)) &&
      (!f.Priority || t.Priority === f.Priority) &&
      (!f.AssigneeID || t.AssigneeID === Number(f.AssigneeID)) &&
      (!f.DueFrom || (t.DueDate && t.DueDate >= f.DueFrom)) &&
      (!f.DueTo || (t.DueDate && t.DueDate <= f.DueTo)) &&
      (!s || [t.Key, t.Title, t.AssigneeName, t.ProjectName, ...t.Labels].some(v => v.toLowerCase().includes(s))));
  }

  private decorate(t: Task): Task {
    const subs = this.subtasks.filter(s => s.TaskID === t.ID);
    const blockers = this.dependencies.filter(d => d.TaskID === t.ID)
      .map(d => this.tasks.find(x => x.ID === d.DependsOnID)).filter(x => x && x.Status !== 'Done');
    return {
      ...t, Labels: [...t.Labels],
      LoggedMinutes: this.worklogs.filter(w => w.TaskID === t.ID).reduce((s, w) => s + w.Minutes, 0),
      SubtaskTotal: subs.length, SubtaskDone: subs.filter(s => s.Done).length,
      CommentCount: this.comments.filter(c => c.TaskID === t.ID).length,
      AttachmentCount: this.attachments.filter(a => a.TaskID === t.ID).length,
      IsBlocked: blockers.length > 0
    };
  }

  /** true if `from` (transitively) depends on `to` */
  private reaches(from: number, to: number, seen = new Set<number>()): boolean {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return this.dependencies.filter(d => d.TaskID === from).some(d => this.reaches(d.DependsOnID, to, seen));
  }

  private addSubtaskInternal(TaskID: number, Title: string, Done = false, AssigneeName = '') {
    const ID = Math.max(0, ...this.subtasks.map(s => s.ID)) + 1;
    this.subtasks.push({ ID, TaskID, Title, Done, AssigneeName });
  }

  private log(TaskID: number, Type: ActivityType, Text: string, UserName = this.currentUser.Name, CreatedOn = new Date().toISOString()) {
    const ID = Math.max(0, ...this.activities.map(a => a.ID)) + 1;
    this.activities.push({ ID, TaskID, UserName, Type, Text, CreatedOn });
  }

  private seed() {
    const titles: { [prefix: string]: string[] } = {
      CRM: ['Dashboard KPI widgets', 'Ticket SLA timer', 'Role based menu', 'Invoice PDF export', 'Partner search API', 'Notification centre', 'Login rate limiting'],
      HRM: ['Attendance geo-fencing', 'Leave approval flow', 'Payslip download', 'Push notifications', 'Offline sync', 'Biometric login'],
      DWH: ['Sales fact table', 'Nightly ETL job', 'Subscription data mart', 'Data quality checks', 'Power BI connector'],
      NMS: ['SNMP poller', 'Bandwidth graph', 'Alert rules engine', 'Device inventory import'],
      SDA: ['Lead scoring model', 'Follow-up reminders', 'Quotation template', 'Email integration', 'Pipeline report'],
    };
    const labelSets = [['Frontend', 'UI'], ['Backend', 'API'], ['Bug'], ['Testing'], ['DevOps'], ['Backend'], ['Frontend'], ['Docs']];
    const statusCycle: TaskStatus[] = ['Done', 'In Progress', 'To Do', 'In Review', 'In Progress', 'To Do', 'Done'];
    const priorities: Task['Priority'][] = ['High', 'Medium', 'Critical', 'Low', 'Medium', 'High', 'Medium'];
    const commentsPool = [
      'I have pushed the first draft, please review.',
      'Can we keep the same colours as the dashboard cards?',
      'Blocked on API contract, waiting for backend.',
      'Looks good to me 👍',
      'Added unit tests for edge cases.',
    ];
    const files = [
      { n: 'requirements.pdf', s: 482_000, t: 'application/pdf' },
      { n: 'wireframe.png', s: 1_240_000, t: 'image/png' },
      { n: 'api-contract.json', s: 18_400, t: 'application/json' },
      { n: 'test-cases.xlsx', s: 96_000, t: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ];

    let id = 1, offset = -12;
    this.projects.forEach((p, pi) => {
      titles[p.Prefix].forEach((title, i) => {
        const status = statusCycle[(i + pi) % statusCycle.length];
        const assignee = this.users[(i + pi * 2) % this.users.length];
        const reporter = this.users[(pi + 1) % this.users.length];
        const due = this.addDays(offset);
        offset = offset >= 24 ? -12 : offset + 3;
        const start = this.addDays(offset - 10);
        const created = new Date(start + 'T10:00:00');
        const task: Task = {
          ID: id, Key: `${p.Prefix}-${i + 1}`, ProjectID: p.ID, ProjectName: p.Name, Title: title,
          Description: `${title} for ${p.Name}. Acceptance criteria:\n• Works on desktop and mobile\n• Covered by tests\n• Reviewed by the tech lead`,
          Status: status, Priority: priorities[(i + pi) % priorities.length], AssigneeID: assignee.ID, AssigneeName: assignee.Name,
          ReporterName: reporter.Name, StartDate: start, DueDate: due, EstimateHours: [4, 8, 12, 16, 6][i % 5],
          Labels: labelSets[(i + pi) % labelSets.length], CreatedOn: created.toISOString(), UpdatedOn: created.toISOString()
        };
        this.tasks.push(task);
        this.log(id, 'created', 'created this task', reporter.Name, created.toISOString());

        // subtasks
        const subCount = (i % 3) + 2;
        for (let s = 0; s < subCount; s++) {
          this.addSubtaskInternal(id, ['Design', 'Implement', 'Write tests', 'Code review'][s], status === 'Done' || s < (i % 3), assignee.Name);
        }

        // comments
        const cCount = i % 4;
        for (let c = 0; c < cCount; c++) {
          const who = this.users[(i + c + pi) % this.users.length];
          const when = new Date(created.getTime() + (c + 1) * 86400000).toISOString();
          const mention = c === 1 ? ` @${assignee.Name}` : '';
          this.comments.push({
            ID: this.comments.length + 1, TaskID: id, UserName: who.Name, Text: commentsPool[(i + c) % commentsPool.length] + mention,
            Mentions: mention ? [assignee.Name] : [], CreatedOn: when
          });
          this.log(id, 'comment', mention ? `commented and mentioned ${assignee.Name}` : 'added a comment', who.Name, when);
        }

        // attachments
        if (i % 2 === 0) {
          const f = files[(i + pi) % files.length];
          const when = new Date(created.getTime() + 3600000).toISOString();
          this.attachments.push({ ID: this.attachments.length + 1, TaskID: id, FileName: f.n, FileSize: f.s, FileType: f.t, UploadedBy: reporter.Name, UploadedOn: when });
          this.log(id, 'attachment', `attached ${f.n}`, reporter.Name, when);
        }

        // worklogs
        if (status !== 'To Do') {
          for (let w = 0; w < (i % 3) + 1; w++) {
            const d = new Date(created.getTime() + (w + 1) * 86400000);
            const mins = [90, 120, 45, 180, 60][(i + w) % 5];
            this.worklogs.push({
              ID: this.worklogs.length + 1, TaskID: id, UserName: assignee.Name, WorkDate: this.dateStr(d), Minutes: mins,
              Note: ['Initial implementation', 'Fixed review comments', 'Testing & bug fixes'][w % 3], CreatedOn: d.toISOString()
            });
            this.log(id, 'worklog', `logged ${this.formatMinutes(mins)}`, assignee.Name, d.toISOString());
          }
        }
        if (status !== 'To Do') {
          const when = new Date(created.getTime() + 2 * 86400000).toISOString();
          this.log(id, 'status', `changed status from To Do to ${status === 'Done' ? 'In Progress' : status}`, assignee.Name, when);
          if (status === 'Done') this.log(id, 'status', 'changed status from In Progress to Done', assignee.Name, new Date(created.getTime() + 5 * 86400000).toISOString());
        }
        id++;
      });
    });

    // a few dependencies inside projects
    [[2, 1], [3, 2], [9, 8], [10, 9], [15, 14], [21, 19], [25, 24]].forEach(([t, d]) => {
      if (this.tasks.find(x => x.ID === t)?.ProjectID === this.tasks.find(x => x.ID === d)?.ProjectID) {
        this.dependencies.push({ ID: this.dependencies.length + 1, TaskID: t, DependsOnID: d });
      }
    });
  }
}
