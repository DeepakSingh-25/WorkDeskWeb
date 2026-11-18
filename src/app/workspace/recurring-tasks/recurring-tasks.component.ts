import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { RecurringRule } from '../../Interface/workspace';
import { WorkspaceService } from '../../services/Workspace/workspace.service';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { WorkspaceUi } from '../workspace-ui';

interface RuleRow extends RecurringRule { Summary: string; EndText: string; NextRun: Date | null; }

/** Recurring task rules (`/workspace/recurring`). */
@Component({
    selector: 'app-recurring-tasks',
    templateUrl: './recurring-tasks.component.html',
    styleUrl: './recurring-tasks.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RecurringTasksComponent implements OnInit {
  ui = WorkspaceUi;
  faClose = faXmark;

  rules: RuleRow[] = [];
  statusTab: '' | 'Active' | 'Paused' = '';
  search = '';
  running: number | null = null;
  runsDueThisWeek = 0;
  created: { TaskID: number; Key: string; Title: string } | null = null;

  constructor(
    private workspaceService: WorkspaceService,
    private taskService: TaskService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private router: Router
  ) { }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loaderService.showLoader();
    this.workspaceService.getRecurringRules().subscribe({
      next: rules => {
        this.rules = rules.map(r => ({
          ...r, Summary: WorkspaceUi.scheduleSummary(r), EndText: WorkspaceUi.endSummary(r),
          NextRun: r.Active ? (WorkspaceUi.occurrences(r, 1)[0] || null) : null
        }));
        this.runsDueThisWeek = this.countDueThisWeek();
        this.loaderService.hideLoader();
      },
      error: () => this.loaderService.hideLoader()
    });
  }

  get filtered(): RuleRow[] {
    return this.rules
      .filter(r => !this.statusTab || (this.statusTab === 'Active' ? r.Active : !r.Active))
      .filter(r => !this.search || WorkspaceUi.matches(this.search, r.Title, r.ProjectName, r.AssigneeName, r.Summary))
      .sort((a, b) => (a.NextRun?.getTime() ?? Infinity) - (b.NextRun?.getTime() ?? Infinity));
  }

  count(tab: '' | 'Active' | 'Paused'): number {
    return this.rules.filter(r => !tab || (tab === 'Active' ? r.Active : !r.Active)).length;
  }

  get nextUp(): RuleRow | undefined {
    return this.rules.filter(r => r.NextRun).sort((a, b) => a.NextRun!.getTime() - b.NextRun!.getTime())[0];
  }

  private countDueThisWeek(): number {
    const now = new Date(), end = new Date();
    end.setDate(end.getDate() + 7);
    return this.rules.filter(r => r.Active).reduce((s, r) => s + WorkspaceUi.occurrences(r, 50, now).filter(d => d <= end).length, 0);
  }

  get totalRuns(): number {
    return this.rules.reduce((s, r) => s + r.RunCount, 0);
  }

  toggleActive(r: RuleRow) {
    this.workspaceService.setRecurringActive(r.ID, !r.Active).subscribe(() => {
      this.notificationsService.showNotification('success', `“${r.Title}” ${r.Active ? 'paused' : 'activated'}`);
      this.load();
    });
  }

  runNow(r: RuleRow) {
    this.running = r.ID;
    const today = WorkspaceUi.today();
    this.taskService.taskAddEdit({
      AddEdit: 'A', ProjectID: r.ProjectID, Title: r.Title, Description: r.Description, Status: 'To Do', Priority: r.Priority,
      AssigneeID: r.AssigneeID, StartDate: today, DueDate: WorkspaceUi.addDays(new Date(), r.DueOffsetDays),
      EstimateHours: r.EstimateHours, Labels: [...r.Labels]
    }).subscribe({
      next: res => {
        const TaskID = Number(res.ID);
        this.taskService.getTaskByID(TaskID).subscribe(t => {
          this.created = { TaskID, Key: t?.Key || `#${TaskID}`, Title: t?.Title || r.Title };
          this.workspaceService.markRecurringRun(r.ID, TaskID).subscribe(() => {
            this.running = null;
            this.notificationsService.showNotification('success', res.Status);
            this.load();
          });
        });
      },
      error: () => { this.running = null; this.notificationsService.showNotification('error', 'Something went wrong. Please try again.'); }
    });
  }

  onEdit(r: RuleRow) {
    this.router.navigate(['/workspace/recurring/edit', r.ID]);
  }

  onDelete(r: RuleRow) {
    this.notificationsService.showdelete(`Delete recurring rule “${r.Title}”? Tasks already created are kept.`).then(ok => {
      if (!ok) return;
      this.workspaceService.deleteRecurringRule(r.ID).subscribe(res => {
        this.notificationsService.showNotification('success', res.Status);
        this.load();
      });
    });
  }
}
