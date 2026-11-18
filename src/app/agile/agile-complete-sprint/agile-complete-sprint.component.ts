import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Issue, Sprint } from '../../Interface/agile';
import { AgileService } from '../../services/Agile/agile.service';
import { NotificationsService } from '../../services/notifications.service';
import { AgileUi } from '../agile-ui';

/** Modal: complete a sprint and decide where unfinished issues go (backlog or a planned sprint). */
@Component({
    selector: 'app-agile-complete-sprint',
    templateUrl: './agile-complete-sprint.component.html',
    styleUrl: './agile-complete-sprint.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AgileCompleteSprintComponent implements OnChanges {
  @Input() sprint!: Sprint;
  @Input() issues: Issue[] = [];           // issues of this sprint
  @Input() plannedSprints: Sprint[] = [];
  @Input() note = '';
  @Output() completed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  moveTo: number | null = null;
  saving = false;

  constructor(private agileService: AgileService, private notificationsService: NotificationsService) { }

  ngOnChanges() {
    this.moveTo = this.plannedSprints[0]?.ID ?? null;
  }

  get done(): Issue[] {
    return this.issues.filter(i => i.Status === 'Done');
  }

  get open(): Issue[] {
    return this.issues.filter(i => i.Status !== 'Done');
  }

  ui(status: string): string {
    return AgileUi.taskStatusClass(status);
  }

  stripKey(title: string): string {
    return AgileUi.stripKey(title);
  }

  pts(list: Issue[]): number {
    return this.agileService.points(list);
  }

  confirm() {
    this.saving = true;
    this.agileService.completeSprint(this.sprint.ID, this.moveTo).subscribe(res => {
      this.saving = false;
      this.notificationsService.showNotification('success', res.Status);
      this.completed.emit();
    });
  }
}
