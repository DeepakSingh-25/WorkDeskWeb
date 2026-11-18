import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { faTableList, faGrip } from '@fortawesome/free-solid-svg-icons';
import { Workflow, WorkflowState } from '../../Interface/workflow';
import { WorkflowService } from '../../services/Workflow/workflow.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { WorkflowUi } from '../workflow-ui';

/** Workflow List (`/workflows`). */
@Component({
    selector: 'app-workflow-list',
    templateUrl: './workflow-list.component.html',
    styleUrl: './workflow-list.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class WorkflowListComponent implements OnInit {
  ui = WorkflowUi;
  faTable = faTableList;
  faCards = faGrip;

  private wfService = inject(WorkflowService);
  private notificationsService = inject(NotificationsService);
  private loaderService = inject(LoaderService);
  private router = inject(Router);

  all: Workflow[] = [];
  rows: Workflow[] = [];
  view: 'table' | 'cards' = 'table';
  statusTab = '';
  statusTabs = ['', 'Active', 'Draft', 'Archived'];
  searchValue = '';
  appliesTo = '';
  projectID: number | null = null;
  sortColumn = 'UpdatedOn';
  sortColumnDir = 'desc';
  currentPage = 1;
  cardsPerPage = 10;
  recordsPerPageOptions = [10, 25, 50];

  ngOnInit() {
    this.load();
  }

  load() {
    this.loaderService.showLoader();
    this.wfService.getWorkflows().subscribe({
      next: list => {
        this.all = list;
        this.applyFilters();
        this.loaderService.hideLoader();
      },
      error: () => this.handleError()
    });
  }

  count(s: string): number {
    return this.filtered(false).filter(w => !s || w.Status === s).length;
  }

  private filtered(withTab = true): Workflow[] {
    const q = this.searchValue.trim().toLowerCase();
    return this.all.filter(w =>
      (!withTab || !this.statusTab || w.Status === this.statusTab) &&
      (!this.appliesTo || w.AppliesTo === this.appliesTo) &&
      (!this.projectID || w.ProjectIDs.includes(this.projectID)) &&
      (!q || w.Name.toLowerCase().includes(q) || w.Description.toLowerCase().includes(q)));
  }

  applyFilters() {
    const list = this.filtered();
    const dir = this.sortColumnDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = this.sortValue(a), vb = this.sortValue(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
    this.rows = list;
    this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
  }

  private sortValue(w: Workflow): string | number {
    switch (this.sortColumn) {
      case 'Name': return w.Name.toLowerCase();
      case 'AppliesTo': return w.AppliesTo;
      case 'Status': return w.Status;
      default: return w.UpdatedOn;
    }
  }

  get pageRows(): Workflow[] {
    const start = (this.currentPage - 1) * Number(this.cardsPerPage);
    return this.rows.slice(start, start + Number(this.cardsPerPage));
  }

  get totalPages(): number {
    return Math.ceil(this.rows.length / Number(this.cardsPerPage));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get hasFilters(): boolean {
    return !!(this.searchValue || this.appliesTo || this.projectID);
  }

  setStatusTab(s: string) {
    this.statusTab = s;
    this.currentPage = 1;
    this.applyFilters();
  }

  onFilterChange() {
    this.currentPage = 1;
    this.applyFilters();
  }

  getSearchValue(event: Event) {
    this.searchValue = (event.target as HTMLInputElement).value;
    this.onFilterChange();
  }

  clearFilters() {
    this.searchValue = '';
    this.appliesTo = '';
    this.projectID = null;
    this.onFilterChange();
  }

  orderBy(column: string) {
    this.sortColumnDir = this.sortColumn === column && this.sortColumnDir === 'asc' ? 'desc' : 'asc';
    this.sortColumn = column;
    this.applyFilters();
  }

  sortIcon(column: string): string {
    return this.sortColumn === column && this.sortColumnDir === 'desc'
      ? '../../assets/images/certificate/bottom-arrow.svg'
      : '../../assets/images/certificate/top-arrow.svg';
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }
  goToPage(p: number) { this.currentPage = p; }

  /** Row/card click opens the designer, except when the click came from the "⋯" menu. */
  rowClick(w: Workflow, event: Event) {
    if ((event.target as HTMLElement).closest('.dropdown')) return;
    this.openDesigner(w);
  }

  openDesigner(w: Workflow, event?: Event) {
    event?.stopPropagation();
    this.router.navigate(['/workflows/designer', w.ID]);
  }

  newWorkflow() {
    this.router.navigate(['/workflows/designer', 'new']);
  }

  duplicate(w: Workflow) {
    this.loaderService.showLoader();
    this.wfService.duplicateWorkflow(w.ID).subscribe({
      next: res => {
        this.notificationsService.showNotification('success', `“${res.Workflow.Name}” created as draft`);
        this.load();
      },
      error: () => this.handleError()
    });
  }

  toggleActive(w: Workflow) {
    const next: WorkflowState = w.Status === 'Active' ? 'Draft' : 'Active';
    const msg = next === 'Active' ? `Activate “${w.Name}”?` : `Deactivate “${w.Name}”? Projects using it will fall back to the default flow.`;
    this.notificationsService.showConfirm(msg).then(ok => {
      if (!ok) return;
      this.setStatus(w, next, next === 'Active' ? 'Workflow activated' : 'Workflow deactivated');
    });
  }

  archive(w: Workflow) {
    if (w.Status === 'Archived') {
      this.setStatus(w, 'Draft', 'Workflow restored as draft');
      return;
    }
    this.notificationsService.showConfirm(`Archive “${w.Name}”? It will be hidden from projects.`).then(ok => {
      if (ok) this.setStatus(w, 'Archived', 'Workflow archived');
    });
  }

  private setStatus(w: Workflow, s: WorkflowState, msg: string) {
    this.loaderService.showLoader();
    this.wfService.setWorkflowStatus(w.ID, s).subscribe({
      next: () => {
        this.notificationsService.showNotification('success', msg);
        this.load();
      },
      error: () => this.handleError()
    });
  }

  onDelete(w: Workflow) {
    if (w.ProjectIDs.length) {
      this.notificationsService.showNotification('error',
        `“${w.Name}” is used by ${w.ProjectIDs.length} project(s). Remove it from projects or archive it instead.`);
      return;
    }
    this.notificationsService.showdelete(`Delete workflow “${w.Name}”?`).then(ok => {
      if (!ok) return;
      this.loaderService.showLoader();
      this.wfService.deleteWorkflow(w.ID).subscribe({
        next: () => {
          this.notificationsService.showNotification('success', 'Record Deleted Successfully...');
          this.load();
        },
        error: () => this.handleError()
      });
    });
  }

  private handleError() {
    this.loaderService.hideLoader();
    this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
  }
}
