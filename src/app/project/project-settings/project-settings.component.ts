import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { Project, ProjectPriority, ProjectSettings, ProjectStatus, ProjectUser } from '../../Interface/project';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { ProjectService } from '../../services/Project/project.service';
import { ProjectContextService } from '../project-context.service';
import { ProjectErrorsService } from '../project-errors.service';
import { ProjectUi } from '../project-ui';

@Component({
    selector: 'app-project-settings',
    templateUrl: './project-settings.component.html',
    styleUrl: './project-settings.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProjectSettingsComponent implements OnInit {
  ui = ProjectUi;
  project: Project | null = null;
  drpUserData: ProjectUser[] = [];
  moreOptions = false;
  weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  settingsForm: FormGroup;
  private lookupUsers: ProjectUser[] = [];
  private loadSub: Subscription | null = null;
  private destroyed = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private context: ProjectContextService,
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private errors: ProjectErrorsService,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.loadSub?.unsubscribe();
    });
    this.settingsForm = this.fb.group({
      // general (stored on project)
      txtName: new FormControl('', [Validators.required]),
      drpStatus: new FormControl('', [Validators.required]),
      drpPriority: new FormControl('', [Validators.required]),
      drpManagerID: new FormControl<string | null>(null, [Validators.required]),
      // preferences (stored in project settings)
      drpVisibility: new FormControl('Team'),
      drpDefaultView: new FormControl('List'),
      WorkingDays: new FormControl<string[]>([]),
      chkTimeTracking: new FormControl(true),
      chkClientAccess: new FormControl(false),
      chkNotifyOnTaskAssign: new FormControl(true),
      chkNotifyOnStatusChange: new FormControl(true),
      chkNotifyOnMilestoneDue: new FormControl(true),
      chkWeeklyReport: new FormControl(false),
    });
    // Settings aane tak (aur bina Manage ke) form band rahe; applySettings enable karta hai.
    this.settingsForm.disable();
  }

  ngOnInit() {
    this.projectService.getUserList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => { this.lookupUsers = d; this.buildUserOptions(); },
      error: (err: unknown) => this.errors.handle(err, 'Could not load users.')
    });
    this.context.project$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      this.project = p;
      this.buildUserOptions();
      if (!p) return;
      this.loadFormData(p);
    });
  }

  /** P9 Users sirf Active — inactive manager ko bhi option me rakho, warna raw Guid dikhta hai. Naya array banta hai. */
  private buildUserOptions() {
    const p = this.project;
    const missing = !!p?.ManagerID && !this.lookupUsers.some(u => u.ID.toLowerCase() === p.ManagerID.toLowerCase());
    this.drpUserData = missing && p ? [...this.lookupUsers, { ID: p.ManagerID, Name: p.ManagerName, Email: '' }] : this.lookupUsers;
  }

  /** Q6: the settings form needs Projects.Manage and a non-archived project. */
  get canManage(): boolean {
    return !!this.project && this.project.CanManage && !this.project.IsArchived;
  }

  get canDelete(): boolean {
    return !!this.project?.CanDelete;
  }

  loadFormData(p: Project) {
    this.loadSub?.unsubscribe();
    this.loadSub = this.projectService.getProjectSettings(p.ID).subscribe({
      next: s => this.applySettings(p, s),
      error: (err: unknown) => this.errors.handle(err, 'Could not load project settings. Please try again.')
    });
  }

  private applySettings(p: Project, s: ProjectSettings) {
    this.settingsForm.reset({
      txtName: p.Name, drpStatus: p.Status, drpPriority: p.Priority, drpManagerID: p.ManagerID,
      drpVisibility: s.Visibility, drpDefaultView: s.DefaultView, WorkingDays: s.WorkingDays ?? [],
      chkTimeTracking: s.TimeTracking, chkClientAccess: s.ClientAccess, chkNotifyOnTaskAssign: s.NotifyOnTaskAssign,
      chkNotifyOnStatusChange: s.NotifyOnStatusChange, chkNotifyOnMilestoneDue: s.NotifyOnMilestoneDue,
      chkWeeklyReport: s.WeeklyReport
    });
    if (this.canManage) this.settingsForm.enable();
    else this.settingsForm.disable();
  }

  toggleDay(day: string) {
    if (this.settingsForm.disabled) return;
    const days: string[] = this.settingsForm.value.WorkingDays || [];
    const next = days.includes(day) ? days.filter(d => d !== day) : this.weekDays.filter(d => d === day || days.includes(d));
    this.settingsForm.patchValue({ WorkingDays: next });
    this.settingsForm.markAsDirty();
  }

  onSave() {
    if (!this.project || !this.canManage) return;
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    const v = this.settingsForm.getRawValue();
    const p = this.project;
    this.loaderService.showLoader();
    // Ek hi call: General + Preferences (server par ek transaction) — partial save nahi hota.
    this.projectService.saveProjectSettings(p.ID, {
      General: {
        Name: String(v.txtName ?? '').trim(), Status: v.drpStatus as ProjectStatus, Priority: v.drpPriority as ProjectPriority,
        ManagerUserID: v.drpManagerID, RowVersion: p.RowVersion
      },
      Preferences: {
        Visibility: v.drpVisibility, DefaultView: v.drpDefaultView, WorkingDays: v.WorkingDays ?? [],
        TimeTracking: !!v.chkTimeTracking, ClientAccess: !!v.chkClientAccess, NotifyOnTaskAssign: !!v.chkNotifyOnTaskAssign,
        NotifyOnStatusChange: !!v.chkNotifyOnStatusChange, NotifyOnMilestoneDue: !!v.chkNotifyOnMilestoneDue,
        WeeklyReport: !!v.chkWeeklyReport
      }
    }).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.notificationsService.showNotification('success', res.Message || 'Settings saved.');
        this.settingsForm.markAsPristine();
        this.context.reload();
      },
      error: (err: unknown) => {
        if (this.errors.code(err) === 'CONCURRENCY') {
          this.notificationsService.showNotification('error', 'Someone else changed this project — reloaded.');
          this.context.reload();
          return;
        }
        if (this.errors.handle(err, 'Could not save the settings. Please try again.')) this.context.reload();
      }
    });
  }

  onDiscard() {
    if (this.project) this.loadFormData(this.project);
  }

  onArchive() {
    if (!this.project || !this.canManage) return;
    const p = this.project;
    this.notificationsService.showConfirm(`Archive "${p.Name}"? Team members will no longer be able to edit it.`).then(ok => {
      if (!ok || this.destroyed) return;
      this.loaderService.showLoader();
      this.projectService.archiveProject(p.ID).pipe(
        finalize(() => this.loaderService.hideLoader()),
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: res => {
          this.notificationsService.showNotification('success', res.Message || 'Project archived.');
          this.router.navigate(['/projects']);
        },
        error: (err: unknown) => {
          if (this.errors.handle(err, 'Could not archive the project. Please try again.')) this.context.reload();
        }
      });
    });
  }

  /** Q7: permanent delete only for archived projects. */
  onDelete() {
    if (!this.project || !this.canDelete || !this.project.IsArchived) return;
    const p = this.project;
    this.notificationsService.showdelete(`Permanently delete "${p.Name}"? This cannot be undone.`).then(ok => {
      if (!ok || this.destroyed) return;
      this.loaderService.showLoader();
      this.projectService.deleteProject(p.ID).pipe(
        finalize(() => this.loaderService.hideLoader()),
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: res => {
          this.notificationsService.showNotification('success', res.Message || 'Project deleted.');
          this.router.navigate(['/projects']);
        },
        error: (err: unknown) => {
          if (this.errors.handle(err, 'Could not delete the project. Please try again.')) this.context.reload();
        }
      });
    });
  }
}
