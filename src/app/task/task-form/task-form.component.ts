import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Task } from '../../Interface/task';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { TaskUi } from '../task-ui';

/** Create Task (`/tasks/create`) and Edit Task (`/tasks/edit/:id`) screens. */
@Component({
    selector: 'app-task-form',
    templateUrl: './task-form.component.html',
    styleUrl: './task-form.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskFormComponent implements OnInit {
  ui = TaskUi;
  AddEdit: 'A' | 'E' = 'A';
  task: Task | null = null;
  taskForm: FormGroup;
  drpProjectData: { ID: number; Name: string }[] = [];
  drpUserData: { ID: number; Name: string }[] = [];
  drpLabelData: string[] = [];
  priorities = ['Low', 'Medium', 'High', 'Critical'];
  /** "More options" section: collapsed in Create, opened in Edit when one of its fields has a value */
  showMore = false;

  constructor(
    private fb: FormBuilder,
    private taskService: TaskService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.taskForm = this.fb.group({
      ID: new FormControl(0),
      drpProjectID: new FormControl<number | null>(null, [Validators.required]),
      txtTitle: new FormControl('', [Validators.required, Validators.maxLength(150)]),
      txtDescription: new FormControl(''),
      drpStatus: new FormControl('To Do', [Validators.required]),
      drpPriority: new FormControl('Medium', [Validators.required]),
      drpAssigneeID: new FormControl<number | null>(null),
      txtStartDate: new FormControl(''),
      txtDueDate: new FormControl(''),
      txtEstimate: new FormControl<number | null>(null, [Validators.min(0), Validators.max(999)]),
      drpLabels: new FormControl<string[]>([]),
      Subtasks: this.fb.array<FormControl<string | null>>([]),
    }, { validators: (g: AbstractControl): ValidationErrors | null => {
      const s = g.get('txtStartDate')?.value, e = g.get('txtDueDate')?.value;
      return s && e && e < s ? { dateRange: true } : null;
    } });
  }

  ngOnInit() {
    this.taskService.getProjectOptions().subscribe(d => this.drpProjectData = d);
    this.taskService.getUserOptions().subscribe(d => this.drpUserData = d);
    this.taskService.getLabelOptions().subscribe(d => this.drpLabelData = d);

    const ID = this.route.snapshot.paramMap.get('id');
    if (ID) {
      this.AddEdit = 'E';
      this.loadFormData(Number(ID));
    } else {
      // prefill from ?project= ?status= ?due= (board quick add, calendar day "+")
      const q = this.route.snapshot.queryParamMap;
      this.taskForm.patchValue({
        drpProjectID: q.get('project') ? Number(q.get('project')) : null,
        drpStatus: q.get('status') || 'To Do',
        txtDueDate: q.get('due') || '',
      });
      this.addSubtask();
    }
  }

  get subtasks(): FormArray {
    return this.taskForm.get('Subtasks') as FormArray;
  }

  addSubtask() {
    this.subtasks.push(new FormControl(''));
  }

  removeSubtask(i: number) {
    this.subtasks.removeAt(i);
  }

  onSubtaskEnter(i: number, event: Event) {
    event.preventDefault();
    if (i === this.subtasks.length - 1 && this.subtasks.at(i).value?.trim()) this.addSubtask();
    setTimeout(() => (document.getElementById('subtask' + (i + 1)) as HTMLInputElement | null)?.focus());
  }

  isInvalid(name: string): boolean {
    const c = this.taskForm.controls[name];
    return c.touched && c.invalid;
  }

  assignToMe() {
    this.taskForm.patchValue({ drpAssigneeID: this.taskService.currentUser.ID });
  }

  loadFormData(ID: number) {
    this.loaderService.showLoader();
    this.taskService.getTaskByID(ID).subscribe({
      next: (t) => {
        this.loaderService.hideLoader();
        if (!t) {
          this.notificationsService.showNotification('error', 'Task not found.');
          this.router.navigate(['/tasks']);
          return;
        }
        this.task = t;
        this.taskForm.patchValue({
          ID: t.ID, drpProjectID: t.ProjectID, txtTitle: t.Title, txtDescription: t.Description, drpStatus: t.Status,
          drpPriority: t.Priority, drpAssigneeID: t.AssigneeID, txtStartDate: t.StartDate, txtDueDate: t.DueDate,
          txtEstimate: t.EstimateHours || null, drpLabels: t.Labels
        });
        this.taskForm.markAsPristine();
        this.showMore = !!(t.Description || t.StartDate || t.EstimateHours || t.Labels?.length);
      },
      error: (error) => this.handleError(error)
    });
  }

  onSave(openAfter = true): void {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      if (this.taskForm.controls['txtEstimate'].invalid) this.showMore = true;
      return;
    }
    const v = this.taskForm.value;
    this.loaderService.showLoader();
    this.taskService.taskAddEdit({
      AddEdit: this.AddEdit, ID: v.ID, ProjectID: v.drpProjectID, Title: v.txtTitle.trim(), Description: v.txtDescription,
      Status: v.drpStatus, Priority: v.drpPriority, AssigneeID: v.drpAssigneeID, StartDate: v.txtStartDate,
      DueDate: v.txtDueDate, EstimateHours: v.txtEstimate || 0, Labels: v.drpLabels || [],
      Subtasks: this.AddEdit === 'A' ? (v.Subtasks || []) : undefined
    }).subscribe({
      next: (response) => {
        this.loaderService.hideLoader();
        if (response.Status === 'Task Added Successfully...' || response.Status === 'Task Updated Successfully...') {
          this.notificationsService.showNotification('success', response.Status);
          if (openAfter) {
            this.router.navigate(['/tasks'], { queryParams: { task: response.ID, project: v.drpProjectID } });
          } else {
            // "Save & create another"
            this.resetForm(true);
          }
        } else {
          this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
        }
      },
      error: (error) => this.handleError(error)
    });
  }

  resetForm(keepProject = false): void {
    if (this.AddEdit === 'E' && this.task) {
      this.loadFormData(this.task.ID);
      return;
    }
    const project = keepProject ? this.taskForm.value.drpProjectID : null;
    this.subtasks.clear();
    this.taskForm.reset({
      ID: 0, drpProjectID: project, txtTitle: '', txtDescription: '', drpStatus: 'To Do', drpPriority: 'Medium',
      drpAssigneeID: null, txtStartDate: '', txtDueDate: '', txtEstimate: null, drpLabels: []
    });
    this.addSubtask();
  }

  onCancel(): void {
    if (this.AddEdit === 'E' && this.task) this.router.navigate(['/tasks'], { queryParams: { task: this.task.ID } });
    else this.router.navigate(['/tasks']);
  }

  onDelete(): void {
    if (!this.task) return;
    const t = this.task;
    this.notificationsService.showdelete(`Delete “${this.ui.stripKey(t.Title)}”? Its checklist, comments, files and time entries will be removed too.`).then(ok => {
      if (!ok) return;
      this.loaderService.showLoader();
      this.taskService.deleteTask(t.ID).subscribe(() => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('success', 'Record Deleted Successfully...');
        this.router.navigate(['/tasks']);
      });
    });
  }

  private handleError(error: any) {
    this.loaderService.hideLoader();
    if (error?.status == 401) {
      this.router.navigate(['/login']);
    } else {
      this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
    }
  }
}
