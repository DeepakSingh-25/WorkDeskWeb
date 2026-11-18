import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-reports-nav',
    templateUrl: './reports-nav.component.html',
    styleUrl: './reports-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReportsNavComponent {
  links = [
    { label: 'Overview', path: '/reports', exact: true },
    { label: 'Projects', path: '/reports/projects', exact: false },
    { label: 'Tasks', path: '/reports/tasks', exact: false },  ];
}
