import { Component, EventEmitter, Input, OnChanges, Output, ChangeDetectionStrategy } from '@angular/core';
import { Subtask, Task } from '../../Interface/task';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { TaskUi } from '../task-ui';

@Component({
    selector: 'app-task-subtasks',
    templateUrl: './task-subtasks.component.html',
    styleUrl: './task-subtasks.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskSubtasksComponent implements OnChanges {
  @Input({ required: true }) task!: Task;
  @Output() changed = new EventEmitter<void>();
  @Output() openTask = new EventEmitter<number>();

  ui = TaskUi;
  subtasks: Subtask[] = [];
  newSubtask = '';
  blockedBy: Task[] = [];
  blocking: Task[] = [];
  candidateTasks: Task[] = [];
  selectedDependency: number | null = null;
  showDependencyPicker = false;
  private loadedFor = 0;

  searchTask = (term: string, item: Task) =>
    (item.Key + ' ' + item.Title).toLowerCase().includes(term.toLowerCase());

  constructor(private taskService: TaskService, private notificationsService: NotificationsService) { }

  ngOnChanges() {
    // parent reloads the task after every change; only refetch when a different task is shown
    if (this.task.ID !== this.loadedFor) {
      this.loadedFor = this.task.ID;
      this.load();
    }
  }

  load() {
    this.taskService.getSubtasks(this.task.ID).subscribe(d => this.subtasks = d);
    this.taskService.getDependencies(this.task.ID).subscribe(d => {
      this.blockedBy = d.blockedBy;
      this.blocking = d.blocking;
      this.taskService.getTasks({ ProjectID: this.task.ProjectID }).subscribe(all => {
        const linked = new Set([this.task.ID, ...this.blockedBy.map(t => t.ID)]);
        this.candidateTasks = all.filter(t => !linked.has(t.ID));
      });
    });
  }

  get doneCount(): number {
    return this.subtasks.filter(s => s.Done).length;
  }

  private after(message?: string) {
    if (message) this.notificationsService.showNotification('success', message);
    this.load();
    this.changed.emit();
  }

  // ---------- subtasks ----------

  addSubtask() {
    const title = this.newSubtask.trim();
    if (!title) return;
    this.taskService.addSubtask(this.task.ID, title).subscribe(() => {
      this.newSubtask = '';
      this.after();
    });
  }

  toggle(s: Subtask) {
    s.Done = !s.Done;    // instant feedback
    this.taskService.toggleSubtask(s.ID).subscribe(() => this.after());
  }

  remove(s: Subtask) {
    this.taskService.deleteSubtask(s.ID).subscribe(() => this.after('Item removed'));
  }

  // ---------- dependencies ----------

  addDependency() {
    if (!this.selectedDependency) return;
    this.taskService.addDependency(this.task.ID, this.selectedDependency).subscribe(res => {
      if (res.Status !== 'Dependency Added Successfully...') {
        this.notificationsService.showNotification('error', res.Status);
        return;
      }
      this.selectedDependency = null;
      this.showDependencyPicker = false;
      this.after(res.Status);
    });
  }

  removeDependency(t: Task) {
    this.taskService.removeDependency(this.task.ID, t.ID).subscribe(res => this.after(res.Status));
  }

  get openBlockers(): number {
    return this.blockedBy.filter(t => t.Status !== 'Done').length;
  }
}
