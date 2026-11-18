import { Component, ChangeDetectionStrategy } from '@angular/core';

/** Full page Task Details at /tasks/:id (same content as the drawer). */
@Component({
    selector: 'app-task-page',
    template: `
      <div class="dashboard-content p-3 p-sm-4 mt-60" id="task">
        <div class="breadcrumb-lite mb-3"><a routerLink="/tasks">Tasks</a> / Task Details</div>
        <app-task-detail mode="page"></app-task-detail>
      </div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskPageComponent { }
