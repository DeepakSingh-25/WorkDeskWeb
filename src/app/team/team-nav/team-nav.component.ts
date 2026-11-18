import { Component, ChangeDetectionStrategy } from '@angular/core';

/** Sub navigation shown on every Team & Resource screen. */
@Component({
    selector: 'app-team-nav',
    templateUrl: './team-nav.component.html',
    styleUrl: './team-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TeamNavComponent {
  links = [
    { path: '/team', label: 'Directory', exact: true },
    { path: '/team/invite', label: 'Invite', exact: false },  ];
}
