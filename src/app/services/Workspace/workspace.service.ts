import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import {
  AutomationRule, AutomationRun, AutomationTemplate, ChangelogEntry, DeletedItem, DeletedItemType, DocFile, DocFolder,
  DocVersion, FaqItem, HelpArticle, HelpCategory, RecurringRule, SavedView, ShortcutItem, SystemStatusItem
} from '../../Interface/workspace';
import { CURRENT_USER_ID, PROJECTS, USERS, daysFromToday, userName } from '../Shared/mock-directory';

/**
 * Workspace (enterprise advanced) service: saved views, document library, recurring task rules,
 * automation rules, recycle bin and help center content.
 *
 * NOTE: OM-API me abhi Workspace endpoints nahi hain, isliye ye service in-memory mock data
 * use karti hai (page refresh par reset). Method shapes TicketService / TaskService jaise hain
 * (Result / FilterRecords / Status) — API aane par sirf body ko http call se replace karna hai.
 */
@Injectable({
  providedIn: 'root'
})
export class WorkspaceService {
  private latency = 200;
  readonly currentUser = { ID: CURRENT_USER_ID, Name: userName(CURRENT_USER_ID) };
  readonly storageQuota = 2 * 1024 * 1024 * 1024;   // 2 GB plan quota
  readonly purgeDays = 30;

  private views: SavedView[] = [];
  private folders: DocFolder[] = [];
  private files: DocFile[] = [];
  private recurring: RecurringRule[] = [];
  private automations: AutomationRule[] = [];
  private runs: AutomationRun[] = [];
  private deleted: DeletedItem[] = [];
  /** payload of items deleted in this session so they can be restored */
  private deletedPayload: { [binId: number]: any } = {};
  /** real archived projects permanently removed from the bin in this session */
  private purgedProjectIDs: number[] = [];
  private articles: HelpArticle[] = [];
  private feedback: { [articleId: number]: 'Yes' | 'No' } = {};

  constructor() {
    this.seed();
  }

  // =============== Saved views ===============
  getViews(): Observable<SavedView[]> {
    return this.respond(this.views.map(v => this.clone(v)));
  }

  viewAddEdit(data: Partial<SavedView> & { AddEdit: 'A' | 'E' }): Observable<any> {
    const now = new Date().toISOString();
    if (data.IsDefault) this.views.filter(v => v.Entity === data.Entity).forEach(v => v.IsDefault = false);
    if (data.AddEdit === 'A') {
      const ID = this.nextId(this.views);
      this.views.unshift({
        ID, Name: data.Name!, Description: data.Description || '', Entity: data.Entity || 'Tasks', Layout: data.Layout || 'List',
        Visibility: data.Visibility || 'Private', OwnerID: this.currentUser.ID, OwnerName: this.currentUser.Name,
        Pinned: !!data.Pinned, IsDefault: !!data.IsDefault, Match: data.Match || 'AND', Conditions: data.Conditions || [],
        CreatedOn: now, UpdatedOn: now
      });
      return this.respond({ Status: 'View Added Successfully...', ID });
    }
    const v = this.views.find(x => x.ID === data.ID);
    if (!v) return this.respond({ Status: 'View Not Found' });
    Object.assign(v, {
      Name: data.Name, Description: data.Description || '', Entity: data.Entity, Layout: data.Layout, Visibility: data.Visibility,
      Pinned: !!data.Pinned, IsDefault: !!data.IsDefault, Match: data.Match, Conditions: data.Conditions || [], UpdatedOn: now
    });
    return this.respond({ Status: 'View Updated Successfully...', ID: v.ID });
  }

  updateView(ID: number, changes: Partial<Pick<SavedView, 'Pinned' | 'Visibility' | 'IsDefault'>>): Observable<any> {
    const v = this.views.find(x => x.ID === ID);
    if (!v) return this.respond({ Status: 'View Not Found' });
    if (changes.IsDefault) this.views.filter(x => x.Entity === v.Entity).forEach(x => x.IsDefault = false);
    Object.assign(v, changes, { UpdatedOn: new Date().toISOString() });
    return this.respond({ Status: 'View Updated Successfully...' });
  }

  duplicateView(ID: number): Observable<any> {
    const v = this.views.find(x => x.ID === ID);
    if (!v) return this.respond({ Status: 'View Not Found' });
    const now = new Date().toISOString();
    const copy: SavedView = {
      ...this.clone(v), ID: this.nextId(this.views), Name: `${v.Name} (copy)`, OwnerID: this.currentUser.ID,
      OwnerName: this.currentUser.Name, IsDefault: false, Pinned: false, Visibility: 'Private', CreatedOn: now, UpdatedOn: now
    };
    this.views.splice(this.views.indexOf(v) + 1, 0, copy);
    return this.respond({ Status: 'View Added Successfully...', ID: copy.ID });
  }

  deleteView(ID: number): Observable<any> {
    const v = this.views.find(x => x.ID === ID);
    if (!v) return this.respond({ Status: 'View Not Found' });
    this.views = this.views.filter(x => x.ID !== ID);
    this.toBin('View', v.Name, `Saved views · ${v.Entity}`, v.ID, v);
    return this.respond({ Status: 'View Deleted Successfully!' });
  }

  // =============== Documents ===============
  getFolders(): Observable<DocFolder[]> {
    return this.respond(this.folders.map(f => ({ ...f })));
  }

  getFiles(): Observable<DocFile[]> {
    return this.respond(this.files.map(f => this.clone(f)));
  }

  getFileByID(ID: number): Observable<DocFile | undefined> {
    const f = this.files.find(x => x.ID === ID);
    return this.respond(f ? this.clone(f) : undefined);
  }

  folderAddEdit(data: { ID: number; Name: string; ParentID: number | null }): Observable<any> {
    const dup = this.folders.find(f => f.ParentID === data.ParentID && f.Name.toLowerCase() === data.Name.trim().toLowerCase() && f.ID !== data.ID);
    if (dup) return this.respond({ Status: 'Folder Name Exists' });
    if (!data.ID) {
      const ID = this.nextId(this.folders);
      const parent = this.folders.find(f => f.ID === data.ParentID);
      this.folders.push({ ID, Name: data.Name.trim(), ParentID: data.ParentID, ProjectID: parent?.ProjectID ?? null, CreatedOn: new Date().toISOString() });
      return this.respond({ Status: 'Folder Added Successfully...', ID });
    }
    const f = this.folders.find(x => x.ID === data.ID);
    if (!f) return this.respond({ Status: 'Folder Not Found' });
    f.Name = data.Name.trim();
    return this.respond({ Status: 'Folder Updated Successfully...', ID: f.ID });
  }

  deleteFolder(ID: number): Observable<any> {
    const ids = this.descendantFolderIds(ID);
    const f = this.folders.find(x => x.ID === ID);
    if (!f) return this.respond({ Status: 'Folder Not Found' });
    const files = this.files.filter(x => ids.includes(x.FolderID));
    files.forEach(file => this.toBin('Document', file.Name, `Documents / ${this.folderPath(file.FolderID)}`, file.ID, file));
    this.files = this.files.filter(x => !ids.includes(x.FolderID));
    this.folders = this.folders.filter(x => !ids.includes(x.ID));
    return this.respond({ Status: 'Folder Deleted Successfully!' });
  }

  uploadFiles(FolderID: number, files: File[]): Observable<any> {
    const now = new Date().toISOString();
    const folder = this.folders.find(f => f.ID === FolderID);
    files.forEach(file => {
      const Url = URL.createObjectURL(file);
      const project = PROJECTS.find(p => p.ID === folder?.ProjectID);
      this.files.unshift({
        ID: this.nextId(this.files), FolderID, Name: file.name, FileType: file.type || 'application/octet-stream', FileSize: file.size,
        OwnerName: this.currentUser.Name, CreatedOn: now, ModifiedOn: now, Starred: false, ProjectID: project?.ID ?? null,
        ProjectName: project?.Name || '', Tags: [], Description: '', Url,
        Versions: [{ Version: 1, FileSize: file.size, UploadedBy: this.currentUser.Name, UploadedOn: now, Note: 'Initial upload', Url, FileType: file.type }]
      });
    });
    return this.respond({ Status: `${files.length} File(s) Uploaded Successfully...` });
  }

  uploadVersion(ID: number, file: File, Note: string): Observable<any> {
    const f = this.files.find(x => x.ID === ID);
    if (!f) return this.respond({ Status: 'File Not Found' });
    const now = new Date().toISOString();
    const Url = URL.createObjectURL(file);
    const v: DocVersion = { Version: Math.max(0, ...f.Versions.map(x => x.Version)) + 1, FileSize: file.size, UploadedBy: this.currentUser.Name, UploadedOn: now, Note: Note || 'New version', Url, FileType: file.type };
    f.Versions.unshift(v);
    Object.assign(f, { FileSize: file.size, ModifiedOn: now, Url, FileType: file.type || f.FileType });
    return this.respond({ Status: `Version ${v.Version} Uploaded Successfully...` });
  }

  updateFile(ID: number, changes: Partial<Pick<DocFile, 'Name' | 'FolderID' | 'Starred' | 'ProjectID' | 'Tags' | 'Description'>>): Observable<any> {
    const f = this.files.find(x => x.ID === ID);
    if (!f) return this.respond({ Status: 'File Not Found' });
    Object.assign(f, changes);
    if (changes.ProjectID !== undefined) f.ProjectName = PROJECTS.find(p => p.ID === changes.ProjectID)?.Name || '';
    if (changes.Name !== undefined || changes.FolderID !== undefined) f.ModifiedOn = new Date().toISOString();
    return this.respond({ Status: 'File Updated Successfully...' });
  }

  deleteFile(ID: number): Observable<any> {
    const f = this.files.find(x => x.ID === ID);
    if (!f) return this.respond({ Status: 'File Not Found' });
    this.files = this.files.filter(x => x.ID !== ID);
    this.toBin('Document', f.Name, `Documents / ${this.folderPath(f.FolderID)}`, f.ID, f);
    return this.respond({ Status: 'File Deleted Successfully!' });
  }

  folderPath(FolderID: number): string {
    const parts: string[] = [];
    let f = this.folders.find(x => x.ID === FolderID);
    while (f) {
      parts.unshift(f.Name);
      const pid = f.ParentID;
      f = this.folders.find(x => x.ID === pid);
    }
    return parts.join(' / ');
  }

  private descendantFolderIds(ID: number): number[] {
    const out = [ID];
    this.folders.filter(f => f.ParentID === ID).forEach(c => out.push(...this.descendantFolderIds(c.ID)));
    return out;
  }

  // =============== Recurring tasks ===============
  getRecurringRules(): Observable<RecurringRule[]> {
    return this.respond(this.recurring.map(r => this.clone(r)));
  }

  getRecurringRuleByID(ID: number): Observable<RecurringRule | undefined> {
    const r = this.recurring.find(x => x.ID === ID);
    return this.respond(r ? this.clone(r) : undefined);
  }

  recurringAddEdit(data: Partial<RecurringRule> & { AddEdit: 'A' | 'E' }): Observable<any> {
    const project = PROJECTS.find(p => p.ID === data.ProjectID);
    const assignee = USERS.find(u => u.ID === data.AssigneeID);
    const fields = { ...data, ProjectName: project?.Name || '', AssigneeName: assignee?.Name || '', AssigneeID: data.AssigneeID ?? null } as any;
    delete fields.AddEdit;
    if (data.AddEdit === 'A') {
      const ID = this.nextId(this.recurring);
      this.recurring.unshift({
        ...fields, ID, Active: data.Active ?? true, LastRun: null, LastTaskID: null, RunCount: 0,
        CreatedBy: this.currentUser.Name, CreatedOn: new Date().toISOString()
      } as RecurringRule);
      return this.respond({ Status: 'Recurring Rule Added Successfully...', ID });
    }
    const r = this.recurring.find(x => x.ID === data.ID);
    if (!r) return this.respond({ Status: 'Recurring Rule Not Found' });
    Object.assign(r, fields, { ID: r.ID, LastRun: r.LastRun, LastTaskID: r.LastTaskID, RunCount: r.RunCount, CreatedBy: r.CreatedBy, CreatedOn: r.CreatedOn });
    return this.respond({ Status: 'Recurring Rule Updated Successfully...', ID: r.ID });
  }

  setRecurringActive(ID: number, Active: boolean): Observable<any> {
    const r = this.recurring.find(x => x.ID === ID);
    if (r) r.Active = Active;
    return this.respond({ Status: 'Recurring Rule Updated Successfully...' });
  }

  markRecurringRun(ID: number, TaskID: number): Observable<any> {
    const r = this.recurring.find(x => x.ID === ID);
    if (r) {
      r.LastRun = new Date().toISOString();
      r.LastTaskID = TaskID;
      r.RunCount++;
    }
    return this.respond({ Status: 'Recurring Rule Updated Successfully...' });
  }

  deleteRecurringRule(ID: number): Observable<any> {
    this.recurring = this.recurring.filter(x => x.ID !== ID);
    return this.respond({ Status: 'Recurring Rule Deleted Successfully!' });
  }

  // =============== Automation ===============
  getAutomationRules(): Observable<AutomationRule[]> {
    return this.respond(this.automations.map(r => this.clone(r)));
  }

  getAutomationRuleByID(ID: number): Observable<AutomationRule | undefined> {
    const r = this.automations.find(x => x.ID === ID);
    return this.respond(r ? this.clone(r) : undefined);
  }

  automationAddEdit(data: Partial<AutomationRule> & { AddEdit: 'A' | 'E' }): Observable<any> {
    if (data.AddEdit === 'A') {
      const ID = this.nextId(this.automations);
      this.automations.unshift({
        ID, Name: data.Name!, Description: data.Description || '', ProjectID: data.ProjectID ?? null, Trigger: data.Trigger!,
        TriggerValue: data.TriggerValue || '', Conditions: data.Conditions || [], Actions: data.Actions || [], Enabled: data.Enabled ?? true,
        CreatedBy: this.currentUser.Name, CreatedOn: new Date().toISOString(), Runs7d: 0, LastRunOn: null, LastRunStatus: ''
      });
      return this.respond({ Status: 'Automation Rule Added Successfully...', ID });
    }
    const r = this.automations.find(x => x.ID === data.ID);
    if (!r) return this.respond({ Status: 'Automation Rule Not Found' });
    Object.assign(r, {
      Name: data.Name, Description: data.Description || '', ProjectID: data.ProjectID ?? null, Trigger: data.Trigger,
      TriggerValue: data.TriggerValue || '', Conditions: data.Conditions || [], Actions: data.Actions || [], Enabled: data.Enabled ?? r.Enabled
    });
    this.runs.filter(x => x.RuleID === r.ID).forEach(x => x.RuleName = r.Name);
    return this.respond({ Status: 'Automation Rule Updated Successfully...', ID: r.ID });
  }

  setAutomationEnabled(ID: number, Enabled: boolean): Observable<any> {
    const r = this.automations.find(x => x.ID === ID);
    if (r) r.Enabled = Enabled;
    return this.respond({ Status: 'Automation Rule Updated Successfully...' });
  }

  deleteAutomationRule(ID: number): Observable<any> {
    this.automations = this.automations.filter(x => x.ID !== ID);
    return this.respond({ Status: 'Automation Rule Deleted Successfully!' });
  }

  getAutomationRuns(RuleID: number | null = null): Observable<AutomationRun[]> {
    const rows = this.runs.filter(r => RuleID === null || r.RuleID === RuleID).sort((a, b) => b.RunOn.localeCompare(a.RunOn));
    return this.respond(rows.map(r => ({ ...r })));
  }

  /** Simulated test run of a rule against a sample item. */
  testAutomationRule(ID: number): Observable<AutomationRun | undefined> {
    const r = this.automations.find(x => x.ID === ID);
    if (!r) return this.respond(undefined);
    const run: AutomationRun = {
      ID: this.nextId(this.runs), RuleID: r.ID, RuleName: r.Name, RunOn: new Date().toISOString(), Item: 'CRM-3 Role based menu (test)',
      Result: r.Actions.length ? 'Success' : 'Skipped', DurationMs: 120 + Math.round(Math.random() * 600),
      Message: r.Actions.length ? `${r.Actions.length} action(s) executed (dry run)` : 'No actions configured'
    };
    this.runs.unshift(run);
    r.LastRunOn = run.RunOn;
    r.LastRunStatus = run.Result;
    r.Runs7d++;
    return this.respond({ ...run });
  }

  getAutomationTemplates(): Observable<AutomationTemplate[]> {
    return this.respond(this.templates.map(t => this.clone(t)));
  }

  // =============== Recycle bin ===============
  getDeletedItems(): Observable<DeletedItem[]> {
    return this.respond(this.deleted.map(d => ({ ...d })).sort((a, b) => b.DeletedOn.localeCompare(a.DeletedOn)));
  }

  getPurgedProjectIDs(): number[] {
    return [...this.purgedProjectIDs];
  }

  /** Restores mock items (documents and views deleted in this session go back to their screens). */
  restoreDeleted(IDs: number[]): Observable<any> {
    IDs.forEach(id => {
      const item = this.deleted.find(d => d.ID === id);
      if (!item) return;
      const payload = this.deletedPayload[id];
      if (payload && item.Type === 'Document') {
        if (!this.folders.some(f => f.ID === payload.FolderID)) payload.FolderID = this.folders[0]?.ID;
        this.files.unshift(payload);
      }
      if (payload && item.Type === 'View') this.views.unshift(payload);
      delete this.deletedPayload[id];
    });
    this.deleted = this.deleted.filter(d => !IDs.includes(d.ID));
    return this.respond({ Status: `${IDs.length} Item(s) Restored Successfully...` });
  }

  /** Permanently deletes bin items. Real archived projects are only hidden from the bin (mock). */
  purgeDeleted(IDs: number[], realProjectIDs: number[] = []): Observable<any> {
    IDs.forEach(id => delete this.deletedPayload[id]);
    this.deleted = this.deleted.filter(d => !IDs.includes(d.ID));
    this.purgedProjectIDs.push(...realProjectIDs);
    return this.respond({ Status: `${IDs.length + realProjectIDs.length} Item(s) Deleted Successfully!` });
  }

  private toBin(Type: DeletedItemType, Name: string, Location: string, RefID: number | null, payload: any) {
    const ID = this.nextId(this.deleted);
    this.deleted.unshift({ ID, Type, Name, Location, DeletedBy: this.currentUser.Name, DeletedOn: new Date().toISOString(), RefID });
    this.deletedPayload[ID] = this.clone(payload);
  }

  // =============== Help center ===============
  getHelpCategories(): Observable<HelpCategory[]> {
    return this.respond(this.categories.map(c => ({ ...c })));
  }

  getHelpArticles(): Observable<HelpArticle[]> {
    return this.respond(this.articles.map(a => this.clone(a)));
  }

  getHelpArticleByID(ID: number): Observable<HelpArticle | undefined> {
    const a = this.articles.find(x => x.ID === ID);
    if (a) a.Views++;
    return this.respond(a ? this.clone(a) : undefined);
  }

  getArticleFeedback(ID: number): 'Yes' | 'No' | null {
    return this.feedback[ID] || null;
  }

  sendArticleFeedback(ID: number, value: 'Yes' | 'No'): Observable<any> {
    const a = this.articles.find(x => x.ID === ID);
    if (a && !this.feedback[ID]) {
      if (value === 'Yes') a.HelpfulYes++; else a.HelpfulNo++;
      this.feedback[ID] = value;
    }
    return this.respond({ Status: 'Feedback Added Successfully...' });
  }

  getFaqs(): Observable<FaqItem[]> {
    return this.respond(this.faqs.map(f => ({ ...f })));
  }

  getChangelog(): Observable<ChangelogEntry[]> {
    return this.respond(this.changelog.map(c => this.clone(c)));
  }

  getShortcuts(): Observable<ShortcutItem[]> {
    return this.respond(this.shortcuts.map(s => this.clone(s)));
  }

  getSystemStatus(): Observable<SystemStatusItem[]> {
    return this.respond(this.status.map(s => ({ ...s })));
  }

  // =============== helpers ===============
  private respond<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }

  private clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

  private nextId(rows: { ID: number }[]): number {
    return Math.max(0, ...rows.map(r => r.ID)) + 1;
  }

  private iso(daysAgo: number, hour = 10, minute = 0): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  }

  // =============== static content ===============
  private categories: HelpCategory[] = [
    { Key: 'getting-started', Name: 'Getting started', Description: 'Set up your workspace, invite people and create the first project.', Icon: 'rocket' },
    { Key: 'projects', Name: 'Projects', Description: 'Plans, milestones, members, health and archiving.', Icon: 'folder' },
    { Key: 'tasks', Name: 'Tasks', Description: 'List, board and calendar views, subtasks, time tracking.', Icon: 'check' },
    { Key: 'agile', Name: 'Agile', Description: 'Backlog, sprints, story points and burndown charts.', Icon: 'bolt' },
    { Key: 'reports', Name: 'Reports', Description: 'Dashboards, workload, timesheets and exports.', Icon: 'chart' },
    { Key: 'admin', Name: 'Admin', Description: 'Roles, permissions, automation and security settings.', Icon: 'gear' },
    { Key: 'billing', Name: 'Billing', Description: 'Plans, invoices, payment methods and storage.', Icon: 'card' },
  ];

  private faqs: FaqItem[] = [
    { ID: 1, Question: 'How do I invite a new team member?', Answer: 'Go to Team › People and click "Invite member". Enter the email address, pick a role and the person receives an invitation link valid for 7 days.' },
    { ID: 2, Question: 'Can I restore a task or project I deleted by mistake?', Answer: 'Yes. Deleted items stay in Workspace › Recycle Bin for 30 days. Select the item and click Restore. After 30 days items are purged permanently.' },
    { ID: 3, Question: 'What is the difference between archiving and deleting a project?', Answer: 'Archiving hides a project from active lists but keeps all data read-only. Deleting moves it to the recycle bin and it is purged after 30 days.' },
    { ID: 4, Question: 'How do recurring tasks work?', Answer: 'A recurring rule stores a task template and a schedule. At every occurrence a new task is created in the selected project with the configured assignee and due offset.' },
    { ID: 5, Question: 'Is there a limit on file uploads?', Answer: 'Each file can be up to 100 MB. Your plan includes 2 GB of document storage; the storage bar in Documents shows current usage.' },
    { ID: 6, Question: 'Who can see my saved views?', Answer: 'Private views are visible only to you, Team views to members of your teams, and Everyone views to the whole organization.' },
  ];

  private changelog: ChangelogEntry[] = [
    { Version: '4.8', Date: daysFromToday(-3), Tag: 'New', Title: 'Automation rules', Items: ['Build WHEN → IF → THEN rules without code', 'Templates for common workflows', 'Run history with failure details'] },
    { Version: '4.7', Date: daysFromToday(-12), Tag: 'New', Title: 'Recurring tasks', Items: ['Daily, weekly, monthly and custom schedules', 'Preview the next 5 occurrences', 'Run a rule manually any time'] },
    { Version: '4.6.2', Date: daysFromToday(-20), Tag: 'Improved', Title: 'Faster global search', Items: ['Search across projects, tasks, people, documents and help', 'Keyboard navigation with ↑ ↓ Enter'] },
    { Version: '4.6.1', Date: daysFromToday(-27), Tag: 'Fixed', Title: 'Calendar fixes', Items: ['Tasks dragged to weekends keep their time', 'Fixed overdue badge for tasks due today'] },
    { Version: '4.6', Date: daysFromToday(-41), Tag: 'New', Title: 'Document library', Items: ['Folders, versions and file preview', 'Link documents to projects'] },
  ];

  private shortcuts: ShortcutItem[] = [
    { Group: 'General', Keys: ['Ctrl', 'K'], Description: 'Open global search' },
    { Group: 'General', Keys: ['?'], Description: 'Show keyboard shortcuts' },
    { Group: 'General', Keys: ['Esc'], Description: 'Close drawer or dialog' },
    { Group: 'Navigation', Keys: ['G', 'P'], Description: 'Go to Projects' },
    { Group: 'Navigation', Keys: ['G', 'T'], Description: 'Go to Tasks' },
    { Group: 'Navigation', Keys: ['G', 'D'], Description: 'Go to Documents' },
    { Group: 'Tasks', Keys: ['C'], Description: 'Create a task' },
    { Group: 'Tasks', Keys: ['E'], Description: 'Edit selected task' },
    { Group: 'Tasks', Keys: ['Ctrl', 'Enter'], Description: 'Save form' },
    { Group: 'Search', Keys: ['↑', '↓'], Description: 'Move through results' },
    { Group: 'Search', Keys: ['Enter'], Description: 'Open selected result' },
  ];

  private status: SystemStatusItem[] = [
    { Name: 'Web application', Status: 'Operational', Uptime: 99.98 },
    { Name: 'API', Status: 'Operational', Uptime: 99.95 },
    { Name: 'File storage', Status: 'Operational', Uptime: 100 },
    { Name: 'Email notifications', Status: 'Operational', Uptime: 99.9 },
    { Name: 'Automation engine', Status: 'Operational', Uptime: 99.93 },
  ];

  private templates: AutomationTemplate[] = [
    { Key: 'bugs-to-qa', Name: 'Auto-assign bugs to QA', Category: 'Assignment', Description: 'When a task labelled Bug is created, assign it to the QA lead and set priority High.', Trigger: 'TaskCreated', TriggerValue: '',
      Conditions: [{ Field: 'Label', Operator: 'contains', Value: 'Bug' }], Actions: [{ Type: 'AssignTo', Value: '5' }, { Type: 'SetPriority', Value: 'High' }] },
    { Key: 'overdue-manager', Name: 'Notify manager on overdue', Category: 'Notifications', Description: 'When a task becomes overdue, notify the project manager role.', Trigger: 'TaskOverdue', TriggerValue: '',
      Conditions: [], Actions: [{ Type: 'NotifyRole', Value: 'Project Manager' }] },
    { Key: 'due-reminder', Name: 'Due date reminder', Category: 'Notifications', Description: 'Remind the assignee 2 days before the due date.', Trigger: 'DueApproaching', TriggerValue: '2',
      Conditions: [{ Field: 'Status', Operator: 'is not', Value: 'Done' }], Actions: [{ Type: 'NotifyUser', Value: 'Assignee' }] },
    { Key: 'review-qa', Name: 'Send to QA on review', Category: 'Workflow', Description: 'When status changes to In Review, assign to QA and add label Testing.', Trigger: 'StatusChanged', TriggerValue: 'In Review',
      Conditions: [], Actions: [{ Type: 'AssignTo', Value: '5' }, { Type: 'AddLabel', Value: 'Testing' }] },
    { Key: 'critical-escalate', Name: 'Escalate critical tasks', Category: 'Workflow', Description: 'When priority changes to Critical, notify the owner and move to the current sprint.', Trigger: 'FieldChanged', TriggerValue: 'Priority',
      Conditions: [{ Field: 'Priority', Operator: 'is', Value: 'Critical' }], Actions: [{ Type: 'NotifyRole', Value: 'Super Admin' }, { Type: 'MoveToSprint', Value: 'Current sprint' }] },
    { Key: 'mention-ack', Name: 'Follow-up on mention', Category: 'Collaboration', Description: 'When someone is mentioned in a comment, create a follow-up subtask.', Trigger: 'CommentMention', TriggerValue: '',
      Conditions: [], Actions: [{ Type: 'CreateSubtask', Value: 'Reply to mention' }] },
  ];

  // =============== seed ===============
  private seed() {
    // ---- saved views
    this.views = [
      { ID: 1, Name: 'My open tasks', Description: 'Everything assigned to me that is not done', Entity: 'Tasks', Layout: 'List', Visibility: 'Private', OwnerID: 1, OwnerName: 'Aarav Sharma', Pinned: true, IsDefault: true, Match: 'AND',
        Conditions: [{ Field: 'Assignee', Operator: 'is', Value: '1' }, { Field: 'Status', Operator: 'is not', Value: 'Done' }], CreatedOn: this.iso(40), UpdatedOn: this.iso(2) },
      { ID: 2, Name: 'CRM sprint board', Description: 'CRM Portal Revamp tasks on the board', Entity: 'Tasks', Layout: 'Board', Visibility: 'Team', OwnerID: 1, OwnerName: 'Aarav Sharma', Pinned: true, IsDefault: false, Match: 'AND',
        Conditions: [{ Field: 'Project', Operator: 'is', Value: '1' }], CreatedOn: this.iso(30), UpdatedOn: this.iso(5) },
      { ID: 3, Name: 'Critical & high bugs', Description: 'Triage list for QA', Entity: 'Tasks', Layout: 'List', Visibility: 'Everyone', OwnerID: 5, OwnerName: 'Karan Patel', Pinned: false, IsDefault: false, Match: 'AND',
        Conditions: [{ Field: 'Label', Operator: 'contains', Value: 'Bug' }, { Field: 'Priority', Operator: 'is', Value: 'High' }], CreatedOn: this.iso(25), UpdatedOn: this.iso(1) },
      { ID: 4, Name: 'Due this week', Description: 'Deadlines in the next 7 days', Entity: 'Tasks', Layout: 'Calendar', Visibility: 'Team', OwnerID: 6, OwnerName: 'Neha Gupta', Pinned: false, IsDefault: false, Match: 'AND',
        Conditions: [{ Field: 'Due date', Operator: 'within next days', Value: '7' }], CreatedOn: this.iso(18), UpdatedOn: this.iso(3) },
      { ID: 5, Name: 'Mobile app – in review', Description: '', Entity: 'Tasks', Layout: 'Board', Visibility: 'Private', OwnerID: 1, OwnerName: 'Aarav Sharma', Pinned: false, IsDefault: false, Match: 'AND',
        Conditions: [{ Field: 'Project', Operator: 'is', Value: '2' }, { Field: 'Status', Operator: 'is', Value: 'In Review' }], CreatedOn: this.iso(12), UpdatedOn: this.iso(12) },
      { ID: 6, Name: 'At-risk projects', Description: 'Portfolio review for leadership', Entity: 'Projects', Layout: 'List', Visibility: 'Everyone', OwnerID: 1, OwnerName: 'Aarav Sharma', Pinned: true, IsDefault: true, Match: 'OR',
        Conditions: [{ Field: 'Status', Operator: 'is', Value: 'On Hold' }, { Field: 'Search', Operator: 'contains', Value: 'Revamp' }], CreatedOn: this.iso(60), UpdatedOn: this.iso(7) },
    ];

    // ---- folders
    const f = (ID: number, Name: string, ParentID: number | null, ProjectID: number | null = null): DocFolder => ({ ID, Name, ParentID, ProjectID, CreatedOn: this.iso(90 - ID) });
    this.folders = [
      f(1, 'Projects', null), f(2, 'CRM Portal Revamp', 1, 1), f(3, 'HRMS Mobile App', 1, 2), f(4, 'Data Warehouse Setup', 1, 4),
      f(5, 'Network Monitoring (NMS)', 1, 6), f(6, 'Specifications', 2, 1), f(7, 'Designs', 2, 1),
      f(8, 'Design System', null), f(9, 'HR & Policies', null), f(10, 'Finance', null), f(11, 'Templates', null),
      f(12, 'Release notes', 3, 2),
    ];
    const MB = 1024 * 1024;
    const doc = (ID: number, FolderID: number, Name: string, FileType: string, sizeMb: number, owner: number, daysAgo: number,
      ProjectID: number | null, Tags: string[], versions = 1, Starred = false, Description = ''): DocFile => {
      const size = Math.round(sizeMb * MB);
      const Versions: DocVersion[] = Array.from({ length: versions }, (_, i) => ({
        Version: versions - i, FileSize: Math.round(size * (1 - i * 0.08)), UploadedBy: userName(i % 2 ? ((owner % 8) + 1) : owner),
        UploadedOn: this.iso(daysAgo + i * 6, 11 + i), Note: i === versions - 1 ? 'Initial upload' : ['Review comments addressed', 'Updated figures', 'Minor fixes'][i % 3]
      }));
      return {
        ID, FolderID, Name, FileType, FileSize: size, OwnerName: userName(owner), CreatedOn: Versions[Versions.length - 1].UploadedOn,
        ModifiedOn: Versions[0].UploadedOn, Starred, ProjectID, ProjectName: PROJECTS.find(p => p.ID === ProjectID)?.Name || '', Tags, Description, Versions
      };
    };
    const PDF = 'application/pdf', DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', PNG = 'image/png', PPT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    this.files = [
      doc(1, 6, 'CRM Requirements v3.pdf', PDF, 2.4, 6, 2, 1, ['Requirements', 'Signed-off'], 3, true, 'Business requirements signed off by the client.'),
      doc(2, 6, 'API Contract - Partner Search.docx', DOCX, 0.6, 3, 5, 1, ['API'], 2),
      doc(3, 7, 'Dashboard wireframes.png', PNG, 3.8, 4, 4, 1, ['UI', 'Wireframe'], 2, true),
      doc(4, 7, 'Login screen mock.png', PNG, 1.2, 4, 9, 1, ['UI']),
      doc(5, 2, 'CRM Project Plan.xlsx', XLSX, 0.4, 1, 1, 1, ['Plan'], 4, true, 'Master plan with milestones and resources.'),
      doc(6, 3, 'HRMS Mobile - Scope.pdf', PDF, 1.6, 2, 14, 2, ['Scope']),
      doc(7, 12, 'Release 1.4 notes.docx', DOCX, 0.2, 2, 3, 2, ['Release']),
      doc(8, 12, 'Release 1.3 notes.docx', DOCX, 0.2, 2, 33, 2, ['Release']),
      doc(9, 4, 'Warehouse data model.pdf', PDF, 5.2, 8, 6, 4, ['Data model', 'Architecture'], 2),
      doc(10, 4, 'ETL job inventory.xlsx', XLSX, 0.9, 8, 11, 4, ['ETL']),
      doc(11, 5, 'NMS network topology.pdf', PDF, 7.4, 7, 20, 6, ['Network']),
      doc(12, 8, 'Brand guidelines 2026.pdf', PDF, 12.6, 4, 45, null, ['Brand'], 2, true),
      doc(13, 8, 'Icon set.png', PNG, 2.1, 4, 30, null, ['Icons']),
      doc(14, 9, 'Leave policy.pdf', PDF, 0.5, 7, 70, null, ['Policy']),
      doc(15, 9, 'Code of conduct.pdf', PDF, 0.8, 1, 120, null, ['Policy']),
      doc(16, 10, 'Q3 budget review.xlsx', XLSX, 1.1, 1, 8, null, ['Budget'], 3),
      doc(17, 10, 'Vendor invoices FY26.xlsx', XLSX, 2.7, 7, 15, null, ['Finance']),
      doc(18, 11, 'Project kickoff deck.pptx', PPT, 4.3, 6, 25, null, ['Template']),
      doc(19, 11, 'Status report template.docx', DOCX, 0.1, 6, 50, null, ['Template']),
      doc(20, 1, 'Portfolio overview.pptx', PPT, 6.2, 1, 10, null, ['Portfolio']),
    ];

    // ---- recurring
    const base = { Description: '', Weekdays: [] as number[], MonthlyMode: 'Day' as const, MonthDay: 1, MonthWeek: 1, MonthWeekday: 1, IntervalDays: 2,
      EndMode: 'Never' as const, EndDate: '', EndAfter: 10, CreatedBy: 'Aarav Sharma' };
    this.recurring = [
      { ...base, ID: 1, Title: 'Weekly status report', Description: 'Compile progress, risks and next steps for the steering committee.', ProjectID: 1, ProjectName: 'CRM Portal Revamp', AssigneeID: 6, AssigneeName: 'Neha Gupta',
        Priority: 'Medium', EstimateHours: 2, Labels: ['Docs'], Frequency: 'Weekly', Time: '10:00', Weekdays: [1], StartDate: daysFromToday(-60), DueOffsetDays: 1,
        Active: true, LastRun: this.iso(this.daysSinceWeekday(1), 10), LastTaskID: null, RunCount: 8, CreatedOn: this.iso(60) },
      { ...base, ID: 2, Title: 'Database backup verification', Description: 'Restore last night backup on staging and verify row counts.', ProjectID: 4, ProjectName: 'Data Warehouse Setup', AssigneeID: 8, AssigneeName: 'Ananya Rao',
        Priority: 'High', EstimateHours: 1, Labels: ['DevOps'], Frequency: 'Daily', Time: '09:00', StartDate: daysFromToday(-30), DueOffsetDays: 0,
        Active: true, LastRun: this.iso(0, 9), LastTaskID: null, RunCount: 30, CreatedOn: this.iso(30) },
      { ...base, ID: 3, Title: 'Monthly security patching', Description: 'Apply OS and network device patches during the maintenance window.', ProjectID: 6, ProjectName: 'Network Monitoring (NMS)', AssigneeID: 7, AssigneeName: 'Vikram Singh',
        Priority: 'Critical', EstimateHours: 6, Labels: ['DevOps'], Frequency: 'Monthly', Time: '22:00', MonthlyMode: 'Weekday', MonthWeek: 1, MonthWeekday: 6,
        StartDate: daysFromToday(-120), DueOffsetDays: 2, Active: true, LastRun: this.iso(12, 22), LastTaskID: null, RunCount: 4, CreatedOn: this.iso(120) },
      { ...base, ID: 4, Title: 'Sprint regression run', Description: 'Execute the automated regression suite and file bugs.', ProjectID: 2, ProjectName: 'HRMS Mobile App', AssigneeID: 5, AssigneeName: 'Karan Patel',
        Priority: 'High', EstimateHours: 4, Labels: ['Testing'], Frequency: 'Weekly', Time: '15:30', Weekdays: [3, 5], StartDate: daysFromToday(-45), DueOffsetDays: 1,
        EndMode: 'After', EndAfter: 40, Active: true, LastRun: this.iso(2, 15, 30), LastTaskID: null, RunCount: 13, CreatedOn: this.iso(45) },
      { ...base, ID: 5, Title: 'Invoice reconciliation', Description: 'Match vendor invoices with purchase orders.', ProjectID: 7, ProjectName: 'Sales Desk Automation', AssigneeID: 3, AssigneeName: 'Rohit Mehta',
        Priority: 'Medium', EstimateHours: 3, Labels: ['Backend'], Frequency: 'Monthly', Time: '11:00', MonthlyMode: 'Day', MonthDay: 25, StartDate: daysFromToday(-90), DueOffsetDays: 3,
        Active: false, LastRun: this.iso(40, 11), LastTaskID: null, RunCount: 3, CreatedOn: this.iso(90) },
      { ...base, ID: 6, Title: 'Log rotation check', Description: 'Check disk usage on log servers.', ProjectID: 6, ProjectName: 'Network Monitoring (NMS)', AssigneeID: 7, AssigneeName: 'Vikram Singh',
        Priority: 'Low', EstimateHours: 0.5, Labels: ['DevOps'], Frequency: 'Custom', Time: '08:00', IntervalDays: 3, StartDate: daysFromToday(-20), DueOffsetDays: 0,
        EndMode: 'OnDate', EndDate: daysFromToday(60), Active: true, LastRun: this.iso(2, 8), LastTaskID: null, RunCount: 6, CreatedOn: this.iso(20) },
    ];

    // ---- automation
    this.automations = [
      { ID: 1, Name: 'Auto-assign bugs to QA', Description: 'New bugs go straight to the QA lead.', ProjectID: null, Trigger: 'TaskCreated', TriggerValue: '',
        Conditions: [{ Field: 'Label', Operator: 'contains', Value: 'Bug' }], Actions: [{ Type: 'AssignTo', Value: '5' }, { Type: 'SetPriority', Value: 'High' }],
        Enabled: true, CreatedBy: 'Aarav Sharma', CreatedOn: this.iso(50), Runs7d: 14, LastRunOn: this.iso(0, 9, 12), LastRunStatus: 'Success' },
      { ID: 2, Name: 'Notify manager on overdue', Description: 'Escalate overdue work to the PM.', ProjectID: null, Trigger: 'TaskOverdue', TriggerValue: '',
        Conditions: [{ Field: 'Priority', Operator: 'is not', Value: 'Low' }], Actions: [{ Type: 'NotifyRole', Value: 'Project Manager' }],
        Enabled: true, CreatedBy: 'Neha Gupta', CreatedOn: this.iso(40), Runs7d: 9, LastRunOn: this.iso(0, 8), LastRunStatus: 'Failed' },
      { ID: 3, Name: 'Send to QA on review', Description: '', ProjectID: 2, Trigger: 'StatusChanged', TriggerValue: 'In Review',
        Conditions: [], Actions: [{ Type: 'AssignTo', Value: '5' }, { Type: 'AddLabel', Value: 'Testing' }, { Type: 'NotifyUser', Value: '5' }],
        Enabled: true, CreatedBy: 'Priya Verma', CreatedOn: this.iso(28), Runs7d: 6, LastRunOn: this.iso(1, 16, 40), LastRunStatus: 'Success' },
      { ID: 4, Name: 'Due date reminder (2 days)', Description: 'Remind assignees before deadlines.', ProjectID: null, Trigger: 'DueApproaching', TriggerValue: '2',
        Conditions: [{ Field: 'Status', Operator: 'is not', Value: 'Done' }], Actions: [{ Type: 'NotifyUser', Value: 'Assignee' }],
        Enabled: true, CreatedBy: 'Aarav Sharma', CreatedOn: this.iso(20), Runs7d: 22, LastRunOn: this.iso(0, 7), LastRunStatus: 'Success' },
      { ID: 5, Name: 'Escalate critical CRM tasks', Description: '', ProjectID: 1, Trigger: 'FieldChanged', TriggerValue: 'Priority',
        Conditions: [{ Field: 'Priority', Operator: 'is', Value: 'Critical' }], Actions: [{ Type: 'NotifyRole', Value: 'Super Admin' }, { Type: 'MoveToSprint', Value: 'Current sprint' }],
        Enabled: false, CreatedBy: 'Rohit Mehta', CreatedOn: this.iso(15), Runs7d: 0, LastRunOn: this.iso(11, 13), LastRunStatus: 'Skipped' },
      { ID: 6, Name: 'Follow-up on mention', Description: '', ProjectID: null, Trigger: 'CommentMention', TriggerValue: '',
        Conditions: [], Actions: [{ Type: 'CreateSubtask', Value: 'Reply to mention' }],
        Enabled: true, CreatedBy: 'Sneha Iyer', CreatedOn: this.iso(9), Runs7d: 4, LastRunOn: this.iso(2, 12, 5), LastRunStatus: 'Success' },
    ];
    const items = ['CRM-4 Invoice PDF export', 'CRM-7 Login rate limiting', 'HRM-3 Offline attendance sync', 'DWH-2 Sales fact table', 'NMS-5 SNMP poller',
      'SDA-1 Lead scoring', 'CRM-2 Ticket SLA timer', 'HRM-6 Push notifications', 'DWH-5 Nightly ETL', 'SDA-4 Quote approval'];
    const failMsg = ['Assignee not found in project', 'Notification channel timed out', 'Sprint is closed', 'Permission denied for rule owner'];
    let runId = 1;
    for (let d = 0; d < 7; d++) {
      this.automations.filter(r => r.ID !== 5).forEach((r, i) => {
        const count = (r.ID + d) % 3;
        for (let k = 0; k < count; k++) {
          const failed = (r.ID === 2 && d === 0 && k === 0) || (runId % 11 === 0);
          const skipped = !failed && runId % 13 === 0;
          this.runs.push({
            ID: runId, RuleID: r.ID, RuleName: r.Name, RunOn: this.iso(d, 7 + ((runId * 3) % 11), (runId * 7) % 60),
            Item: items[(runId + i) % items.length], Result: failed ? 'Failed' : skipped ? 'Skipped' : 'Success',
            DurationMs: 80 + ((runId * 137) % 900) + (failed ? 3000 : 0),
            Message: failed ? failMsg[runId % failMsg.length] : skipped ? 'Conditions not met' : `${r.Actions.length} action(s) executed`
          });
          runId++;
        }
      });
    }

    // ---- recycle bin (mock items)
    const del = (ID: number, Type: DeletedItemType, Name: string, Location: string, by: number, daysAgo: number): DeletedItem =>
      ({ ID, Type, Name, Location, DeletedBy: userName(by), DeletedOn: this.iso(daysAgo, 9 + (ID % 8), (ID * 13) % 60), RefID: null });
    this.deleted = [
      del(1, 'Task', 'CRM-21 Legacy report migration', 'CRM Portal Revamp', 3, 1),
      del(2, 'Task', 'HRM-14 Dark mode toggle', 'HRMS Mobile App', 2, 4),
      del(3, 'Document', 'Old pricing sheet.xlsx', 'Documents / Finance', 1, 6),
      del(4, 'Comment', '"Can we push this to next sprint?"', 'CRM-5 Partner search API', 6, 2),
      del(5, 'View', 'Temp – blocked tasks', 'Saved views · Tasks', 5, 9),
      del(6, 'Project', 'Intranet Chatbot POC', 'Projects', 1, 27),
      del(7, 'Task', 'DWH-9 Duplicate customer cleanup', 'Data Warehouse Setup', 8, 12),
      del(8, 'Document', 'Draft SOW v1.docx', 'Documents / Projects / CRM Portal Revamp', 6, 18),
      del(9, 'Comment', '"Attached the logs from staging"', 'NMS-3 Alert thresholds', 7, 22),
      del(10, 'Task', 'SDA-8 Excel import (deprecated)', 'Sales Desk Automation', 3, 29),
      del(11, 'Document', 'Logo-old.png', 'Documents / Design System', 4, 15),
      del(12, 'View', 'Q2 deadlines', 'Saved views · Tasks', 1, 25),
    ];

    // ---- help articles
    const art = (ID: number, CategoryKey: string, Title: string, Summary: string, Sections: { Heading: string; Body: string[] }[],
      Tags: string[], Views: number, Popular = false, daysAgo = 10): HelpArticle =>
      ({ ID, CategoryKey, Title, Summary, Sections, Tags, Views, Popular, UpdatedOn: daysFromToday(-daysAgo), ReadMinutes: Math.max(2, Sections.length + 1), HelpfulYes: Math.round(Views / 9), HelpfulNo: Math.round(Views / 70) });
    this.articles = [
      art(1, 'getting-started', 'Set up your workspace in 10 minutes', 'A quick tour of the first steps: profile, team, first project and first tasks.', [
        { Heading: 'Complete your profile', Body: ['Open your avatar menu and choose Profile. Add a photo, designation and working hours so teammates know when you are available.'] },
        { Heading: 'Invite your team', Body: ['Go to Team › People and click Invite member. Choose a role for each person; you can change roles at any time.', 'Invitations expire after 7 days and can be resent.'] },
        { Heading: 'Create the first project', Body: ['From Projects click Create Project, fill in the name, manager, dates and budget. Members can be added now or later.'] },
        { Heading: 'Add tasks', Body: ['Open the project and create tasks from the Tasks screen. Use the board view to move work through To Do, In Progress, In Review and Done.'] },
      ], ['setup', 'onboarding', 'invite'], 4820, true, 5),
      art(2, 'getting-started', 'Understanding roles and permissions', 'What the Super Admin, Admins, Project Managers, Members and Viewers can do.', [
        { Heading: 'Built-in roles', Body: ['Super Admin (only one per workspace) has full control including billing. Admin manages users and settings. Project Manager manages projects they lead. Member works on tasks. Viewer has read-only access.'] },
        { Heading: 'Changing a role', Body: ['Admins can change roles from Team › People. Changes apply immediately.'] },
      ], ['roles', 'permissions'], 2310, false, 30),
      art(3, 'projects', 'Create and plan a project', 'Define scope, milestones, members and budget for a new project.', [
        { Heading: 'Project basics', Body: ['Each project has a unique code, a manager, start and end dates and an optional budget.'] },
        { Heading: 'Milestones', Body: ['Use milestones to mark key deliveries. The timeline view shows milestones on a Gantt chart.'] },
        { Heading: 'Members and allocation', Body: ['Add members with a role and allocation percentage to see workload across projects.'] },
      ], ['project', 'milestones', 'budget'], 3920, true, 12),
      art(4, 'projects', 'Archive, restore and delete projects', 'Keep your project list clean without losing history.', [
        { Heading: 'Archiving', Body: ['Archived projects are read-only and hidden from active lists. Restore them from Projects › Archived or from the Recycle Bin.'] },
        { Heading: 'Deleting', Body: ['Deleted items stay in the Recycle Bin for 30 days before they are purged permanently.'] },
      ], ['archive', 'restore', 'recycle bin'], 1580, false, 8),
      art(5, 'tasks', 'Using list, board and calendar views', 'Switch views to plan, track and reschedule work.', [
        { Heading: 'List view', Body: ['Sort and filter tasks, change status inline and open the detail drawer with a click.'] },
        { Heading: 'Board view', Body: ['Drag cards between columns to change status. Quick-add creates a task directly in a column.'] },
        { Heading: 'Calendar view', Body: ['Drag a task to another day to reschedule its due date.'] },
      ], ['board', 'kanban', 'calendar'], 5210, true, 3),
      art(6, 'tasks', 'Recurring tasks', 'Automatically create tasks on a daily, weekly or monthly schedule.', [
        { Heading: 'Create a rule', Body: ['Go to Workspace › Recurring Tasks and click New Rule. Fill in the task template and choose a schedule.'] },
        { Heading: 'Schedules', Body: ['Daily, weekly on selected weekdays, monthly on a day number or on the first/last weekday, or every N days.'] },
        { Heading: 'Run now', Body: ['Use Run now to create the next task immediately, for example when a report is needed early.'] },
      ], ['recurring', 'schedule'], 1890, true, 12),
      art(7, 'tasks', 'Track time on tasks', 'Start a timer or add worklogs manually.', [
        { Heading: 'Timer', Body: ['Open a task and press Start in the Time tab. Stop the timer to create a worklog.'] },
        { Heading: 'Manual worklogs', Body: ['Add a date, duration and note. Logged time is compared with the estimate.'] },
      ], ['time', 'worklog', 'timer'], 2740, false, 20),
      art(8, 'agile', 'Plan a sprint', 'Move stories from the backlog into a time-boxed sprint.', [
        { Heading: 'Backlog grooming', Body: ['Estimate stories with story points and order them by priority.'] },
        { Heading: 'Start the sprint', Body: ['Pick a goal, start and end dates, then drag stories into the sprint.'] },
        { Heading: 'Burndown', Body: ['The burndown chart compares remaining points with the ideal line.'] },
      ], ['sprint', 'scrum', 'backlog'], 2210, true, 15),
      art(9, 'agile', 'Story points and velocity', 'Estimate relative effort and forecast capacity.', [
        { Heading: 'Story points', Body: ['Use the Fibonacci scale (1, 2, 3, 5, 8, 13) to estimate relative complexity.'] },
        { Heading: 'Velocity', Body: ['Velocity is the average number of points completed per sprint over the last three sprints.'] },
      ], ['velocity', 'estimation'], 1320, false, 40),
      art(10, 'reports', 'Build a workload report', 'See who is over- or under-allocated across projects.', [
        { Heading: 'Choose the period', Body: ['Pick a week or month range and the team to analyse.'] },
        { Heading: 'Read the heatmap', Body: ['Cells above 100% capacity are highlighted in red.'] },
      ], ['workload', 'capacity'], 1460, false, 18),
      art(11, 'reports', 'Export reports to Excel and PDF', 'Share data with stakeholders outside the app.', [
        { Heading: 'Export', Body: ['Every report has an Export button with Excel and PDF options. Exports respect the current filters.'] },
      ], ['export', 'excel', 'pdf'], 1980, true, 25),
      art(12, 'admin', 'Automation rules: WHEN, IF, THEN', 'Automate repetitive work with triggers, conditions and actions.', [
        { Heading: 'Triggers', Body: ['A trigger starts the rule: task created, status changed, due date approaching, task overdue, mention or field changed.'] },
        { Heading: 'Conditions', Body: ['Conditions narrow down which items the rule applies to, e.g. Label contains Bug.'] },
        { Heading: 'Actions', Body: ['Actions run in order: assign, change status, set priority, add label, notify, create subtask or move to sprint.'] },
        { Heading: 'Run history', Body: ['Every execution is logged with its result and duration so failures can be investigated.'] },
      ], ['automation', 'rules', 'workflow'], 2650, true, 3),
      art(13, 'admin', 'Single sign-on and password policy', 'Secure access for your organization.', [
        { Heading: 'Password policy', Body: ['Set minimum length, complexity and expiry from Settings › Security.'] },
        { Heading: 'Sessions', Body: ['Admins can sign out users from all devices.'] },
      ], ['security', 'sso', 'password'], 980, false, 60),
      art(14, 'billing', 'Change your plan', 'Upgrade or downgrade at any time.', [
        { Heading: 'Upgrading', Body: ['Upgrades apply immediately and are prorated for the current billing period.'] },
        { Heading: 'Downgrading', Body: ['Downgrades take effect at the end of the current period.'] },
      ], ['plan', 'subscription'], 870, false, 35),
      art(15, 'billing', 'Download invoices', 'Find and download past invoices.', [
        { Heading: 'Invoices', Body: ['Invoices are available under Billing › Invoices as PDF. They include GST details when configured.'] },
      ], ['invoice', 'gst'], 1120, false, 50),
      art(16, 'getting-started', 'Search everything with global search', 'Find projects, tasks, people, documents and help articles in one place.', [
        { Heading: 'Open search', Body: ['Use the search box in the header or Workspace › Search. Results are grouped by type.'] },
        { Heading: 'Keyboard', Body: ['Use ↑ and ↓ to move through results and Enter to open one.'] },
      ], ['search', 'shortcuts'], 1650, false, 20),
    ];
  }

  /** days since the most recent given weekday (0 = today if it matches) */
  private daysSinceWeekday(wd: number): number {
    return (new Date().getDay() - wd + 7) % 7;
  }
}
