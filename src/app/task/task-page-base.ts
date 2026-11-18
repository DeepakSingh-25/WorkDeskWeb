import { Directive, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TaskFilter, TaskService } from '../services/Task/task.service';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { TaskUi } from './task-ui';

/**
 * Common behaviour of the List / Board / Calendar views:
 * filter bar state, `?project=` pre-filter, and the `?task=` detail drawer.
 */
@Directive()
export abstract class TaskPageBase implements OnInit, OnDestroy {
  ui = TaskUi;
  protected taskService = inject(TaskService);
  protected notificationsService = inject(NotificationsService);
  protected loaderService = inject(LoaderService);
  protected router = inject(Router);
  protected route = inject(ActivatedRoute);
  protected subs = new Subscription();

  drpProjectData: { ID: number; Name: string }[] = [];
  drpUserData: { ID: number; Name: string }[] = [];

  projectID: number | null = null;
  assigneeID: number | null = null;
  priority = '';
  searchValue = '';
  drawerTaskId: number | null = null;

  ngOnInit() {
    this.taskService.getProjectOptions().subscribe(d => this.drpProjectData = d);
    this.taskService.getUserOptions().subscribe(d => this.drpUserData = d);
    let first = true;
    this.subs.add(this.route.queryParamMap.subscribe(q => {
      const project = q.get('project') ? Number(q.get('project')) : null;
      const projectChanged = project !== this.projectID;
      this.projectID = project;
      this.drawerTaskId = q.get('task') ? Number(q.get('task')) : null;
      if (first || projectChanged) this.loadData();
      first = false;
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  abstract loadData(): void;

  get filter(): TaskFilter {
    return { ProjectID: this.projectID, AssigneeID: this.assigneeID, Priority: this.priority, Search: this.searchValue };
  }

  get keepParams() {
    return { project: this.projectID || null };
  }

  get hasFilters(): boolean {
    return !!(this.projectID || this.assigneeID || this.priority || this.searchValue);
  }

  onProjectChange(ID: number | null) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { project: ID || null }, queryParamsHandling: 'merge' });
  }

  onFilterChange() {
    this.loadData();
  }

  getSearchValue(event: any) {
    this.searchValue = event.target.value;
    this.loadData();
  }

  clearFilters() {
    this.assigneeID = null;
    this.priority = '';
    this.searchValue = '';
    if (this.projectID) this.onProjectChange(null);
    else this.loadData();
  }

  myTasks() {
    this.assigneeID = this.taskService.currentUser.ID;
    this.loadData();
  }

  openTask(ID: number) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { task: ID }, queryParamsHandling: 'merge' });
  }

  closeTask() {
    this.router.navigate([], { relativeTo: this.route, queryParams: { task: null }, queryParamsHandling: 'merge' });
  }

  /** drawer reports a change (status, delete, comment ...) */
  onTaskChanged(deleted = false) {
    if (deleted) this.closeTask();
    this.loadData();
  }

  protected handleError(error: any) {
    this.loaderService.hideLoader();
    if (error?.status == 401) {
      this.router.navigate(['/login']);
    } else {
      this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
    }
  }
}
