import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { TaskPageBase } from '../task-page-base';

/** Filter row (project, assignee, priority, search) bound to the hosting List / Board / Calendar page. */
@Component({
    selector: 'app-task-filter-bar',
    templateUrl: './task-filter-bar.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskFilterBarComponent {
  @Input({ required: true }) page!: TaskPageBase;
  priorities = ['Low', 'Medium', 'High', 'Critical'];
  /** "More filters" (priority, my tasks) – collapsed by default */
  showMore = false;
}
