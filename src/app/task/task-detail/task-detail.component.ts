import { Component, EventEmitter, Input, OnChanges, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { Task, TaskPriority, TaskStatus } from '../../Interface/task';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { TaskUi } from '../task-ui';

export type DetailTab = 'subtasks' | 'comments';

/**
 * Task Details. Used two ways:
 *  - inside <app-task-drawer> (mode="drawer") from List / Board / Calendar
 *  - as a full page at /tasks/:id (mode="page", id read from the route)
 */
@Component({
    selector: 'app-task-detail',
    templateUrl: './task-detail.component.html',
    styleUrl: './task-detail.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskDetailComponent implements OnInit, OnChanges {
  @Input() taskId: number | null = null;
  @Input() mode: 'drawer' | 'page' = 'page';
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<boolean>();

  ui = TaskUi;
  faClose = faXmark;
  task: Task | null = null;
  notFound = false;
  activeTab: DetailTab = 'subtasks';
  drpUserData: { ID: number; Name: string }[] = [];
  priorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical'];
  titleDraft = '';

  constructor(
    private taskService: TaskService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.taskService.getUserOptions().subscribe(d => this.drpUserData = d);
    if (this.mode === 'page') {
      this.route.paramMap.subscribe(p => {
        this.taskId = Number(p.get('id'));
        this.loadTask();
      });
      const tab = this.route.snapshot.queryParamMap.get('tab') as DetailTab | null;
      if (tab === 'subtasks' || tab === 'comments') this.activeTab = tab;
    }
  }

  ngOnChanges() {
    if (this.mode === 'drawer' && this.taskId) {
      // ?tab=comments lets other screens open a specific section
      const tab = this.route.snapshot.queryParamMap.get('tab') as DetailTab | null;
      this.activeTab = tab && ['subtasks', 'comments'].includes(tab) ? tab : 'subtasks';
      this.loadTask();
    }
  }

  loadTask() {
    if (!this.taskId) return;
    this.taskService.getTaskByID(this.taskId).subscribe(t => {
      this.task = t ?? null;
      this.notFound = !t;
      this.titleDraft = t?.Title || '';
    });
  }

  /** a child section (subtasks, comments ...) changed something */
  onSectionChanged() {
    this.loadTask();
    this.changed.emit(false);
  }

  // ---------- inline field edits ----------

  private patch(changes: any, message?: string) {
    if (!this.task) return;
    this.taskService.updateTaskField(this.task.ID, changes).subscribe(() => {
      if (message) this.notificationsService.showNotification('success', message);
      this.loadTask();
      this.changed.emit(false);
    });
  }

  setStatus(s: TaskStatus) {
    if (this.task && s !== this.task.Status) this.patch({ Status: s }, `Status changed to ${s}`);
  }

  setPriority(p: TaskPriority) {
    if (this.task && p !== this.task.Priority) this.patch({ Priority: p });
  }

  setAssignee(ID: number | null) {
    if (this.task && ID !== this.task.AssigneeID) this.patch({ AssigneeID: ID ?? null });
  }

  setDate(field: 'DueDate' | 'StartDate', value: string) {
    if (!this.task || value === this.task[field]) return;
    if (field === 'DueDate' && value && this.task.StartDate && value < this.task.StartDate) {
      this.notificationsService.showNotification('error', 'Due Date must be on or after Start Date');
      this.loadTask();
      return;
    }
    this.patch({ [field]: value });
  }

  saveTitle() {
    const title = this.titleDraft.trim();
    if (!this.task) return;
    if (!title) {
      this.titleDraft = this.task.Title;
      return;
    }
    if (title !== this.task.Title) this.patch({ Title: title }, 'Title updated');
  }

  markDone() {
    this.setStatus(this.task?.Status === 'Done' ? 'To Do' : 'Done');
  }

  // ---------- header actions ----------

  copyLink() {
    if (!this.task) return;
    const url = `${window.location.origin}/tasks/${this.task.ID}`;
    navigator.clipboard?.writeText(url).then(
      () => this.notificationsService.showNotification('success', 'Task link copied'),
      () => this.notificationsService.showNotification('error', 'Could not copy link')
    );
  }

  /** jump to a related task (dependency link) */
  openOther(ID: number) {
    if (this.mode === 'page') this.router.navigate(['/tasks', ID]);
    else this.router.navigate([], { relativeTo: this.route, queryParams: { task: ID }, queryParamsHandling: 'merge' });
  }

  openFullPage() {
    if (this.task) this.router.navigate(['/tasks', this.task.ID]);
  }

  onEdit() {
    if (this.task) this.router.navigate(['/tasks/edit', this.task.ID]);
  }

  onDelete() {
    if (!this.task) return;
    const t = this.task;
    this.notificationsService.showdelete(`Delete “${this.ui.stripKey(t.Title)}”?`).then(ok => {
      if (!ok) return;
      this.loaderService.showLoader();
      this.taskService.deleteTask(t.ID).subscribe(() => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('success', 'Record Deleted Successfully...');
        if (this.mode === 'page') this.router.navigate(['/tasks']);
        else this.changed.emit(true);
      });
    });
  }
}
