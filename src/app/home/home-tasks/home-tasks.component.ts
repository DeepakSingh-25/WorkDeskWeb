import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Task, TaskStatus } from '../../Interface/task';
import { HomeService } from '../../services/Home/home.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { HomeUi } from '../home-ui';

type Bucket = 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Later' | 'No due date' | 'Completed';

@Component({
    selector: 'app-home-tasks',
    templateUrl: './home-tasks.component.html',
    styleUrl: './home-tasks.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeTasksComponent implements OnInit {
  ui = HomeUi;

  tasks: Task[] = [];
  groups: { name: Bucket; tasks: Task[] }[] = [];
  collapsed: { [k: string]: boolean } = { Completed: true };
  projectOptions: { ID: number; Name: string }[] = [];
  projectID: number | null = null;
  search = '';
  sortBy: 'priority' | 'due' = 'due';
  showDone = false;
  moreFilters = false;
  buckets: Bucket[] = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No due date', 'Completed'];

  constructor(
    private homeService: HomeService,
    private router: Router,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService
  ) { }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loaderService.showLoader();
    this.homeService.getContext().subscribe({
      next: ctx => {
        this.tasks = ctx.MyTasks;
        const ids = Array.from(new Set(ctx.MyTasks.map(t => t.ProjectID)));
        this.projectOptions = ids.map(id => ({ ID: id, Name: ctx.MyTasks.find(t => t.ProjectID === id)!.ProjectName }));
        this.regroup();
        this.loaderService.hideLoader();
      },
      error: () => { this.loaderService.hideLoader(); this.notificationsService.showNotification('error', 'Unable to load tasks'); }
    });
  }

  regroup() {
    const s = this.search.trim().toLowerCase();
    const rows = this.tasks.filter(t =>
      (!this.projectID || t.ProjectID === this.projectID) &&
      (!s || [t.Key, t.Title, t.ProjectName, ...t.Labels].some(v => v.toLowerCase().includes(s))));
    const rank = (p: string) => HomeUi.priorityOptions.indexOf(p);
    rows.sort((a, b) => this.sortBy === 'priority'
      ? rank(b.Priority) - rank(a.Priority) || (a.DueDate || '9').localeCompare(b.DueDate || '9')
      : (a.DueDate || '9').localeCompare(b.DueDate || '9') || rank(b.Priority) - rank(a.Priority));
    this.groups = this.buckets
      .filter(b => b !== 'Completed' || this.showDone)
      .map(name => ({ name, tasks: rows.filter(t => this.bucketOf(t) === name) }));
  }

  bucketOf(t: Task): Bucket {
    if (t.Status === 'Done') return 'Completed';
    if (!t.DueDate) return 'No due date';
    const today = this.homeService.today();
    const left = this.homeService.daysBetween(today, t.DueDate);
    if (left < 0) return 'Overdue';
    if (left === 0) return 'Today';
    if (left === 1) return 'Tomorrow';
    const sunday = this.homeService.addDays(this.homeService.weekStart(today), 6);
    return t.DueDate <= sunday ? 'This week' : 'Later';
  }

  get openCount(): number {
    return this.tasks.filter(t => t.Status !== 'Done').length;
  }

  toggle(name: string) {
    this.collapsed[name] = !this.collapsed[name];
  }

  bucketClass(name: Bucket): string {
    return name === 'Overdue' ? 'b-red' : name === 'Today' ? 'b-orange' : name === 'Completed' ? 'b-green' : name === 'No due date' ? 'b-grey' : 'b-blue';
  }

  onStatusChange(t: Task, status: TaskStatus) {
    this.homeService.setTaskStatus(t.ID, status).subscribe(() => {
      t.Status = status;
      t.UpdatedOn = new Date().toISOString();
      this.notificationsService.showNotification('success', `"${HomeUi.stripKey(t.Title)}" moved to ${status}`);
      this.regroup();
    });
  }

  toggleDone(t: Task) {
    this.onStatusChange(t, t.Status === 'Done' ? 'To Do' : 'Done');
  }

  openTask(t: Task) {
    this.router.navigate(['/tasks'], { queryParams: { task: t.ID } });
  }

  get hasFilters(): boolean {
    return !!(this.projectID || this.search);
  }

  clearFilters() {
    this.projectID = null;
    this.search = '';
    this.regroup();
  }
}
