import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { Issue, Sprint, SprintCapacity } from '../../Interface/agile';
import { AgilePageBase } from '../agile-page-base';

@Component({
    selector: 'app-agile-planning',
    templateUrl: './agile-planning.component.html',
    styleUrl: './agile-planning.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AgilePlanningComponent extends AgilePageBase {
  private fb = inject(FormBuilder);
  faRight = faArrowRight;
  faLeft = faArrowLeft;
  showVelocity = false;
  showCapacity = false;

  sprints: Sprint[] = [];
  plannedSprints: Sprint[] = [];
  activeSprint: Sprint | null = null;
  sprint: Sprint | null = null;
  selectedSprintID: number | null = null;

  backlog: Issue[] = [];
  sprintItems: Issue[] = [];
  activeItems: Issue[] = [];
  backlogSearch = '';
  velocity: { Name: string; Committed: number; Completed: number }[] = [];

  draggedId: number | null = null;
  dragOver: 'backlog' | 'sprint' | null = null;
  showComplete = false;
  submitted = false;

  form = this.fb.group({
    txtName: ['', [Validators.required, Validators.maxLength(60)]],
    txtGoal: ['', Validators.maxLength(250)],
    txtStartDate: ['', Validators.required],
    txtEndDate: ['', Validators.required],
  });

  protected override onProjectChanged() {
    this.selectedSprintID = Number(this.route.snapshot.queryParamMap.get('sprint')) || null;
  }

  loadData(): void {
    this.loaderService.showLoader();
    this.loadEpics();
    this.velocity = this.agileService.getVelocity(this.projectID, 3);
    this.agileService.getSprints(this.projectID).subscribe({
      next: sprints => {
        this.sprints = sprints;
        this.plannedSprints = sprints.filter(s => s.State === 'Planned');
        this.activeSprint = sprints.find(s => s.State === 'Active') || null;
        this.sprint = this.plannedSprints.find(s => s.ID === this.selectedSprintID) || this.plannedSprints[0] || null;
        this.selectedSprintID = this.sprint?.ID ?? null;
        if (this.sprint) {
          this.submitted = false;
          this.form.reset({ txtName: this.sprint.Name, txtGoal: this.sprint.Goal, txtStartDate: this.sprint.StartDate, txtEndDate: this.sprint.EndDate });
        }
        this.loadIssues();
      },
      error: err => this.handleError(err)
    });
  }

  loadIssues() {
    this.agileService.getIssues(this.projectID).subscribe({
      next: issues => {
        this.backlog = issues.filter(i => !i.SprintID && i.Status !== 'Done');
        this.sprintItems = this.sprint ? issues.filter(i => i.SprintID === this.sprint!.ID) : [];
        this.activeItems = this.activeSprint ? issues.filter(i => i.SprintID === this.activeSprint!.ID) : [];
        this.loaderService.hideLoader();
      },
      error: err => this.handleError(err)
    });
  }

  selectSprint(ID: number) {
    this.selectedSprintID = ID;
    this.router.navigate([], { relativeTo: this.route, queryParams: { sprint: ID }, queryParamsHandling: 'merge' });
    this.loadData();
  }

  createSprint() {
    this.agileService.createSprint(this.projectID).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.selectedSprintID = res.ID;
      this.loadData();
    });
  }

  get f() {
    return this.form.controls;
  }

  get filteredBacklog(): Issue[] {
    const q = this.backlogSearch.trim().toLowerCase();
    return q ? this.backlog.filter(i => i.Title.toLowerCase().includes(q) || i.Key.toLowerCase().includes(q)) : this.backlog;
  }

  saveSprint() {
    this.submitted = true;
    if (this.form.invalid || !this.sprint) return;
    const v = this.form.value;
    if ((v.txtEndDate || '') < (v.txtStartDate || '')) {
      this.notificationsService.showNotification('error', 'End date must be after start date.');
      return;
    }
    this.agileService.updateSprint(this.sprint.ID, {
      Name: v.txtName!.trim(), Goal: (v.txtGoal || '').trim(), StartDate: v.txtStartDate!, EndDate: v.txtEndDate!,
    }).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.loadData();
    });
  }

  resetSprint() {
    if (!this.sprint) return;
    this.submitted = false;
    this.form.reset({ txtName: this.sprint.Name, txtGoal: this.sprint.Goal, txtStartDate: this.sprint.StartDate, txtEndDate: this.sprint.EndDate });
  }

  // ---------- capacity ----------

  get sprintLength(): number {
    const v = this.form.value;
    return v.txtStartDate && v.txtEndDate ? Math.max(1, this.ui.sprintDays(v.txtStartDate, v.txtEndDate)) : 14;
  }

  capPoints(c: SprintCapacity): number {
    return c.FocusFactor ? Math.floor(c.AvailableHours / c.FocusFactor) : 0;
  }

  assignedPoints(userID: number): number {
    return this.agileService.points(this.sprintItems.filter(i => i.AssigneeID === userID));
  }

  get capacityPoints(): number {
    return (this.sprint?.Capacity || []).reduce((s, c) => s + this.capPoints(c), 0);
  }

  get committed(): number {
    return this.agileService.points(this.sprintItems);
  }

  get unestimatedCount(): number {
    return this.sprintItems.filter(i => i.StoryPoints == null).length;
  }

  get loadPct(): number {
    return this.capacityPoints ? Math.round(this.committed / this.capacityPoints * 100) : 0;
  }

  get avgVelocity(): number {
    return this.velocity.length ? Math.round(this.velocity.reduce((s, v) => s + v.Completed, 0) / this.velocity.length) : 0;
  }

  get maxVelocity(): number {
    return Math.max(1, ...this.velocity.map(v => Math.max(v.Committed, v.Completed)), this.committed);
  }

  userWeekly(userID: number): number {
    return this.team.find(u => u.ID === userID)?.WeeklyCapacityHours || 0;
  }

  saveCapacity() {
    if (!this.sprint) return;
    this.sprint.Capacity.forEach(c => {
      c.AvailableHours = Math.max(0, Math.min(400, Number(c.AvailableHours) || 0));
      c.FocusFactor = Math.max(1, Math.min(40, Number(c.FocusFactor) || 1));
    });
    this.agileService.updateSprint(this.sprint.ID, { Capacity: this.sprint.Capacity }).subscribe();
  }

  resetCapacity() {
    if (!this.sprint) return;
    const weeks = this.sprintLength / 7;
    this.sprint.Capacity.forEach(c => c.AvailableHours = Math.round(this.userWeekly(c.UserID) * weeks * 0.8));
    this.saveCapacity();
  }

  // ---------- move issues ----------

  addToSprint(i: Issue) {
    if (!this.sprint) return;
    this.move(i, this.sprint.ID);
  }

  removeFromSprint(i: Issue) {
    this.move(i, null);
  }

  private move(i: Issue, sprintID: number | null) {
    if (sprintID) {
      this.backlog = this.backlog.filter(x => x.ID !== i.ID);
      this.sprintItems = [...this.sprintItems, { ...i, SprintID: sprintID }];
    } else {
      this.sprintItems = this.sprintItems.filter(x => x.ID !== i.ID);
      this.backlog = [{ ...i, SprintID: null }, ...this.backlog];
    }
    this.agileService.moveIssue(i.ID, sprintID, null).subscribe({ error: err => { this.handleError(err); this.loadIssues(); } });
  }

  onDragStart(event: DragEvent, i: Issue) {
    this.draggedId = i.ID;
    event.dataTransfer?.setData('text/plain', String(i.ID));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd() {
    this.draggedId = null;
    this.dragOver = null;
  }

  onDragOver(event: DragEvent, target: 'backlog' | 'sprint') {
    event.preventDefault();
    this.dragOver = target;
  }

  onDragLeave(event: DragEvent, target: 'backlog' | 'sprint') {
    const related = event.relatedTarget as Node | null;
    if (!related || !(event.currentTarget as HTMLElement).contains(related)) {
      if (this.dragOver === target) this.dragOver = null;
    }
  }

  onDrop(event: DragEvent, target: 'backlog' | 'sprint') {
    event.preventDefault();
    const ID = this.draggedId ?? Number(event.dataTransfer?.getData('text/plain'));
    this.onDragEnd();
    if (target === 'sprint') {
      const i = this.backlog.find(x => x.ID === ID);
      if (i) this.addToSprint(i);
    } else {
      const i = this.sprintItems.find(x => x.ID === ID);
      if (i) this.removeFromSprint(i);
    }
  }

  // ---------- start sprint ----------

  async startSprint() {
    if (!this.sprint) return;
    if (!this.sprintItems.length) {
      this.notificationsService.showNotification('error', 'Add at least one issue before starting the sprint.');
      return;
    }
    if (this.activeSprint) {
      this.showComplete = true;      // only one active sprint: complete the current one first
      return;
    }
    let message = `Start ${this.sprint.Name} with ${this.sprintItems.length} items (${this.committed} story points)?`;
    if (this.committed > this.capacityPoints) message += ` Commitment is more than the team can do by ${this.committed - this.capacityPoints} story points.`;
    const ok = await this.notificationsService.showConfirm(message);
    if (ok) this.doStart();
  }

  onActiveCompleted() {
    this.showComplete = false;
    this.doStart();
  }

  get otherPlanned(): Sprint[] {
    return this.plannedSprints.filter(s => s.ID !== this.sprint?.ID);
  }

  private doStart() {
    if (!this.sprint) return;
    this.agileService.startSprint(this.sprint.ID).subscribe(res => {
      const ok = res.Status.includes('Successfully');
      this.notificationsService.showNotification(ok ? 'success' : 'error', res.Status);
      if (ok) this.router.navigate(['/agile/board'], { queryParams: { project: this.projectID } });
    });
  }
}
