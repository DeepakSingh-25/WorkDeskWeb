import { Component, ChangeDetectionStrategy } from '@angular/core';
import { faFolderOpen, faMagnifyingGlass, faRepeat } from '@fortawesome/free-solid-svg-icons';

/** Sub navigation shown on every Workspace screen. */
@Component({
    selector: 'app-workspace-nav',
    templateUrl: './workspace-nav.component.html',
    styleUrl: './workspace-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class WorkspaceNavComponent {
  links = [
    { Path: '/workspace/search', Label: 'Search', Icon: faMagnifyingGlass },
    { Path: '/workspace/documents', Label: 'Documents', Icon: faFolderOpen },
    { Path: '/workspace/recurring', Label: 'Recurring Tasks', Icon: faRepeat },
  ];
}
