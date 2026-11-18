import { Component, EventEmitter, HostListener, Input, Output, ChangeDetectionStrategy } from '@angular/core';

/** Right side drawer that hosts <app-task-detail>. Opened from List / Board / Calendar via `?task=ID`. */
@Component({
    selector: 'app-task-drawer',
    templateUrl: './task-drawer.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskDrawerComponent {
  @Input({ required: true }) taskId!: number;
  @Output() closed = new EventEmitter<void>();
  /** true when the task was deleted */
  @Output() changed = new EventEmitter<boolean>();

  @HostListener('document:keydown.escape')
  onEscape() {
    // let open ng-select / mention menus handle Escape first
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest('.ng-select-opened, .composer')) return;
    this.closed.emit();
  }
}
