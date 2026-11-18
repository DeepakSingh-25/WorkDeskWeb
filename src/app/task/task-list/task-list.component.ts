import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Task, TaskStatus } from '../../Interface/task';
import { TaskPageBase } from '../task-page-base';

@Component({
    selector: 'app-task-list',
    templateUrl: './task-list.component.html',
    styleUrl: './task-list.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskListComponent extends TaskPageBase {

  taskData: Task[] = [];
  counts: { [s: string]: number } = {};
  statusTab = '';
  FilterRecords = 0;
  sortColumn = 'DueDate';
  sortColumnDir = 'asc';
  recordsPerPageOptions = [10, 25, 50, 100];
  cardsPerPage = 10;
  currentPage = 1;
  statusTabs = ['', 'To Do', 'In Progress', 'In Review', 'Done', 'Overdue'];

  loadData(): void {
    this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
    this.GetTaskList();
  }

  override onFilterChange() {
    this.currentPage = 1;
    super.onFilterChange();
  }

  GetTaskList(): void {
    const startIndex = (this.currentPage - 1) * this.cardsPerPage;
    this.loaderService.showLoader();
    this.taskService.getStatusCounts(this.filter).subscribe(c => this.counts = c);
    this.taskService.getPaginatedTaskList(startIndex, Number(this.cardsPerPage), this.sortColumn, this.sortColumnDir,
      { ...this.filter, Status: this.statusTab }).subscribe({
        next: (data) => {
          this.taskData = data.Result || [];
          this.FilterRecords = data.FilterRecords || 0;
          this.loaderService.hideLoader();
        },
        error: (error) => this.handleError(error)
      });
  }

  setStatusTab(s: string) {
    this.statusTab = s;
    this.currentPage = 1;
    this.GetTaskList();
  }

  orderBy(column: string) {
    this.sortColumnDir = this.sortColumn === column && this.sortColumnDir === 'asc' ? 'desc' : 'asc';
    this.sortColumn = column;
    this.GetTaskList();
  }

  sortIcon(column: string): string {
    return this.sortColumn === column && this.sortColumnDir === 'desc'
      ? '../../assets/images/certificate/bottom-arrow.svg'
      : '../../assets/images/certificate/top-arrow.svg';
  }

  get totalPages(): number {
    return Math.ceil(this.FilterRecords / Number(this.cardsPerPage));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onRecordsPerPageChange(): void {
    this.currentPage = 1;
    this.GetTaskList();
  }

  prevPage(): void {
    if (this.currentPage > 1) { this.currentPage--; this.GetTaskList(); }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) { this.currentPage++; this.GetTaskList(); }
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.GetTaskList();
  }

  onStatusChange(t: Task, status: TaskStatus) {
    this.taskService.updateTaskField(t.ID, { Status: status }).subscribe(res => {
      this.notificationsService.showNotification('success', `“${this.ui.stripKey(t.Title)}” moved to ${status}`);
      this.GetTaskList();
    });
  }

  onEdit(t: Task, event: Event) {
    event.stopPropagation();
    this.router.navigate(['/tasks/edit', t.ID]);
  }

  onDelete(t: Task, event: Event) {
    event.stopPropagation();
    this.notificationsService.showdelete(`Delete “${this.ui.stripKey(t.Title)}”?`).then(ok => {
      if (!ok) return;
      this.loaderService.showLoader();
      this.taskService.deleteTask(t.ID).subscribe({
        next: () => {
          this.loaderService.hideLoader();
          this.notificationsService.showNotification('success', 'Record Deleted Successfully...');
          this.GetTaskList();
        },
        error: (error) => this.handleError(error)
      });
    });
  }
}
