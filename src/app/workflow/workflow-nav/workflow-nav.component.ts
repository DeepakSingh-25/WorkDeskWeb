import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';

/** Sub navigation shown on every Workflow & Approval screen. */
@Component({
    selector: 'app-workflow-nav',
    templateUrl: './workflow-nav.component.html',
    styleUrl: './workflow-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class WorkflowNavComponent {
  private router = inject(Router);

  links = [
    { url: '/workflows', label: 'Workflows', exact: true },
    { url: '/workflows/designer', label: 'Designer', exact: false },
    { url: '/workflows/statuses', label: 'Statuses', exact: false },  ];

  /** Designer tab stays active for any /workflows/designer/:id */
  isDesigner(): boolean {
    return this.router.url.startsWith('/workflows/designer');
  }
}
