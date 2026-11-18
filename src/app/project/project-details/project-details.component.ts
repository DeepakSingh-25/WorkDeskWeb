import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Project } from '../../Interface/project';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { ProjectService } from '../../services/Project/project.service';
import { ProjectContextService } from '../project-context.service';
import { ProjectErrorsService } from '../project-errors.service';
import { ProjectUi } from '../project-ui';

@Component({
    selector: 'app-project-details',
    templateUrl: './project-details.component.html',
    styleUrl: './project-details.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [ProjectContextService],
    standalone: false
})
export class ProjectDetailsComponent implements OnInit {
  ui = ProjectUi;
  project: Project | null = null;
  loaded = false;
  private destroyed = false;

  private allTabs = [
    { label: 'Overview', path: 'overview' },
    { label: 'Members', path: 'members' },
    { label: 'Milestones', path: 'milestones' },
    { label: 'Settings', path: 'settings' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private context: ProjectContextService,
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private errors: ProjectErrorsService,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => this.destroyed = true);
  }

  ngOnInit() {
    this.context.project$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      this.project = p;
      if (this.context.projectID) this.loaded = true;
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.loaded = false;
      this.context.load(Number(params.get('id')));
    });
  }

  get loadError(): boolean {
    return this.context.loadError;
  }

  onRetry() {
    this.context.reload();
  }

  // Settings tab (Q6): Manage for the form, Delete for "Delete permanently".
  get tabs() {
    const p = this.project;
    return this.allTabs.filter(t => t.path !== 'settings' || !!(p && (p.CanManage || p.CanDelete)));
  }

  onEdit() {
    if (!this.project?.CanEdit) return;
    this.router.navigate(['/projects/edit', this.project.ID]);
  }

  onArchive() {
    if (!this.project?.CanManage) return;
    const p = this.project;
    this.notificationsService.showConfirm(`Archive "${p.Name}"?`).then(ok => {
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

  onRestore() {
    if (!this.project?.CanManage) return;
    this.loaderService.showLoader();
    this.projectService.restoreProject(this.project.ID).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.notificationsService.showNotification('success', res.Message || 'Project restored.');
        this.context.reload();
      },
      error: (err: unknown) => {
        if (this.errors.handle(err, 'Could not restore the project. Please try again.')) this.context.reload();
      }
    });
  }
}
