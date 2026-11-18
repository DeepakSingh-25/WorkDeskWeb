import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TaskPriority } from '../../Interface/task';
import { RecurrenceEnd, RecurrenceFrequency, RecurrenceSpec, RecurringRule } from '../../Interface/workspace';
import { WorkspaceService } from '../../services/Workspace/workspace.service';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { ORDINALS, WorkspaceUi } from '../workspace-ui';

/** Create / edit a recurring task rule (`/workspace/recurring/create`, `/workspace/recurring/edit/:id`). */
@Component({
    selector: 'app-recurring-form',
    templateUrl: './recurring-form.component.html',
    styleUrl: './recurring-form.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RecurringFormComponent implements OnInit, OnDestroy {
  ui = WorkspaceUi;
  AddEdit: 'A' | 'E' = 'A';
  rule: RecurringRule | null = null;
  submitted = false;
  showMore = false;
  drpProjectData: { ID: number; Name: string }[] = [];
  drpUserData: { ID: number; Name: string }[] = [];
  drpLabelData: string[] = [];
  priorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical'];
  frequencies: { Value: RecurrenceFrequency; Label: string }[] = [
    { Value: 'Daily', Label: 'Daily' }, { Value: 'Weekly', Label: 'Weekly' }, { Value: 'Monthly', Label: 'Monthly' }, { Value: 'Custom', Label: 'Every N days' }
  ];
  weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  ordinals = [1, 2, 3, 4, 5].map(n => ({ Value: n, Label: ORDINALS[n] }));
  monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

  preview: Date[] = [];
  summary = '';
  private subs = new Subscription();

  ruleForm = new FormGroup({
    txtTitle: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    txtDescription: new FormControl('', { nonNullable: true }),
    drpProjectID: new FormControl<number | null>(null, [Validators.required]),
    drpAssigneeID: new FormControl<number | null>(null),
    drpPriority: new FormControl<TaskPriority>('Medium', { nonNullable: true }),
    txtEstimate: new FormControl<number | null>(1, [Validators.min(0), Validators.max(999)]),
    drpLabels: new FormControl<string[]>([], { nonNullable: true }),
    drpFrequency: new FormControl<RecurrenceFrequency>('Weekly', { nonNullable: true }),
    txtTime: new FormControl('10:00', { nonNullable: true, validators: [Validators.required] }),
    Weekdays: new FormControl<number[]>([1], { nonNullable: true }),
    drpMonthlyMode: new FormControl<'Day' | 'Weekday'>('Day', { nonNullable: true }),
    drpMonthDay: new FormControl(1, { nonNullable: true }),
    drpMonthWeek: new FormControl(1, { nonNullable: true }),
    drpMonthWeekday: new FormControl(1, { nonNullable: true }),
    txtIntervalDays: new FormControl(2, { nonNullable: true, validators: [Validators.min(1), Validators.max(365)] }),
    txtStartDate: new FormControl(WorkspaceUi.today(), { nonNullable: true, validators: [Validators.required] }),
    rdoEndMode: new FormControl<RecurrenceEnd>('Never', { nonNullable: true }),
    txtEndDate: new FormControl('', { nonNullable: true }),
    txtEndAfter: new FormControl(10, { nonNullable: true, validators: [Validators.min(1), Validators.max(999)] }),
    txtDueOffset: new FormControl(1, { nonNullable: true, validators: [Validators.min(0), Validators.max(365)] }),
    chkActive: new FormControl(true, { nonNullable: true }),
  }, { validators: (g: AbstractControl): ValidationErrors | null => {
    const v = g.value;
    const errors: ValidationErrors = {};
    if (v.drpFrequency === 'Weekly' && !(v.Weekdays || []).length) errors['noWeekday'] = true;
    if (v.rdoEndMode === 'OnDate' && (!v.txtEndDate || v.txtEndDate < v.txtStartDate)) errors['endDate'] = true;
    return Object.keys(errors).length ? errors : null;
  } });

  constructor(
    private workspaceService: WorkspaceService,
    private taskService: TaskService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.taskService.getProjectOptions().subscribe(d => this.drpProjectData = d);
    this.taskService.getUserOptions().subscribe(d => this.drpUserData = d);
    this.taskService.getLabelOptions().subscribe(d => this.drpLabelData = d);
    this.subs.add(this.ruleForm.valueChanges.subscribe(() => this.refreshPreview()));
    this.refreshPreview();

    const ID = Number(this.route.snapshot.paramMap.get('id'));
    if (ID) {
      this.AddEdit = 'E';
      this.loaderService.showLoader();
      this.workspaceService.getRecurringRuleByID(ID).subscribe(r => {
        this.loaderService.hideLoader();
        if (!r) {
          this.notificationsService.showNotification('error', 'Recurring rule not found');
          this.router.navigate(['/workspace/recurring']);
          return;
        }
        this.rule = r;
        this.patch(r);
      });
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private patch(r: RecurringRule) {
    this.ruleForm.reset({
      txtTitle: r.Title, txtDescription: r.Description, drpProjectID: r.ProjectID, drpAssigneeID: r.AssigneeID, drpPriority: r.Priority,
      txtEstimate: r.EstimateHours, drpLabels: [...r.Labels], drpFrequency: r.Frequency, txtTime: r.Time, Weekdays: [...r.Weekdays],
      drpMonthlyMode: r.MonthlyMode, drpMonthDay: r.MonthDay, drpMonthWeek: r.MonthWeek, drpMonthWeekday: r.MonthWeekday,
      txtIntervalDays: r.IntervalDays, txtStartDate: r.StartDate, rdoEndMode: r.EndMode, txtEndDate: r.EndDate, txtEndAfter: r.EndAfter,
      txtDueOffset: r.DueOffsetDays, chkActive: r.Active
    });
  }

  get spec(): RecurrenceSpec {
    const v = this.ruleForm.getRawValue();
    return {
      Frequency: v.drpFrequency, Time: v.txtTime, Weekdays: v.Weekdays, MonthlyMode: v.drpMonthlyMode, MonthDay: Number(v.drpMonthDay),
      MonthWeek: Number(v.drpMonthWeek), MonthWeekday: Number(v.drpMonthWeekday), IntervalDays: Number(v.txtIntervalDays) || 1,
      StartDate: v.txtStartDate, EndMode: v.rdoEndMode, EndDate: v.txtEndDate, EndAfter: Number(v.txtEndAfter) || 0
    };
  }

  private refreshPreview() {
    const spec = this.spec;
    this.summary = WorkspaceUi.scheduleSummary(spec);
    this.preview = WorkspaceUi.occurrences(spec, 5);
  }

  dueFor(d: Date): string {
    return WorkspaceUi.addDays(d, Number(this.ruleForm.controls.txtDueOffset.value) || 0);
  }

  get endText(): string {
    return WorkspaceUi.endSummary(this.spec);
  }

  hasDay(d: number): boolean {
    return this.ruleForm.controls.Weekdays.value.includes(d);
  }

  toggleDay(d: number) {
    const days = this.ruleForm.controls.Weekdays.value;
    this.ruleForm.controls.Weekdays.setValue(days.includes(d) ? days.filter(x => x !== d) : [...days, d]);
  }

  setWeekdaysPreset(p: 'weekdays' | 'all' | 'none') {
    this.ruleForm.controls.Weekdays.setValue(p === 'weekdays' ? [1, 2, 3, 4, 5] : p === 'all' ? [0, 1, 2, 3, 4, 5, 6] : []);
  }

  isInvalid(name: string): boolean {
    const c = this.ruleForm.get(name);
    return !!c && (c.touched || this.submitted) && c.invalid;
  }

  onReset() {
    this.submitted = false;
    if (this.rule) this.patch(this.rule);
    else this.ruleForm.reset();
  }

  onCancel() {
    this.router.navigate(['/workspace/recurring']);
  }

  onSave() {
    this.submitted = true;
    this.ruleForm.markAllAsTouched();
    if (this.ruleForm.invalid) {
      const c = this.ruleForm.controls;
      if (c.txtEstimate.invalid || c.txtDueOffset.invalid || c.drpPriority.invalid) this.showMore = true;
      this.notificationsService.showNotification('error', 'Please fix the highlighted fields.');
      return;
    }
    const v = this.ruleForm.getRawValue();
    const spec = this.spec;
    this.loaderService.showLoader();
    this.workspaceService.recurringAddEdit({
      AddEdit: this.AddEdit, ID: this.rule?.ID, Title: v.txtTitle.trim(), Description: v.txtDescription.trim(), ProjectID: v.drpProjectID!,
      AssigneeID: v.drpAssigneeID, Priority: v.drpPriority, EstimateHours: Number(v.txtEstimate) || 0, Labels: v.drpLabels || [],
      DueOffsetDays: Number(v.txtDueOffset) || 0, Active: v.chkActive, ...spec
    }).subscribe({
      next: res => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('success', res.Status);
        this.router.navigate(['/workspace/recurring']);
      },
      error: () => this.loaderService.hideLoader()
    });
  }
}
