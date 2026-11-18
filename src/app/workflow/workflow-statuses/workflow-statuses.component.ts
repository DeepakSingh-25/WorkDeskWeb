import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { faGear, faGripVertical, faXmark } from '@fortawesome/free-solid-svg-icons';
import { StatusCategory, TransitionRule, Workflow, WorkflowStatusDef } from '../../Interface/workflow';
import { WorkflowService } from '../../services/Workflow/workflow.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { WorkflowUi } from '../workflow-ui';

/** Custom Status & Transitions (`/workflows/statuses`). */
@Component({
    selector: 'app-workflow-statuses',
    templateUrl: './workflow-statuses.component.html',
    styleUrl: './workflow-statuses.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class WorkflowStatusesComponent implements OnInit {
  ui = WorkflowUi;
  faGrip = faGripVertical;
  faGear = faGear;
  faClose = faXmark;

  private wfService = inject(WorkflowService);
  private notificationsService = inject(NotificationsService);
  private loaderService = inject(LoaderService);
  private fb = inject(FormBuilder);

  categories: StatusCategory[] = ['To Do', 'In Progress', 'Done'];
  swatches = ['#8A94A6', '#5B6475', '#0043E0', '#2B5BD7', '#1A9BB5', '#7A3FE4', '#C2389B', '#C77800', '#ffa529', '#029848', '#2E7D4F', '#FB6240', '#E0401C'];
  coreFields = ['Comment', 'Resolution', 'Assignee', 'Due date', 'Time spent', 'Fix version', 'Attachment'];
  requiredFieldOptions: string[] = [];

  statuses: WorkflowStatusDef[] = [];
  categoryFilter = '';
  dragIndex: number | null = null;
  overIndex: number | null = null;

  workflows: Workflow[] = [];
  workflowID: number | null = null;
  transitions: TransitionRule[] = [];
  showAll = false;
  transitionsDirty = false;
  showMatrix = false;
  showMoreStatus = false;

  drawer: 'status' | 'rule' | null = null;
  statusForm: FormGroup;
  ruleFrom: WorkflowStatusDef | null = null;
  ruleTo: WorkflowStatusDef | null = null;
  ruleRequired: string[] = [];
  ruleRoles: number[] = [];

  constructor() {
    this.statusForm = this.fb.group({
      ID: new FormControl(0),
      txtName: new FormControl('', [Validators.required, Validators.maxLength(30), (c: AbstractControl): ValidationErrors | null => {
        const v = String(c.value || '').trim().toLowerCase();
        const id = this.statusForm?.get('ID')?.value;
        return v && this.statuses.some(s => s.Name.toLowerCase() === v && s.ID !== id) ? { duplicate: true } : null;
      }]),
      drpCategory: new FormControl<StatusCategory>('To Do', [Validators.required]),
      txtColor: new FormControl('#0043E0', [Validators.required]),
      txtDescription: new FormControl('', [Validators.maxLength(200)]),
    });
  }

  ngOnInit() {
    this.loadStatuses();
    this.wfService.getCustomFields().subscribe(f => this.requiredFieldOptions = [...this.coreFields, ...f.map(x => x.Name)]);
    this.wfService.getWorkflows().subscribe(list => {
      this.workflows = list.filter(w => w.Status !== 'Archived');
      if (this.workflows.length) this.selectWorkflow(this.workflows[0].ID);
    });
  }

  loadStatuses() {
    this.wfService.getStatuses().subscribe(s => this.statuses = s);
  }

  get visibleStatuses(): WorkflowStatusDef[] {
    return this.statuses.filter(s => !this.categoryFilter || s.Category === this.categoryFilter);
  }

  catCount(c: string): number {
    return this.statuses.filter(s => !c || s.Category === c).length;
  }

  // ---------- status CRUD ----------

  openStatus(s?: WorkflowStatusDef) {
    this.statusForm.reset({
      ID: s?.ID || 0, txtName: s?.Name || '', drpCategory: s?.Category || 'To Do',
      txtColor: s?.Color || '#0043E0', txtDescription: s?.Description || ''
    });
    this.showMoreStatus = !!s?.Description;
    this.drawer = 'status';
  }

  get editingStatus(): boolean {
    return !!this.statusForm.value.ID;
  }

  pickColor(c: string) {
    this.statusForm.patchValue({ txtColor: c });
    this.statusForm.markAsDirty();
  }

  saveStatus() {
    this.statusForm.markAllAsTouched();
    if (this.statusForm.invalid) return;
    const v = this.statusForm.value;
    const existing = this.statuses.find(s => s.ID === v.ID);
    this.loaderService.showLoader();
    this.wfService.saveStatus({
      ID: v.ID || 0, Name: String(v.txtName).trim(), Category: v.drpCategory, Color: v.txtColor,
      Description: v.txtDescription || '', SortOrder: existing?.SortOrder || 0
    }).subscribe({
      next: res => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('success', res.Status);
        this.drawer = null;
        this.loadStatuses();
      },
      error: () => this.handleError()
    });
  }

  deleteStatus(s: WorkflowStatusDef) {
    if (s.UsedBy) {
      this.notificationsService.showNotification('error', `“${s.Name}” is used by ${s.UsedBy} workflow(s) and cannot be deleted.`);
      return;
    }
    this.notificationsService.showdelete(`Delete status “${s.Name}”?`).then(ok => {
      if (!ok) return;
      this.wfService.deleteStatus(s.ID).subscribe({
        next: () => {
          this.notificationsService.showNotification('success', 'Record Deleted Successfully...');
          this.loadStatuses();
          if (this.workflowID) this.selectWorkflow(this.workflowID);
        },
        error: () => this.handleError()
      });
    });
  }

  // ---------- drag reorder ----------

  onDragStart(i: number, ev: DragEvent) {
    this.dragIndex = i;
    ev.dataTransfer?.setData('text/plain', String(i));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(i: number, ev: DragEvent) {
    if (this.dragIndex === null) return;
    ev.preventDefault();
    this.overIndex = i;
  }

  onDrop(i: number, ev: DragEvent) {
    ev.preventDefault();
    if (this.dragIndex === null || this.dragIndex === i) { this.onDragEnd(); return; }
    const visible = this.visibleStatuses;
    const moving = visible[this.dragIndex], target = visible[i];
    const list = [...this.statuses];
    list.splice(list.indexOf(moving), 1);
    list.splice(list.indexOf(target) + (this.dragIndex < i ? 1 : 0), 0, moving);
    this.statuses = list.map((s, idx) => ({ ...s, SortOrder: idx + 1 }));
    this.onDragEnd();
    this.wfService.reorderStatuses(this.statuses.map(s => s.ID)).subscribe(() =>
      this.notificationsService.showNotification('success', 'Status order updated'));
  }

  onDragEnd() {
    this.dragIndex = null;
    this.overIndex = null;
  }

  // ---------- transitions ----------

  selectWorkflow(ID: number | null) {
    if (this.transitionsDirty && ID !== this.workflowID) {
      this.notificationsService.showConfirm('You have unsaved changes to the allowed moves. Discard them?').then(ok => {
        if (ok) { this.transitionsDirty = false; this.selectWorkflow(ID); }
      });
      return;
    }
    this.workflowID = ID;
    this.transitionsDirty = false;
    if (!ID) { this.transitions = []; return; }
    this.wfService.getTransitions(ID).subscribe(t => this.transitions = t);
  }

  get workflow(): Workflow | undefined {
    return this.workflows.find(w => w.ID === this.workflowID);
  }

  get matrixStatuses(): WorkflowStatusDef[] {
    const wf = this.workflow;
    if (!wf || this.showAll) return this.statuses;
    const ids = this.wfService.workflowStatusIDs(wf);
    const extra = this.transitions.flatMap(t => [t.FromID, t.ToID]).filter(id => !ids.includes(id));
    const all = [...ids, ...Array.from(new Set(extra))];
    const list = all.map(id => this.statuses.find(s => s.ID === id)).filter((s): s is WorkflowStatusDef => !!s);
    return list.length >= 2 ? list : this.statuses;
  }

  rule(from: number, to: number): TransitionRule | undefined {
    return this.transitions.find(t => t.FromID === from && t.ToID === to);
  }

  toggle(from: number, to: number) {
    if (from === to) return;
    const r = this.rule(from, to);
    if (r) this.transitions = this.transitions.filter(t => t !== r);
    else this.transitions = [...this.transitions, { FromID: from, ToID: to, RequiredFields: [], RoleIDs: [] }];
    this.transitionsDirty = true;
  }

  allowAll() {
    const ids = this.matrixStatuses.map(s => s.ID);
    ids.forEach(f => ids.forEach(t => { if (f !== t && !this.rule(f, t)) this.transitions.push({ FromID: f, ToID: t, RequiredFields: [], RoleIDs: [] }); }));
    this.transitions = [...this.transitions];
    this.transitionsDirty = true;
  }

  clearAll() {
    const ids = this.matrixStatuses.map(s => s.ID);
    this.transitions = this.transitions.filter(t => !(ids.includes(t.FromID) && ids.includes(t.ToID)));
    this.transitionsDirty = true;
  }

  get transitionCount(): number {
    const ids = this.matrixStatuses.map(s => s.ID);
    return this.transitions.filter(t => ids.includes(t.FromID) && ids.includes(t.ToID)).length;
  }

  openRule(from: WorkflowStatusDef, to: WorkflowStatusDef, ev: Event) {
    ev.stopPropagation();
    const r = this.rule(from.ID, to.ID);
    if (!r) return;
    this.ruleFrom = from;
    this.ruleTo = to;
    this.ruleRequired = [...r.RequiredFields];
    this.ruleRoles = [...r.RoleIDs];
    this.drawer = 'rule';
  }

  toggleRuleRole(ID: number) {
    this.ruleRoles = this.ruleRoles.includes(ID) ? this.ruleRoles.filter(x => x !== ID) : [...this.ruleRoles, ID];
  }

  applyRule() {
    if (!this.ruleFrom || !this.ruleTo) return;
    const r = this.rule(this.ruleFrom.ID, this.ruleTo.ID);
    if (r) {
      r.RequiredFields = [...this.ruleRequired];
      r.RoleIDs = [...this.ruleRoles];
      this.transitionsDirty = true;
    }
    this.drawer = null;
  }

  removeRuleTransition() {
    if (this.ruleFrom && this.ruleTo) this.toggle(this.ruleFrom.ID, this.ruleTo.ID);
    this.drawer = null;
  }

  ruleTitle(r: TransitionRule): string {
    const parts: string[] = [];
    if (r.RequiredFields.length) parts.push('Requires: ' + r.RequiredFields.join(', '));
    parts.push('Who: ' + (r.RoleIDs.length ? r.RoleIDs.map(id => this.ui.roleName(id)).join(', ') : 'Everyone'));
    return parts.join(' · ');
  }

  saveTransitions() {
    if (!this.workflowID) return;
    this.loaderService.showLoader();
    this.wfService.saveTransitions(this.workflowID, this.transitions).subscribe({
      next: res => {
        this.loaderService.hideLoader();
        this.transitionsDirty = false;
        this.notificationsService.showNotification('success', res.Status);
      },
      error: () => this.handleError()
    });
  }

  resetTransitions() {
    this.transitionsDirty = false;
    this.selectWorkflow(this.workflowID);
  }

  private handleError() {
    this.loaderService.hideLoader();
    this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
  }
}
