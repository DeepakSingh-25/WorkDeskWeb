import { Component, ElementRef, OnInit, ViewChild, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { Milestone, MilestoneStatus, Project, ProjectMember } from '../../Interface/project';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { ProjectService } from '../../services/Project/project.service';
import { ProjectContextService } from '../project-context.service';
import { ProjectErrorsService } from '../project-errors.service';
import { ProjectUi } from '../project-ui';

@Component({
    selector: 'app-project-milestones',
    templateUrl: './project-milestones.component.html',
    styleUrl: './project-milestones.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProjectMilestonesComponent implements OnInit {
  @ViewChild('closebutton') closebutton!: ElementRef;
  ui = ProjectUi;
  project: Project | null = null;
  milestones: Milestone[] = [];
  members: ProjectMember[] = [];
  statusFilter = '';
  moreOptions = false;
  milestoneForm: FormGroup;
  private editingRowVersion: string | null = null;
  private listSub: Subscription | null = null;
  private membersSub: Subscription | null = null;
  private destroyed = false;

  constructor(
    private fb: FormBuilder,
    private context: ProjectContextService,
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private errors: ProjectErrorsService,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.listSub?.unsubscribe();
      this.membersSub?.unsubscribe();
    });
    this.milestoneForm = this.fb.group({
      ID: new FormControl(0),
      txtTitle: new FormControl('', [Validators.required, Validators.maxLength(100)]),
      txtDescription: new FormControl(''),
      txtStartDate: new FormControl('', [Validators.required]),
      txtDueDate: new FormControl('', [Validators.required]),
      drpOwner: new FormControl<string | null>(null),
      drpStatus: new FormControl('Pending', [Validators.required]),
      txtProgress: new FormControl(0),
    }, { validators: (g: AbstractControl): ValidationErrors | null => {
      const s = g.get('txtStartDate')?.value, e = g.get('txtDueDate')?.value;
      return s && e && e < s ? { dateRange: true } : null;
    } });
  }

  ngOnInit() {
    this.context.project$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      this.project = p;
      if (!p) return;
      this.GetMilestoneList();
      this.membersSub?.unsubscribe();
      this.membersSub = this.projectService.getProjectMembers(p.ID).subscribe({
        next: m => this.members = m ?? [],
        error: (err: unknown) => this.errors.handle(err, 'Could not load members.')
      });
    });
  }

  /** Add / edit / complete / delete only while the server says the project is editable. */
  get canEdit(): boolean {
    return !!this.project?.CanEdit;
  }

  GetMilestoneList() {
    this.listSub?.unsubscribe();
    this.listSub = this.projectService.getMilestones(this.context.projectID).subscribe({
      next: d => this.milestones = d ?? [],
      error: (err: unknown) => this.errors.handle(err, 'Could not load milestones. Please try again.')
    });
  }

  get filteredMilestones(): Milestone[] {
    return this.milestones.filter(m => !this.statusFilter || m.Status === this.statusFilter);
  }

  count(status: string): number {
    return this.milestones.filter(m => m.Status === status).length;
  }

  isOverdue(m: Milestone): boolean {
    return m.Status !== 'Completed' && m.DueDate < ProjectUi.today();
  }

  resetForm() {
    this.moreOptions = false;
    this.editingRowVersion = null;
    this.milestoneForm.reset({
      ID: 0, txtTitle: '', txtDescription: '', txtStartDate: this.project?.StartDate || '', txtDueDate: '',
      drpOwner: null, drpStatus: 'Pending', txtProgress: 0
    });
  }

  onEdit(m: Milestone) {
    this.moreOptions = !!(m.Description || m.OwnerUserID);
    this.editingRowVersion = m.RowVersion;
    this.milestoneForm.reset({
      ID: m.ID, txtTitle: m.Title, txtDescription: m.Description ?? '', txtStartDate: m.StartDate, txtDueDate: m.DueDate,
      drpOwner: m.OwnerUserID ?? null, drpStatus: m.Status, txtProgress: m.Progress
    });
  }

  onSave() {
    if (!this.canEdit) return;
    if (this.milestoneForm.invalid) {
      this.milestoneForm.markAllAsTouched();
      return;
    }
    const v = this.milestoneForm.value;
    const status = v.drpStatus as MilestoneStatus;
    const progress = status === 'Completed' ? 100 : Number(v.txtProgress) || 0;
    this.loaderService.showLoader();
    this.projectService.milestoneAddEdit({
      ID: v.ID, ProjectID: this.context.projectID, Title: String(v.txtTitle ?? '').trim(),
      Description: String(v.txtDescription ?? '').trim(), StartDate: v.txtStartDate, DueDate: v.txtDueDate,
      Status: status, Progress: progress, OwnerUserID: v.drpOwner || null,
      RowVersion: v.ID ? this.editingRowVersion : null
    }).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        // Q9: dates outside the project are allowed, only warned about.
        const warn = res.OutsideProjectDates ? ' Note: outside project dates.' : '';
        this.notificationsService.showNotification('success', (res.Message || (v.ID ? 'Milestone updated.' : 'Milestone added.')) + warn);
        this.closebutton.nativeElement.click();
        this.afterWrite();
      },
      error: (err: unknown) => this.onWriteError(err, 'Could not save the milestone. Please try again.')
    });
  }

  onMarkComplete(m: Milestone) {
    if (!this.canEdit) return;
    this.loaderService.showLoader();
    this.projectService.completeMilestone(this.context.projectID, m.ID).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.notificationsService.showNotification('success', res.Message || 'Milestone marked as completed.');
        this.afterWrite();
      },
      error: (err: unknown) => this.onWriteError(err, 'Could not complete the milestone. Please try again.')
    });
  }

  onDelete(m: Milestone) {
    if (!this.canEdit) return;
    this.notificationsService.showdelete(`Delete milestone "${m.Title}"?`).then(ok => {
      if (!ok || this.destroyed) return;
      this.loaderService.showLoader();
      this.projectService.deleteMilestone(this.context.projectID, m.ID).pipe(
        finalize(() => this.loaderService.hideLoader()),
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: res => {
          this.notificationsService.showNotification('success', res.Message || 'Milestone deleted.');
          this.afterWrite();
        },
        error: (err: unknown) => this.onWriteError(err, 'Could not delete the milestone. Please try again.')
      });
    });
  }

  // Milestones change the project's Progress / Health — context.reload() project$ re-emit karta hai,
  // aur project$ subscription milestone list bhi reload kar deta hai.
  private afterWrite() {
    this.context.reload();
  }

  private onWriteError(err: unknown, fallback: string) {
    if (this.errors.code(err) === 'PROJECT_ARCHIVED') {
      this.notificationsService.showNotification('error', this.errors.message(err, 'This project is archived and read-only.'));
      this.closebutton?.nativeElement.click();
      this.context.reload();
      return;
    }
    // 404 / 409 (CONCURRENCY): our list is stale — reload it.
    if (this.errors.handle(err, fallback)) {
      this.closebutton?.nativeElement.click();
      this.GetMilestoneList();
    }
  }
}
