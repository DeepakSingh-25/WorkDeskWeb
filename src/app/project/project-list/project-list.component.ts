import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { ProjectService } from '../../services/Project/project.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { EntitlementService } from '../../services/Access/entitlement.service';
import { Project, ProjectSummary } from '../../Interface/project';
import { ProjectUi } from '../project-ui';
import { ProjectErrorsService } from '../project-errors.service';

@Component({
    selector: 'app-project-list',
    templateUrl: './project-list.component.html',
    styleUrl: './project-list.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProjectListComponent implements OnInit {
  ui = ProjectUi;
  userMap: { [id: string]: string } = {};
  projectData: Project[] = [];
  summary: ProjectSummary = { Total: 0, InProgress: 0, Completed: 0, OnHold: 0, Overdue: 0, Archived: 0 };
  FilterRecords: number = 0;
  canCreate = false;
  // Pehli load ke dauran "No Record Found" flash na ho.
  loading = false;

  sortColumn: string = 'Code';
  sortColumnDir: string = 'desc';
  searchValue: string = '';
  statusFilter: string = '';
  viewMode: 'table' | 'grid' = 'table';

  recordsPerPageOptions = [10, 25, 50, 100];
  cardsPerPage = 10;
  currentPage = 1;

  private search$ = new Subject<string>();
  private listSub: Subscription | null = null;
  // Confirm dialog (Promise) page band hone ke baad resolve ho sakta hai — tab kuch nahi karna.
  private destroyed = false;

  constructor(
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private entitlement: EntitlementService,
    private errors: ProjectErrorsService,
    private router: Router,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.listSub?.unsubscribe();
    });
  }

  ngOnInit() {
    this.entitlement.access$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.canCreate = this.entitlement.can('Projects', 'Create'));
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    this.projectService.getUserList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: users => users.forEach(u => this.userMap[u.ID] = u.Name),
      error: (err: unknown) => this.errors.handle(err, 'Could not load users.')
    });

    // 300 ms debounce — har keystroke par API call nahi.
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(v => {
      this.searchValue = v;
      this.currentPage = 1;
      this.GetProjectList();
    });

    this.GetProjectSummary();
    this.GetProjectList();
  }

  userName(ID: string): string {
    return this.userMap[ID] || '';
  }

  GetProjectSummary(): void {
    this.projectService.getProjectSummary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => this.summary = data,
      error: (err: unknown) => this.errors.handle(err, 'Could not load the project summary.')
    });
  }

  GetProjectList(): void {
    const startIndex = (this.currentPage - 1) * Number(this.cardsPerPage);
    // Pichhli request cancel — purana result naye ke upar na aaye.
    this.listSub?.unsubscribe();
    this.loading = true;
    this.loaderService.showLoader();
    this.listSub = this.projectService.getPaginatedProjectList(startIndex, Number(this.cardsPerPage), this.sortColumn,
      this.sortColumnDir, this.searchValue, this.statusFilter).pipe(
        finalize(() => {
          this.loading = false;
          this.loaderService.hideLoader();
        })
      ).subscribe({
        next: (data) => {
          this.projectData = data.Result || [];
          this.FilterRecords = data.FilterRecords || 0;
        },
        error: (err: unknown) => this.errors.handle(err, 'Could not load projects. Please try again.')
      });
  }

  orderBy(column: string) {
    if (this.sortColumn === column) {
      this.sortColumnDir = this.sortColumnDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortColumnDir = 'asc';
    }
    this.GetProjectList();
  }

  get totalPages(): number {
    return Math.ceil(this.FilterRecords / Number(this.cardsPerPage));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onRecordsPerPageChange(): void {
    this.currentPage = 1;
    this.GetProjectList();
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.GetProjectList();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.GetProjectList();
    }
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.GetProjectList();
  }

  getSearchValue(event: Event): void {
    this.search$.next((event.target as HTMLInputElement).value.trim());
  }

  filterByStatus(status: string): void {
    this.statusFilter = status;
    this.currentPage = 1;
    this.GetProjectList();
  }

  onView(ID: number): void {
    this.router.navigate(['/projects', ID]);
  }

  onEdit(ID: number): void {
    this.router.navigate(['/projects/edit', ID]);
  }

  onArchive(element: Project): void {
    if (!element.CanManage) return;
    this.notificationsService.showConfirm(`Archive "${element.Name}"? It will move to Archived Projects.`)
      .then((response) => {
        if (!response || this.destroyed) return;
        let reload = false;
        this.loaderService.showLoader();
        this.projectService.archiveProject(element.ID).pipe(
          finalize(() => {
            this.loaderService.hideLoader();
            if (reload) {
              this.GetProjectSummary();
              this.GetProjectList();
            }
          }),
          takeUntilDestroyed(this.destroyRef)
        ).subscribe({
          next: (result) => {
            this.notificationsService.showNotification('success', result.Message || 'Project archived.');
            reload = true;
          },
          // 404 / 409: list is stale — reload.
          error: (err: unknown) => reload = this.errors.handle(err, 'Could not archive the project. Please try again.')
        });
      });
  }

  daysText(endDate: string): string {
    const d = ProjectUi.daysLeft(endDate);
    return d === -1 ? '1 day late' : d < 0 ? `${-d} days late` : d === 1 ? '1 day left' : `${d} days left`;
  }

  sortIcon(column: string): string {
    return this.sortColumn === column && this.sortColumnDir === 'desc'
      ? '../../assets/images/certificate/bottom-arrow.svg'
      : '../../assets/images/certificate/top-arrow.svg';
  }
}
