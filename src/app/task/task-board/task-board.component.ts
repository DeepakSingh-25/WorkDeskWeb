import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Task, TaskStatus } from '../../Interface/task';
import { TaskPageBase } from '../task-page-base';

@Component({
    selector: 'app-task-board',
    templateUrl: './task-board.component.html',
    styleUrl: './task-board.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskBoardComponent extends TaskPageBase {

  columns: { status: TaskStatus; tasks: Task[] }[] = [];
  draggedId: number | null = null;
  dragOverStatus: string | null = null;
  quickAddStatus: string | null = null;
  quickAddTitle = '';

  loadData(): void {
    this.loaderService.showLoader();
    this.taskService.getTasks(this.filter).subscribe({
      next: (tasks) => {
        this.columns = this.taskService.statuses.map(status => ({ status, tasks: this.sort(tasks.filter(t => t.Status === status)) }));
        this.loaderService.hideLoader();
      },
      error: (error) => this.handleError(error)
    });
  }

  private sort(tasks: Task[]): Task[] {
    const rank = (p: string) => ['Critical', 'High', 'Medium', 'Low'].indexOf(p);
    return tasks.sort((a, b) => rank(a.Priority) - rank(b.Priority) || (a.DueDate || '9999').localeCompare(b.DueDate || '9999'));
  }

  // ---------- drag & drop (native HTML5) ----------

  onDragStart(event: DragEvent, t: Task) {
    this.draggedId = t.ID;
    event.dataTransfer?.setData('text/plain', String(t.ID));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd() {
    this.draggedId = null;
    this.dragOverStatus = null;
  }

  onDragOver(event: DragEvent, status: string) {
    event.preventDefault();
    this.dragOverStatus = status;
  }

  onDragLeave(event: DragEvent, status: string) {
    const related = event.relatedTarget as Node | null;
    if (!related || !(event.currentTarget as HTMLElement).contains(related)) {
      if (this.dragOverStatus === status) this.dragOverStatus = null;
    }
  }

  onDrop(event: DragEvent, status: TaskStatus) {
    event.preventDefault();
    const ID = this.draggedId ?? Number(event.dataTransfer?.getData('text/plain'));
    this.onDragEnd();
    const from = this.columns.find(c => c.tasks.some(t => t.ID === ID));
    const to = this.columns.find(c => c.status === status);
    if (!from || !to || from === to) return;
    const task = from.tasks.find(t => t.ID === ID)!;

    // optimistic move, then persist
    from.tasks = from.tasks.filter(t => t.ID !== ID);
    task.Status = status;
    to.tasks = this.sort([...to.tasks, task]);
    if (task.IsBlocked && status !== 'To Do') {
      this.notificationsService.showNotification('error', `“${this.ui.stripKey(task.Title)}” is still waiting on another open task.`);
    }
    this.taskService.updateTaskField(ID, { Status: status }).subscribe({
      next: () => this.notificationsService.showNotification('success', `“${this.ui.stripKey(task.Title)}” moved to ${status}`),
      error: (error) => { this.handleError(error); this.loadData(); }
    });
  }

  // ---------- quick add ----------

  startQuickAdd(status: string) {
    if (!this.projectID) {
      this.router.navigate(['/tasks/create'], { queryParams: { status } });
      return;
    }
    this.quickAddStatus = status;
    this.quickAddTitle = '';
    setTimeout(() => (document.getElementById('quickAddInput') as HTMLInputElement | null)?.focus());
  }

  saveQuickAdd(status: TaskStatus) {
    const title = this.quickAddTitle.trim();
    if (!title || !this.projectID) {
      this.quickAddStatus = null;
      return;
    }
    this.taskService.taskAddEdit({
      AddEdit: 'A', ProjectID: this.projectID, Title: title, Status: status, Priority: 'Medium',
      AssigneeID: this.assigneeID, EstimateHours: 0, Labels: []
    }).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.quickAddTitle = '';
      this.loadData();
    });
  }

}
