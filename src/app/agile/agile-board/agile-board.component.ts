import { Component, ChangeDetectionStrategy } from '@angular/core';
import { faFlagCheckered } from '@fortawesome/free-solid-svg-icons';
import { Issue, IssueStatus, Sprint } from '../../Interface/agile';
import { AgilePageBase } from '../agile-page-base';

type Swimlane = 'none' | 'assignee' | 'epic';

interface Lane {
  key: string;
  label: string;
  color: string;
  issues: Issue[];
}

@Component({
    selector: 'app-agile-board',
    templateUrl: './agile-board.component.html',
    styleUrl: './agile-board.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AgileBoardComponent extends AgilePageBase {
  faFinish = faFlagCheckered;

  sprint: Sprint | null = null;
  plannedSprints: Sprint[] = [];
  issues: Issue[] = [];
  lanes: Lane[] = [];
  statuses: IssueStatus[] = this.agileService.statuses;
  swimlane: Swimlane = 'none';
  collapsedLanes: { [key: string]: boolean } = {};
  onlyMine = false;

  draggedId: number | null = null;
  dragOverCell: string | null = null;
  drawerIssueId: number | null = null;
  showComplete = false;

  loadData(): void {
    this.loaderService.showLoader();
    this.loadEpics(() => this.buildLanes());
    this.agileService.getSprints(this.projectID).subscribe({
      next: sprints => {
        this.sprint = sprints.find(s => s.State === 'Active') || null;
        this.plannedSprints = sprints.filter(s => s.State === 'Planned');
        if (!this.sprint) { this.issues = []; this.lanes = []; this.loaderService.hideLoader(); return; }
        this.agileService.getIssues(this.projectID).subscribe({
          next: issues => {
            this.issues = issues.filter(i => i.SprintID === this.sprint!.ID);
            this.buildLanes();
            this.loaderService.hideLoader();
          },
          error: err => this.handleError(err)
        });
      },
      error: err => this.handleError(err)
    });
  }

  setSwimlane(s: Swimlane) {
    this.swimlane = s;
    this.buildLanes();
  }

  toggleMine() {
    this.onlyMine = !this.onlyMine;
    this.buildLanes();
  }

  buildLanes() {
    const list = this.onlyMine ? this.issues.filter(i => i.AssigneeID === this.agileService.currentUserID) : this.issues;
    if (this.swimlane === 'assignee') {
      const lanes: Lane[] = this.team
        .map(u => ({ key: 'u' + u.ID, label: u.Name, color: '', issues: list.filter(i => i.AssigneeID === u.ID) }))
        .filter(l => l.issues.length);
      const none = list.filter(i => !i.AssigneeID || !this.team.some(u => u.ID === i.AssigneeID));
      if (none.length) lanes.push({ key: 'u0', label: 'Unassigned', color: '', issues: none });
      this.lanes = lanes;
    } else if (this.swimlane === 'epic') {
      const lanes: Lane[] = this.epics
        .map(e => ({ key: 'e' + e.ID, label: e.Name, color: e.Color, issues: list.filter(i => i.EpicID === e.ID) }))
        .filter(l => l.issues.length);
      const none = list.filter(i => !i.EpicID || !this.epics.some(e => e.ID === i.EpicID));
      if (none.length) lanes.push({ key: 'e0', label: 'No epic', color: '#8A94A6', issues: none });
      this.lanes = lanes;
    } else {
      this.lanes = [{ key: 'all', label: '', color: '', issues: list }];
    }
  }

  cell(lane: Lane, status: string): Issue[] {
    return lane.issues.filter(i => i.Status === status);
  }

  colPoints(status: string): number {
    return this.agileService.points(this.issues.filter(i => i.Status === status));
  }

  colCount(status: string): number {
    return this.issues.filter(i => i.Status === status).length;
  }

  get totalPoints(): number {
    return this.agileService.points(this.issues);
  }

  get donePoints(): number {
    return this.colPoints('Done');
  }

  get progress(): number {
    return this.totalPoints ? Math.round(this.donePoints / this.totalPoints * 100) : 0;
  }

  get daysLeft(): number {
    return this.sprint ? Math.max(0, this.ui.daysLeft(this.sprint.EndDate)) : 0;
  }

  get timeElapsedPct(): number {
    if (!this.sprint) return 0;
    const total = this.ui.sprintDays(this.sprint.StartDate, this.sprint.EndDate);
    const gone = this.ui.daysBetween(this.sprint.StartDate, this.ui.today()) + 1;
    return Math.min(100, Math.max(0, Math.round(gone / total * 100)));
  }

  // ---------- drag & drop ----------

  onDragStart(event: DragEvent, i: Issue) {
    this.draggedId = i.ID;
    event.dataTransfer?.setData('text/plain', String(i.ID));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd() {
    this.draggedId = null;
    this.dragOverCell = null;
  }

  onDragOver(event: DragEvent, key: string) {
    event.preventDefault();
    this.dragOverCell = key;
  }

  onDragLeave(event: DragEvent, key: string) {
    const related = event.relatedTarget as Node | null;
    if (!related || !(event.currentTarget as HTMLElement).contains(related)) {
      if (this.dragOverCell === key) this.dragOverCell = null;
    }
  }

  onDrop(event: DragEvent, status: IssueStatus) {
    event.preventDefault();
    const ID = this.draggedId ?? Number(event.dataTransfer?.getData('text/plain'));
    this.onDragEnd();
    const issue = this.issues.find(i => i.ID === ID);
    if (!issue || issue.Status === status) return;
    issue.Status = status;
    this.buildLanes();
    this.agileService.updateIssueField(ID, { Status: status }).subscribe({
      next: () => this.notificationsService.showNotification('success', `${issue.Key} moved to ${status}`),
      error: err => { this.handleError(err); this.loadData(); }
    });
  }

  // ---------- drawer / complete ----------

  onIssueChanged(deleted: boolean) {
    if (deleted) this.drawerIssueId = null;
    this.loadData();
  }

  onCompleted() {
    this.showComplete = false;
    this.router.navigate(['/agile/backlog'], { queryParams: { project: this.projectID } });
  }
}
