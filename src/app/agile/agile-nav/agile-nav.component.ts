import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PROJECTS } from '../../services/Shared/mock-directory';

/** Agile module sub navigation: project selector (kept in ?project=) + screen links. */
@Component({
    selector: 'app-agile-nav',
    templateUrl: './agile-nav.component.html',
    styleUrl: './agile-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AgileNavComponent {
  @Input() projectID = 1;

  projects = PROJECTS;
  links = [
    { path: '/agile/backlog', label: 'Backlog' },
    { path: '/agile/planning', label: 'Sprint Planning' },
    { path: '/agile/board', label: 'Active Sprint' },  ];

  constructor(private router: Router, private route: ActivatedRoute) { }

  onProjectChange(ID: number | null) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { project: ID || 1, sprint: null, issue: null }, queryParamsHandling: 'merge' });
  }
}
