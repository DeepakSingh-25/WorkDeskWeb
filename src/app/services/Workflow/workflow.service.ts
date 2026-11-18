import { Injectable } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  ApprovalRequest, ApprovalStep, BusinessHours, CustomField, FormLayout, SlaKpis, SlaPolicy, TransitionRule,
  WfEdge, WfNode, Workflow, WorkflowEntity, WorkflowState, WorkflowStatusDef
} from '../../Interface/workflow';
import { CURRENT_USER_ID, daysFromToday, userName } from '../Shared/mock-directory';

/**
 * Workflow & Approval service (workflows, statuses/transitions, approvals, SLA, custom fields & forms).
 *
 * NOTE: OM-API me abhi Workflow endpoints nahi hain, isliye ye service in-memory mock data use karti hai
 * (page refresh par reset). Method shapes TaskService jaise hain (Observable + { Status }) — API aane par
 * sirf body ko http call se replace karna hai.
 */
@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private latency = 200;
  readonly currentUserID = CURRENT_USER_ID;
  readonly entities: WorkflowEntity[] = ['Task', 'Bug', 'Leave request', 'Expense', 'Change request'];

  private workflows: Workflow[] = [];
  private statuses: WorkflowStatusDef[] = [];
  private transitions: { [workflowID: number]: TransitionRule[] } = {};
  private approvals: ApprovalRequest[] = [];
  private slaPolicies: SlaPolicy[] = [];
  private businessHours: BusinessHours = { WorkingDays: [], Start: '09:00', End: '18:00', Timezone: 'Asia/Kolkata (IST)', Holidays: [] };
  private fields: CustomField[] = [];
  private layouts: FormLayout[] = [];

  constructor() {
    this.seed();
  }

  // ================= Workflows =================

  getWorkflows(): Observable<Workflow[]> {
    return this.respond(this.workflows.map(w => this.clone(w)));
  }

  getWorkflow(ID: number): Observable<Workflow | null> {
    const w = this.workflows.find(x => x.ID === ID);
    return this.respond(w ? this.clone(w) : null);
  }

  /** Save (draft) or publish (bumps version and activates). Returns the saved workflow. */
  saveWorkflow(wf: Workflow, publish: boolean): Observable<{ Status: string; Workflow: Workflow }> {
    const copy = this.clone(wf);
    copy.UpdatedByID = this.currentUserID;
    copy.UpdatedOn = new Date().toISOString();
    const existing = this.workflows.find(x => x.ID === copy.ID);
    if (publish) {
      copy.Version = (existing?.Version || 0) + 1;
      copy.Status = 'Active';
    } else if (!existing) {
      copy.Status = 'Draft';
      copy.Version = 0;
    }
    if (existing) {
      Object.assign(existing, copy);
    } else {
      copy.ID = this.nextId(this.workflows);
      this.workflows.push(copy);
    }
    const msg = publish ? `Workflow Published Successfully (v${copy.Version})...`
      : existing ? 'Workflow Updated Successfully...' : 'Workflow Added Successfully...';
    return this.respond({ Status: msg, Workflow: this.clone(copy) });
  }

  duplicateWorkflow(ID: number): Observable<{ Status: string; Workflow: Workflow }> {
    const src = this.workflows.find(x => x.ID === ID);
    if (!src) return throwError(() => ({ status: 404 }));
    const copy = this.clone(src);
    copy.ID = this.nextId(this.workflows);
    copy.Name = `${src.Name} (copy)`;
    copy.Status = 'Draft';
    copy.Version = 0;
    copy.ProjectIDs = [];
    copy.UpdatedByID = this.currentUserID;
    copy.UpdatedOn = new Date().toISOString();
    this.workflows.push(copy);
    return this.respond({ Status: 'Workflow Added Successfully...', Workflow: this.clone(copy) });
  }

  setWorkflowStatus(ID: number, Status: WorkflowState): Observable<{ Status: string }> {
    const w = this.workflows.find(x => x.ID === ID);
    if (w) {
      w.Status = Status;
      w.UpdatedByID = this.currentUserID;
      w.UpdatedOn = new Date().toISOString();
    }
    return this.respond({ Status: 'Workflow Updated Successfully...' });
  }

  deleteWorkflow(ID: number): Observable<{ Status: string }> {
    const w = this.workflows.find(x => x.ID === ID);
    if (w && w.ProjectIDs.length) {
      return throwError(() => ({ status: 409, message: 'Workflow is in use by projects' }));
    }
    this.workflows = this.workflows.filter(x => x.ID !== ID);
    delete this.transitions[ID];
    return this.respond({ Status: 'Workflow Deleted Successfully!' });
  }

  // ================= Statuses & transitions =================

  getStatuses(): Observable<WorkflowStatusDef[]> {
    const list = [...this.statuses].sort((a, b) => a.SortOrder - b.SortOrder)
      .map(s => ({ ...s, UsedBy: this.statusUsage(s.Name) }));
    return this.respond(list);
  }

  saveStatus(s: WorkflowStatusDef): Observable<{ Status: string }> {
    const existing = this.statuses.find(x => x.ID === s.ID);
    const { UsedBy, ...data } = s;
    if (existing) {
      // keep designer step names in sync when a status is renamed
      if (existing.Name !== data.Name) {
        this.workflows.forEach(w => w.Nodes.forEach(n => {
          if (n.Type === 'Step' && n.Name.toLowerCase() === existing.Name.toLowerCase()) n.Name = data.Name;
        }));
      }
      Object.assign(existing, data);
      return this.respond({ Status: 'Status Updated Successfully...' });
    }
    this.statuses.push({ ...data, ID: this.nextId(this.statuses), SortOrder: this.statuses.length + 1 });
    return this.respond({ Status: 'Status Added Successfully...' });
  }

  deleteStatus(ID: number): Observable<{ Status: string }> {
    const s = this.statuses.find(x => x.ID === ID);
    if (s && this.statusUsage(s.Name) > 0) return throwError(() => ({ status: 409 }));
    this.statuses = this.statuses.filter(x => x.ID !== ID);
    Object.keys(this.transitions).forEach(k => {
      const key = Number(k);
      this.transitions[key] = this.transitions[key].filter(t => t.FromID !== ID && t.ToID !== ID);
    });
    return this.respond({ Status: 'Status Deleted Successfully!' });
  }

  reorderStatuses(IDs: number[]): Observable<{ Status: string }> {
    IDs.forEach((ID, i) => {
      const s = this.statuses.find(x => x.ID === ID);
      if (s) s.SortOrder = i + 1;
    });
    return this.respond({ Status: 'Status Updated Successfully...' });
  }

  /** Statuses referenced by Step nodes of a workflow (in canvas order). */
  workflowStatusIDs(wf: Workflow): number[] {
    const steps = wf.Nodes.filter(n => n.Type === 'Step').sort((a, b) => a.X - b.X || a.Y - b.Y);
    const ids: number[] = [];
    steps.forEach(n => {
      const s = this.statuses.find(x => x.Name.toLowerCase() === n.Name.toLowerCase());
      if (s && !ids.includes(s.ID)) ids.push(s.ID);
    });
    return ids;
  }

  getTransitions(workflowID: number): Observable<TransitionRule[]> {
    if (!this.transitions[workflowID]) {
      const wf = this.workflows.find(w => w.ID === workflowID);
      const ids = wf ? this.workflowStatusIDs(wf) : [];
      const list: TransitionRule[] = [];
      for (let i = 0; i < ids.length - 1; i++) {
        list.push({ FromID: ids[i], ToID: ids[i + 1], RequiredFields: [], RoleIDs: [] });
        if (i > 0) list.push({ FromID: ids[i + 1], ToID: ids[i], RequiredFields: ['Comment'], RoleIDs: [] });
      }
      if (list.length) {
        list[list.length - 1].RequiredFields = ['Resolution', 'Comment'];
        list[list.length - 1].RoleIDs = [1, 2, 3];
      }
      this.transitions[workflowID] = list;
    }
    return this.respond(this.transitions[workflowID].map(t => this.clone(t)));
  }

  saveTransitions(workflowID: number, list: TransitionRule[]): Observable<{ Status: string }> {
    this.transitions[workflowID] = list.map(t => this.clone(t));
    return this.respond({ Status: 'Transitions Updated Successfully...' });
  }

  // ================= Approvals =================

  getApprovals(): Observable<ApprovalRequest[]> {
    return this.respond(this.approvals.map(a => this.clone(a)));
  }

  approve(ID: number, comment: string): Observable<{ Status: string }> {
    const a = this.approvals.find(x => x.ID === ID);
    if (a && a.Status === 'Pending') this.approveOne(a, comment);
    return this.respond({ Status: 'Request Approved Successfully...' });
  }

  bulkApprove(IDs: number[]): Observable<{ Status: string }> {
    IDs.forEach(ID => {
      const a = this.approvals.find(x => x.ID === ID);
      if (a && a.Status === 'Pending') this.approveOne(a, 'Bulk approved');
    });
    return this.respond({ Status: `${IDs.length} Request(s) Approved Successfully...` });
  }

  reject(ID: number, reason: string): Observable<{ Status: string }> {
    const a = this.approvals.find(x => x.ID === ID);
    if (a && a.Status === 'Pending') {
      const now = new Date().toISOString();
      const step = a.Timeline.find(s => s.Status === 'Pending');
      if (step) { step.Status = 'Rejected'; step.On = now; step.Comment = reason; step.ApproverID = this.currentUserID; step.ApproverLabel = userName(this.currentUserID); }
      a.Status = 'Rejected';
      a.RejectReason = reason;
      a.DecidedOn = now;
      a.ApproverID = null;
    }
    return this.respond({ Status: 'Request Rejected Successfully...' });
  }

  delegate(ID: number, userID: number, note: string): Observable<{ Status: string }> {
    const a = this.approvals.find(x => x.ID === ID);
    if (a && a.Status === 'Pending') {
      const step = a.Timeline.find(s => s.Status === 'Pending');
      const now = new Date().toISOString();
      if (step) {
        a.Timeline.splice(a.Timeline.indexOf(step), 0, {
          Step: step.Step, Name: step.Name, ApproverID: this.currentUserID, ApproverLabel: userName(this.currentUserID),
          Status: 'Delegated', On: now, Comment: `Delegated to ${userName(userID)}${note ? ' — ' + note : ''}`
        });
        step.ApproverID = userID;
        step.ApproverLabel = userName(userID);
      }
      a.ApproverID = userID;
    }
    return this.respond({ Status: 'Request Delegated Successfully...' });
  }

  addApprovalComment(ID: number, text: string): Observable<{ Status: string }> {
    const a = this.approvals.find(x => x.ID === ID);
    if (a) a.Comments.push({ UserID: this.currentUserID, Text: text, On: new Date().toISOString() });
    return this.respond({ Status: 'Comment Added Successfully...' });
  }

  private approveOne(a: ApprovalRequest, comment: string) {
    const now = new Date().toISOString();
    const step = a.Timeline.find(s => s.Status === 'Pending');
    if (step) {
      step.Status = 'Approved'; step.On = now; step.Comment = comment;
      step.ApproverID = this.currentUserID; step.ApproverLabel = userName(this.currentUserID);
    }
    const next = a.Timeline.find(s => s.Status === 'Waiting');
    if (next) {
      next.Status = 'Pending';
      a.CurrentStep = Math.min(a.TotalSteps, a.CurrentStep + 1);
      a.ApproverID = next.ApproverID;
    } else {
      a.Status = 'Approved';
      a.CurrentStep = a.TotalSteps;
      a.DecidedOn = now;
      a.ApproverID = null;
    }
  }

  // ================= SLA =================

  getSlaPolicies(): Observable<SlaPolicy[]> {
    return this.respond(this.slaPolicies.map(p => this.clone(p)));
  }

  saveSlaPolicy(p: SlaPolicy): Observable<{ Status: string }> {
    const existing = this.slaPolicies.find(x => x.ID === p.ID);
    if (existing) {
      Object.assign(existing, this.clone(p));
      return this.respond({ Status: 'SLA Policy Updated Successfully...' });
    }
    this.slaPolicies.push({ ...this.clone(p), ID: this.nextId(this.slaPolicies) });
    return this.respond({ Status: 'SLA Policy Added Successfully...' });
  }

  deleteSlaPolicy(ID: number): Observable<{ Status: string }> {
    this.slaPolicies = this.slaPolicies.filter(x => x.ID !== ID);
    return this.respond({ Status: 'SLA Policy Deleted Successfully!' });
  }

  getBusinessHours(): Observable<BusinessHours> {
    return this.respond(this.clone(this.businessHours));
  }

  saveBusinessHours(b: BusinessHours): Observable<{ Status: string }> {
    this.businessHours = this.clone(b);
    return this.respond({ Status: 'Business Hours Updated Successfully...' });
  }

  getSlaKpis(): Observable<SlaKpis> {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const pending = this.approvals.filter(a => a.Status === 'Pending');
    const atRisk = pending.filter(a => {
      const left = new Date(a.DueOn).getTime() - now;
      return left > 0 && left <= 8 * 3600000;
    }).length;
    const breachedPending = pending.filter(a => new Date(a.DueOn).getTime() < now && new Date(a.DueOn).getTime() >= weekAgo).length;
    const decided = this.approvals.filter(a => a.Status !== 'Pending' && a.DecidedOn);
    const breachedDecided = decided.filter(a => a.DecidedOn! > a.DueOn && new Date(a.DecidedOn!).getTime() >= weekAgo).length;
    const onTime = decided.filter(a => a.DecidedOn! <= a.DueOn).length;
    const overduePending = pending.filter(a => new Date(a.DueOn).getTime() < now).length;
    const base = decided.length + overduePending;
    return this.respond({
      AtRisk: atRisk,
      BreachedThisWeek: breachedPending + breachedDecided,
      Compliance: base ? Math.round(onTime / base * 100) : 100,
      ActivePolicies: this.slaPolicies.filter(p => p.Active).length,
    });
  }

  // ================= Custom fields & forms =================

  getCustomFields(): Observable<CustomField[]> {
    return this.respond(this.fields.map(f => this.clone(f)));
  }

  saveCustomField(f: CustomField): Observable<{ Status: string }> {
    const existing = this.fields.find(x => x.ID === f.ID);
    if (existing) {
      Object.assign(existing, this.clone(f));
      return this.respond({ Status: 'Field Updated Successfully...' });
    }
    this.fields.push({ ...this.clone(f), ID: this.nextId(this.fields) });
    return this.respond({ Status: 'Field Added Successfully...' });
  }

  deleteCustomField(ID: number): Observable<{ Status: string }> {
    this.fields = this.fields.filter(x => x.ID !== ID);
    this.layouts.forEach(l => l.Rows.forEach(r => r.Cells = r.Cells.map(c => c && c.FieldID === ID ? null : c)));
    return this.respond({ Status: 'Field Deleted Successfully!' });
  }

  getFormLayout(entity: WorkflowEntity): Observable<FormLayout> {
    const l = this.layouts.find(x => x.Entity === entity);
    return this.respond(l ? this.clone(l) : { Entity: entity, Rows: [], UpdatedOn: null });
  }

  saveFormLayout(layout: FormLayout): Observable<{ Status: string }> {
    const copy = this.clone(layout);
    copy.UpdatedOn = new Date().toISOString();
    this.layouts = this.layouts.filter(x => x.Entity !== layout.Entity);
    this.layouts.push(copy);
    return this.respond({ Status: 'Form Layout Updated Successfully...' });
  }

  // ================= helpers =================

  private statusUsage(name: string): number {
    const n = name.toLowerCase();
    return this.workflows.filter(w => w.Status !== 'Archived' && w.Nodes.some(x => x.Type === 'Step' && x.Name.toLowerCase() === n)).length;
  }

  private respond<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }

  private clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

  private nextId(list: { ID: number }[]): number {
    return list.reduce((m, x) => Math.max(m, x.ID), 0) + 1;
  }

  private hoursFromNow(h: number): string {
    return new Date(Date.now() + h * 3600000).toISOString();
  }

  // ================= seed =================

  private seed() {
    const n = (ID: string, Type: WfNode['Type'], Name: string, X: number, Y: number, extra: Partial<WfNode> = {}): WfNode =>
      ({ ID, Type, Name, X, Y, ...extra });
    let eid = 0;
    const e = (From: string, To: string, Label = '', Branch: WfEdge['Branch'] = ''): WfEdge => ({ ID: 'e' + (++eid), From, To, Label, Branch });

    this.workflows = [
      {
        ID: 1, Name: 'Bug lifecycle', Description: 'Triage, fix, QA verification and closure of reported defects.',
        AppliesTo: 'Bug', ProjectIDs: [1, 2, 6], Status: 'Active', Version: 4, UpdatedByID: 5, UpdatedOn: this.hoursFromNow(-30),
        Nodes: [
          n('s', 'Start', 'Bug reported', 40, 222),
          n('open', 'Step', 'Open', 220, 210, { Category: 'To Do', SlaHours: 8 }),
          n('sev', 'Condition', 'Severity is Critical?', 460, 210, { Field: 'Priority', Operator: '=', Value: 'Critical' }),
          n('ntf', 'Notification', 'Page on-call lead', 700, 70, { NotifyTarget: 'User', NotifyID: 7, Channel: 'Email + In-app', Message: 'Critical bug {{key}} needs attention.' }),
          n('prog', 'Step', 'In Progress', 940, 210, { Category: 'In Progress', SlaHours: 24 }),
          n('qa', 'Step', 'In QA', 1180, 210, { Category: 'In Progress', SlaHours: 16 }),
          n('sign', 'Approval', 'QA sign-off', 1420, 210, { ApproverType: 'User', ApproverID: 5, ApprovalRule: 'Any', SlaHours: 8 }),
          n('end', 'End', 'Closed', 1680, 222, { Outcome: 'Completed' }),
        ],
        Edges: [
          e('s', 'open'), e('open', 'sev', 'Triage'), e('sev', 'ntf', 'Yes', 'Yes'), e('sev', 'prog', 'No', 'No'),
          e('ntf', 'prog'), e('prog', 'qa', 'Ready for QA'), e('qa', 'sign'), e('sign', 'end', 'Verified'),
        ],
      },
      {
        ID: 2, Name: 'Leave approval', Description: 'Manager approval for all leave; HR approval when longer than 3 days.',
        AppliesTo: 'Leave request', ProjectIDs: [1, 2, 4, 6, 7], Status: 'Active', Version: 2, UpdatedByID: 4, UpdatedOn: this.hoursFromNow(-24 * 6),
        Nodes: [
          n('s', 'Start', 'Leave applied', 40, 202),
          n('sub', 'Step', 'Submitted', 220, 190, { Category: 'To Do' }),
          n('mgr', 'Approval', 'Manager approval', 460, 190, { ApproverType: 'Manager', ApproverID: null, ApprovalRule: 'Any', SlaHours: 24 }),
          n('days', 'Condition', 'More than 3 days?', 700, 190, { Field: 'Days', Operator: '>', Value: '3' }),
          n('hr', 'Approval', 'HR approval', 940, 60, { ApproverType: 'Role', ApproverID: 2, ApprovalRule: 'Any', SlaHours: 24 }),
          n('ntf', 'Notification', 'Notify requester', 1180, 190, { NotifyTarget: 'Requester', Channel: 'Email + In-app', Message: 'Your leave request has been approved.' }),
          n('end', 'End', 'Approved', 1420, 202, { Outcome: 'Approved' }),
        ],
        Edges: [
          e('s', 'sub'), e('sub', 'mgr'), e('mgr', 'days', 'Approved'), e('days', 'hr', 'Yes', 'Yes'),
          e('days', 'ntf', 'No', 'No'), e('hr', 'ntf', 'Approved'), e('ntf', 'end'),
        ],
      },
      {
        ID: 3, Name: 'Change request (CAB)', Description: 'Risk based approval by the Change Advisory Board before production changes.',
        AppliesTo: 'Change request', ProjectIDs: [6], Status: 'Draft', Version: 1, UpdatedByID: 7, UpdatedOn: this.hoursFromNow(-5),
        Nodes: [
          n('s', 'Start', 'Change raised', 40, 222),
          n('draft', 'Step', 'Submitted', 220, 210, { Category: 'To Do' }),
          n('risk', 'Condition', 'Risk is High?', 460, 210, { Field: 'Risk', Operator: '=', Value: 'High' }),
          n('cab', 'Approval', 'CAB approval', 700, 80, { ApproverType: 'Role', ApproverID: 3, ApprovalRule: 'All', SlaHours: 48 }),
          n('lead', 'Approval', 'Team lead approval', 700, 340, { ApproverType: 'Manager', ApproverID: null, ApprovalRule: 'Any', SlaHours: 24 }),
          n('sch', 'Step', 'Scheduled', 940, 210, { Category: 'In Progress' }),
          n('impl', 'Step', 'Implemented', 1180, 210, { Category: 'Done' }),
          n('ntf', 'Notification', 'Notify stakeholders', 1420, 210, { NotifyTarget: 'Role', NotifyID: 3, Channel: 'Email', Message: 'Change {{key}} implemented.' }),
          n('end', 'End', 'Closed', 1660, 222, { Outcome: 'Completed' }),
        ],
        Edges: [
          e('s', 'draft'), e('draft', 'risk'), e('risk', 'cab', 'Yes', 'Yes'), e('risk', 'lead', 'No', 'No'),
          e('cab', 'sch', 'Approved'), e('lead', 'sch', 'Approved'), e('sch', 'impl', 'Deployed'), e('impl', 'ntf'), e('ntf', 'end'),
        ],
      },
      {
        ID: 4, Name: 'Standard task flow', Description: 'Default delivery flow used by project tasks.',
        AppliesTo: 'Task', ProjectIDs: [1, 2, 4, 7], Status: 'Active', Version: 6, UpdatedByID: 1, UpdatedOn: this.hoursFromNow(-24 * 12),
        Nodes: [
          n('s', 'Start', 'Task created', 40, 152),
          n('todo', 'Step', 'To Do', 220, 140, { Category: 'To Do' }),
          n('prog', 'Step', 'In Progress', 460, 140, { Category: 'In Progress' }),
          n('rev', 'Step', 'In Review', 700, 140, { Category: 'In Progress', SlaHours: 24 }),
          n('end', 'End', 'Done', 940, 152, { Outcome: 'Completed' }),
        ],
        Edges: [e('s', 'todo'), e('todo', 'prog', 'Start work'), e('prog', 'rev', 'Submit'), e('rev', 'end', 'Approve')],
      },
      {
        ID: 5, Name: 'Expense claim (legacy)', Description: 'Old single-level expense approval. Replaced by finance tool.',
        AppliesTo: 'Expense', ProjectIDs: [], Status: 'Archived', Version: 3, UpdatedByID: 6, UpdatedOn: this.hoursFromNow(-24 * 45),
        Nodes: [
          n('s', 'Start', 'Claim submitted', 40, 152),
          n('mgr', 'Approval', 'Manager approval', 220, 140, { ApproverType: 'Manager', ApproverID: null, ApprovalRule: 'Any', SlaHours: 48 }),
          n('end', 'End', 'Reimbursed', 460, 152, { Outcome: 'Approved' }),
        ],
        Edges: [e('s', 'mgr'), e('mgr', 'end', 'Approved')],
      },
    ];

    const st = (ID: number, Name: string, Category: WorkflowStatusDef['Category'], Color: string, Description: string): WorkflowStatusDef =>
      ({ ID, Name, Category, Color, Description, SortOrder: ID });
    this.statuses = [
      st(1, 'Open', 'To Do', '#8A94A6', 'Newly reported, waiting for triage.'),
      st(2, 'Submitted', 'To Do', '#5B6475', 'Request submitted and waiting for approval.'),
      st(3, 'To Do', 'To Do', '#8A94A6', 'Planned work that has not started.'),
      st(4, 'In Progress', 'In Progress', '#0043E0', 'Actively being worked on.'),
      st(5, 'In Review', 'In Progress', '#7A3FE4', 'Waiting for code / peer review.'),
      st(6, 'In QA', 'In Progress', '#C77800', 'Under verification by QA.'),
      st(7, 'Blocked', 'In Progress', '#E0401C', 'Cannot proceed because of a dependency.'),
      st(8, 'Scheduled', 'In Progress', '#1A9BB5', 'Approved and scheduled for a change window.'),
      st(9, 'Implemented', 'Done', '#029848', 'Change applied to production.'),
      st(10, 'Closed', 'Done', '#2E7D4F', 'Work finished and verified.'),
      st(11, 'Rejected', 'Done', '#FB6240', 'Request declined.'),
    ];

    // ---- approvals ----
    const steps = (list: [string, number | null, string, ApprovalStep['Status'], number | null, string?][]): ApprovalStep[] =>
      list.map((s, i) => ({
        Step: i + 1, Name: s[0], ApproverID: s[1], ApproverLabel: s[2], Status: s[3],
        On: s[4] === null ? null : this.hoursFromNow(s[4]), Comment: s[5] || ''
      }));
    const A = (o: Partial<ApprovalRequest> & Pick<ApprovalRequest, 'ID' | 'Type' | 'Title' | 'RequesterID'>): ApprovalRequest => ({
      Key: 'APR-' + (1040 + o.ID), ApproverID: CURRENT_USER_ID, SubmittedOn: this.hoursFromNow(-20), DueOn: this.hoursFromNow(4), DecidedOn: null,
      Priority: 'Medium', WorkflowID: 2, WorkflowName: 'Leave approval', CurrentStep: 1, TotalSteps: 2, Status: 'Pending',
      Fields: [], Attachments: [], Timeline: [], Comments: [], ...o,
    } as ApprovalRequest);
    const me = userName(CURRENT_USER_ID);

    this.approvals = [
      A({
        ID: 1, Type: 'Leave request', Title: 'Annual leave — family function (5 days)', RequesterID: 2, Priority: 'Medium',
        SubmittedOn: this.hoursFromNow(-26), DueOn: this.hoursFromNow(-2), TotalSteps: 2,
        Fields: [{ Label: 'Leave type', Value: 'Annual leave' }, { Label: 'From', Value: daysFromToday(6) }, { Label: 'To', Value: daysFromToday(10) },
          { Label: 'Days', Value: '5' }, { Label: 'Backup', Value: 'Rohit Mehta' }, { Label: 'Reason', Value: 'Sister’s wedding in Nagpur.' }],
        Timeline: steps([['Submitted', 2, 'Priya Verma', 'Submitted', -26], ['Manager approval', 1, me, 'Pending', null], ['HR approval', null, 'Admin (role)', 'Waiting', null]]),
        Comments: [{ UserID: 2, Text: 'Mobile sprint handover is planned with Rohit.', On: this.hoursFromNow(-25) }],
      }),
      A({
        ID: 2, Type: 'Expense', Title: 'Client visit travel — Pune (₹18,450)', RequesterID: 3, Priority: 'High', WorkflowID: 5, WorkflowName: 'Expense claim (legacy)',
        SubmittedOn: this.hoursFromNow(-9), DueOn: this.hoursFromNow(3), TotalSteps: 2,
        Fields: [{ Label: 'Category', Value: 'Travel' }, { Label: 'Amount', Value: '₹18,450' }, { Label: 'Project', Value: 'CRM Portal Revamp' }, { Label: 'Billable', Value: 'Yes' }],
        Attachments: [{ Name: 'train-ticket.pdf', Size: 182000 }, { Name: 'hotel-invoice.pdf', Size: 412000 }, { Name: 'cab-receipts.jpg', Size: 1260000 }],
        Timeline: steps([['Submitted', 3, 'Rohit Mehta', 'Submitted', -9], ['Manager approval', 1, me, 'Pending', null], ['Finance', 6, 'Neha Gupta', 'Waiting', null]]),
      }),
      A({
        ID: 3, Type: 'Change request', Title: 'Firewall rule change for NMS collectors', RequesterID: 7, Priority: 'Critical', WorkflowID: 3, WorkflowName: 'Change request (CAB)',
        SubmittedOn: this.hoursFromNow(-6), DueOn: this.hoursFromNow(1.5), CurrentStep: 2, TotalSteps: 3,
        Fields: [{ Label: 'Risk', Value: 'High' }, { Label: 'Change window', Value: daysFromToday(2) + ' 23:00–01:00' }, { Label: 'Rollback plan', Value: 'Restore previous ACL snapshot' },
          { Label: 'Affected systems', Value: 'NMS collectors, Core switch' }],
        Attachments: [{ Name: 'acl-diff.txt', Size: 4200 }, { Name: 'impact-analysis.docx', Size: 86000 }],
        Timeline: steps([['Submitted', 7, 'Vikram Singh', 'Submitted', -6], ['CAB — Project Manager', 6, 'Neha Gupta', 'Approved', -3, 'Looks fine, please share the rollback runbook.'],
          ['CAB — Owner', 1, me, 'Pending', null]]),
      }),
      A({
        ID: 4, Type: 'Bug', Title: 'Hotfix release approval — payment timeout (CRM-142)', RequesterID: 5, Priority: 'High', WorkflowID: 1, WorkflowName: 'Bug lifecycle',
        SubmittedOn: this.hoursFromNow(-3), DueOn: this.hoursFromNow(5), CurrentStep: 1, TotalSteps: 1,
        Fields: [{ Label: 'Severity', Value: 'High' }, { Label: 'Build', Value: '2.14.3-hotfix' }, { Label: 'Test cases passed', Value: '48 / 48' }],
        Attachments: [{ Name: 'regression-report.xlsx', Size: 54000 }],
        Timeline: steps([['Submitted', 5, 'Karan Patel', 'Submitted', -3], ['Release approval', 1, me, 'Pending', null]]),
      }),
      A({
        ID: 5, Type: 'Task', Title: 'Scope change — add WhatsApp notifications to Sales Desk', RequesterID: 6, Priority: 'Low', WorkflowID: 4, WorkflowName: 'Standard task flow',
        SubmittedOn: this.hoursFromNow(-30), DueOn: this.hoursFromNow(26), TotalSteps: 1,
        Fields: [{ Label: 'Project', Value: 'Sales Desk Automation' }, { Label: 'Estimate', Value: '40h' }, { Label: 'Impact', Value: 'Release moves by 1 week' }],
        Timeline: steps([['Submitted', 6, 'Neha Gupta', 'Submitted', -30], ['Sponsor approval', 1, me, 'Pending', null]]),
      }),
      A({
        ID: 6, Type: 'Leave request', Title: 'Sick leave (1 day)', RequesterID: 8, Priority: 'Medium',
        SubmittedOn: this.hoursFromNow(-50), DueOn: this.hoursFromNow(-26), TotalSteps: 1,
        Fields: [{ Label: 'Leave type', Value: 'Sick leave' }, { Label: 'From', Value: daysFromToday(-2) }, { Label: 'To', Value: daysFromToday(-2) }, { Label: 'Days', Value: '1' }],
        Attachments: [{ Name: 'medical-certificate.pdf', Size: 230000 }],
        Timeline: steps([['Submitted', 8, 'Ananya Rao', 'Submitted', -50], ['Manager approval', 1, me, 'Pending', null]]),
      }),
      A({
        ID: 7, Type: 'Expense', Title: 'Figma team licence renewal ($540)', RequesterID: 4, Priority: 'Medium', WorkflowID: 5, WorkflowName: 'Expense claim (legacy)',
        SubmittedOn: this.hoursFromNow(-12), DueOn: this.hoursFromNow(36), TotalSteps: 2,
        Fields: [{ Label: 'Category', Value: 'Software' }, { Label: 'Amount', Value: '$540 / year' }, { Label: 'Vendor', Value: 'Figma Inc.' }],
        Attachments: [{ Name: 'quote-figma.pdf', Size: 98000 }],
        Timeline: steps([['Submitted', 4, 'Sneha Iyer', 'Submitted', -12], ['Budget owner', 1, me, 'Pending', null], ['Finance', 6, 'Neha Gupta', 'Waiting', null]]),
      }),
      // ---- decided ----
      A({
        ID: 8, Type: 'Leave request', Title: 'Work from home — 2 days', RequesterID: 3, Status: 'Approved', ApproverID: null,
        SubmittedOn: this.hoursFromNow(-72), DueOn: this.hoursFromNow(-48), DecidedOn: this.hoursFromNow(-60), CurrentStep: 1, TotalSteps: 1,
        Fields: [{ Label: 'Leave type', Value: 'Work from home' }, { Label: 'Days', Value: '2' }],
        Timeline: steps([['Submitted', 3, 'Rohit Mehta', 'Submitted', -72], ['Manager approval', 1, me, 'Approved', -60, 'Approved, stay reachable on Slack.']]),
      }),
      A({
        ID: 9, Type: 'Change request', Title: 'Increase DWH nightly job memory', RequesterID: 8, Status: 'Approved', ApproverID: null, Priority: 'High',
        WorkflowID: 3, WorkflowName: 'Change request (CAB)', SubmittedOn: this.hoursFromNow(-100), DueOn: this.hoursFromNow(-76), DecidedOn: this.hoursFromNow(-70),
        CurrentStep: 2, TotalSteps: 2,
        Fields: [{ Label: 'Risk', Value: 'Low' }, { Label: 'Affected systems', Value: 'ETL cluster' }],
        Timeline: steps([['Submitted', 8, 'Ananya Rao', 'Submitted', -100], ['Team lead approval', 7, 'Vikram Singh', 'Approved', -90], ['Owner approval', 1, me, 'Approved', -70]]),
      }),
      A({
        ID: 10, Type: 'Expense', Title: 'Team dinner — sprint 18 celebration', RequesterID: 2, Status: 'Rejected', ApproverID: null, Priority: 'Low',
        WorkflowID: 5, WorkflowName: 'Expense claim (legacy)', SubmittedOn: this.hoursFromNow(-130), DueOn: this.hoursFromNow(-82), DecidedOn: this.hoursFromNow(-110),
        RejectReason: 'Exceeds per-head limit; please resubmit under team engagement budget.',
        Fields: [{ Label: 'Amount', Value: '₹32,000' }, { Label: 'Attendees', Value: '14' }],
        Timeline: steps([['Submitted', 2, 'Priya Verma', 'Submitted', -130], ['Manager approval', 1, me, 'Rejected', -110, 'Exceeds per-head limit; please resubmit under team engagement budget.']]),
      }),
      A({
        ID: 11, Type: 'Bug', Title: 'Waive QA for copy-only fix (HRM-88)', RequesterID: 2, Status: 'Rejected', ApproverID: null,
        WorkflowID: 1, WorkflowName: 'Bug lifecycle', SubmittedOn: this.hoursFromNow(-40), DueOn: this.hoursFromNow(-30), DecidedOn: this.hoursFromNow(-28),
        RejectReason: 'Release policy requires QA sign-off for every build.',
        Timeline: steps([['Submitted', 2, 'Priya Verma', 'Submitted', -40], ['QA lead', 5, 'Karan Patel', 'Rejected', -28, 'Release policy requires QA sign-off for every build.']]),
      }),
      // ---- sent by me ----
      A({
        ID: 12, Type: 'Leave request', Title: 'Conference leave — NG Conf (3 days)', RequesterID: 1, ApproverID: 4, Priority: 'Medium',
        SubmittedOn: this.hoursFromNow(-8), DueOn: this.hoursFromNow(16), TotalSteps: 1,
        Fields: [{ Label: 'Leave type', Value: 'Conference' }, { Label: 'From', Value: daysFromToday(20) }, { Label: 'Days', Value: '3' }],
        Timeline: steps([['Submitted', 1, me, 'Submitted', -8], ['HR approval', 4, 'Sneha Iyer', 'Pending', null]]),
      }),
      A({
        ID: 13, Type: 'Expense', Title: 'Azure reserved instances — FY renewal', RequesterID: 1, ApproverID: null, Status: 'Approved', Priority: 'High',
        SubmittedOn: this.hoursFromNow(-200), DueOn: this.hoursFromNow(-152), DecidedOn: this.hoursFromNow(-160), TotalSteps: 1, CurrentStep: 1, WorkflowID: 5, WorkflowName: 'Expense claim (legacy)',
        Fields: [{ Label: 'Amount', Value: '$12,800' }, { Label: 'Vendor', Value: 'Microsoft' }],
        Timeline: steps([['Submitted', 1, me, 'Submitted', -200], ['Finance', 6, 'Neha Gupta', 'Approved', -160]]),
      }),
    ];

    // ---- SLA ----
    this.slaPolicies = [
      {
        ID: 1, Name: 'Critical bugs', AppliesTo: 'Bug', Priorities: ['Critical'], ResponseHours: 1, ResolutionHours: 8, BusinessHoursOnly: false, Active: true,
        Escalations: [
          { AfterHours: 1, Action: 'Notify', TargetType: 'User', TargetID: 7 },
          { AfterHours: 4, Action: 'Reassign', TargetType: 'Role', TargetID: 3 },
          { AfterHours: 8, Action: 'Notify', TargetType: 'Role', TargetID: 1 },
        ],
      },
      {
        ID: 2, Name: 'High / medium bugs', AppliesTo: 'Bug', Priorities: ['High', 'Medium'], ResponseHours: 4, ResolutionHours: 40, BusinessHoursOnly: true, Active: true,
        Escalations: [{ AfterHours: 8, Action: 'Notify', TargetType: 'Manager', TargetID: null }],
      },
      {
        ID: 3, Name: 'Leave decisions', AppliesTo: 'Leave request', Priorities: ['Low', 'Medium', 'High'], ResponseHours: 8, ResolutionHours: 24, BusinessHoursOnly: true, Active: true,
        Escalations: [{ AfterHours: 4, Action: 'Notify', TargetType: 'Manager', TargetID: null }, { AfterHours: 24, Action: 'Reassign', TargetType: 'Role', TargetID: 2 }],
      },
      {
        ID: 4, Name: 'Expense approvals', AppliesTo: 'Expense', Priorities: ['Medium', 'High'], ResponseHours: 24, ResolutionHours: 48, BusinessHoursOnly: true, Active: false,
        Escalations: [{ AfterHours: 24, Action: 'Raise priority', TargetType: 'Manager', TargetID: null }],
      },
      {
        ID: 5, Name: 'Emergency changes', AppliesTo: 'Change request', Priorities: ['Critical', 'High'], ResponseHours: 2, ResolutionHours: 12, BusinessHoursOnly: false, Active: true,
        Escalations: [{ AfterHours: 2, Action: 'Notify', TargetType: 'Role', TargetID: 3 }, { AfterHours: 6, Action: 'Raise priority', TargetType: 'Manager', TargetID: null }],
      },
    ];
    const year = new Date().getFullYear();
    this.businessHours = {
      WorkingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], Start: '09:30', End: '18:30', Timezone: 'Asia/Kolkata (IST)',
      Holidays: [
        { Date: `${year}-01-26`, Name: 'Republic Day' }, { Date: `${year}-08-15`, Name: 'Independence Day' },
        { Date: `${year}-10-02`, Name: 'Gandhi Jayanti' }, { Date: daysFromToday(8), Name: 'Diwali' }, { Date: `${year}-12-25`, Name: 'Christmas' },
      ],
    };

    // ---- custom fields ----
    const f = (ID: number, Name: string, Key: string, Type: CustomField['Type'], Required: boolean, HelpText: string,
      AppliesTo: WorkflowEntity[], Options: string[] = []): CustomField => ({ ID, Name, Key, Type, Required, HelpText, Options, AppliesTo });
    this.fields = [
      f(1, 'Severity', 'severity', 'Dropdown', true, 'Impact on users.', ['Bug'], ['Critical', 'High', 'Medium', 'Low']),
      f(2, 'Environment', 'environment', 'Multi-select', false, 'Where the issue was observed.', ['Bug'], ['Production', 'Staging', 'QA', 'Local']),
      f(3, 'Steps to reproduce', 'steps_to_reproduce', 'Text', true, 'Numbered list of steps.', ['Bug']),
      f(4, 'Leave type', 'leave_type', 'Dropdown', true, '', ['Leave request'], ['Annual leave', 'Sick leave', 'Work from home', 'Conference', 'Unpaid']),
      f(5, 'From date', 'from_date', 'Date', true, '', ['Leave request']),
      f(6, 'To date', 'to_date', 'Date', true, '', ['Leave request']),
      f(7, 'Backup person', 'backup_person', 'User', false, 'Who covers your work while away.', ['Leave request']),
      f(8, 'Amount', 'amount', 'Number', true, 'In INR, including tax.', ['Expense']),
      f(9, 'Receipt link', 'receipt_link', 'URL', false, 'Link to the scanned receipt.', ['Expense']),
      f(10, 'Billable to client', 'billable_to_client', 'Checkbox', false, '', ['Expense', 'Task']),
      f(11, 'Risk level', 'risk_level', 'Dropdown', true, '', ['Change request'], ['Low', 'Medium', 'High']),
      f(12, 'Change window', 'change_window', 'Date', true, 'Planned implementation date.', ['Change request']),
      f(13, 'Rollback plan', 'rollback_plan', 'Text', true, '', ['Change request']),
      f(14, 'Story points', 'story_points', 'Number', false, 'Fibonacci estimate.', ['Task', 'Bug']),
      f(15, 'Reviewer', 'reviewer', 'User', false, '', ['Task', 'Bug', 'Change request']),
      f(16, 'Reason', 'reason', 'Text', false, '', ['Leave request', 'Expense']),
    ];
    this.layouts = [
      {
        Entity: 'Leave request', UpdatedOn: this.hoursFromNow(-48), Rows: [
          { ID: 'r1', Columns: 1, Cells: [{ FieldID: 4, Required: true }] },
          { ID: 'r2', Columns: 2, Cells: [{ FieldID: 5, Required: true }, { FieldID: 6, Required: true }] },
          { ID: 'r3', Columns: 1, Cells: [{ FieldID: 7, Required: false }] },
          { ID: 'r4', Columns: 1, Cells: [{ FieldID: 16, Required: false }] },
        ],
      },
      {
        Entity: 'Bug', UpdatedOn: this.hoursFromNow(-200), Rows: [
          { ID: 'r1', Columns: 2, Cells: [{ FieldID: 1, Required: true }, { FieldID: 2, Required: false }] },
          { ID: 'r2', Columns: 1, Cells: [{ FieldID: 3, Required: true }] },
        ],
      },
    ];
  }
}
