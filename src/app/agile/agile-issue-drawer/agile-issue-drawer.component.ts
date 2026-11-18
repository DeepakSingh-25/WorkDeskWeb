import { Component, ChangeDetectionStrategy, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { AcceptanceItem, EpicSummary, Issue, IssueType } from '../../Interface/agile';
import { AgileService } from '../../services/Agile/agile.service';
import { NotificationsService } from '../../services/notifications.service';
import { DirectoryUser } from '../../services/Shared/mock-directory';
import { AgileUi } from '../agile-ui';

/** Right side drawer to view / edit an issue (story, bug or task). */
@Component({
    selector: 'app-agile-issue-drawer',
    templateUrl: './agile-issue-drawer.component.html',
    styleUrl: './agile-issue-drawer.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AgileIssueDrawerComponent implements OnChanges {
  @Input() issueId: number | null = null;
  @Input() team: DirectoryUser[] = [];
  @Input() epics: EpicSummary[] = [];
  @Input() sprintName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<boolean>();   // true = deleted

  ui = AgileUi;
  faClose = faTimes;
  issue: Issue | null = null;
  criteria: AcceptanceItem[] = [];
  newCriterion = '';
  showMoreOptions = false;
  submitted = false;
  form: FormGroup;

  constructor(private fb: FormBuilder, private agileService: AgileService, private notificationsService: NotificationsService) {
    this.form = this.fb.group({
      txtTitle: ['', [Validators.required, Validators.maxLength(150)]],
      drpType: ['Story' as IssueType, Validators.required],
      drpStatus: ['To Do'],
      drpPoints: [null as number | null],
      drpPriority: ['Medium'],
      drpAssignee: [null as number | null],
      drpEpic: [null as number | null],
      txtDescription: [''],
    });
  }

  ngOnChanges() {
    if (!this.issueId) return;
    this.agileService.getIssue(this.issueId).subscribe(i => {
      this.issue = i || null;
      if (!i) return;
      this.submitted = false;
      this.criteria = i.AcceptanceCriteria.map(a => ({ ...a }));
      this.form.reset({
        txtTitle: i.Title, drpType: i.Type, drpStatus: i.Status, drpPoints: i.StoryPoints, drpPriority: i.Priority,
        drpAssignee: i.AssigneeID, drpEpic: i.EpicID, txtDescription: i.Description,
      });
    });
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }

  get f() {
    return this.form.controls;
  }

  get doneCriteria(): number {
    return this.criteria.filter(c => c.Done).length;
  }

  addCriterion() {
    const text = this.newCriterion.trim();
    if (!text) return;
    this.criteria.push({ Text: text, Done: false });
    this.newCriterion = '';
  }

  removeCriterion(idx: number) {
    this.criteria.splice(idx, 1);
  }

  onReset() {
    this.ngOnChanges();
  }

  onSubmit() {
    this.submitted = true;
    if (this.form.invalid || !this.issue) return;
    const v = this.form.value;
    this.agileService.issueAddEdit({
      AddEdit: 'E', ID: this.issue.ID, ProjectID: this.issue.ProjectID, Type: v.drpType, Title: v.txtTitle,
      Description: v.txtDescription, StoryPoints: v.drpPoints, Priority: v.drpPriority, AssigneeID: v.drpAssignee,
      EpicID: v.drpEpic, AcceptanceCriteria: this.criteria,
    }).subscribe(res => {
      if (v.drpStatus !== this.issue!.Status) {
        this.agileService.updateIssueField(this.issue!.ID, { Status: v.drpStatus }).subscribe(() => this.afterSave(res.Status));
      } else {
        this.afterSave(res.Status);
      }
    });
  }

  private afterSave(message: string) {
    this.notificationsService.showNotification('success', message);
    this.changed.emit(false);
    this.closed.emit();
  }

  async onDelete() {
    if (!this.issue) return;
    const ok = await this.notificationsService.showdelete(`Delete ${this.issue.Key}?`);
    if (!ok) return;
    this.agileService.deleteIssue(this.issue.ID).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.changed.emit(true);
    });
  }
}
