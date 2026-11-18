import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { IsActiveMatchOptions } from '@angular/router';
import { faList, faTableColumns } from '@fortawesome/free-solid-svg-icons';

/** Page header shared by Task List / Board: title, view switcher and Create button. */
@Component({
    selector: 'app-task-view-tabs',
    templateUrl: './task-view-tabs.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskViewTabsComponent {
  @Input() title = 'Tasks';
  @Input() subtitle = '';
  /** query params to keep while switching views (e.g. selected project) */
  @Input() keepParams: { [k: string]: any } = {};
  faList = faList;
  faBoard = faTableColumns;  activeOptions: IsActiveMatchOptions = { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' };
}
