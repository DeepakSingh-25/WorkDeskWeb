import { Component, ChangeDetectionStrategy } from '@angular/core';
import { faChevronDown, faChevronRight, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import { Issue, IssueType, Sprint } from '../../Interface/agile';
import { AgilePageBase } from '../agile-page-base';

interface BacklogSection {
  key: string;                 // sprint ID or 'backlog'
  sprint: Sprint | null;
  issues: Issue[];
}

@Component({
    selector: 'app-agile-backlog',
    templateUrl: './agile-backlog.component.html',
    styleUrl: './agile-backlog.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AgileBacklogComponent extends AgilePageBase {
  faDown = faChevronDown;
  faRight = faChevronRight;
  faGrip = faGripVertical;
  showMoreFilters = false;

  sprints: Sprint[] = [];
  sections: BacklogSection[] = [];
  collapsed: { [key: string]: boolean } = {};

  // filters
  type = '';
  epicID: number | null = null;
  assigneeID: number | null = null;
  searchValue = '';

  // quick create
  quickSection: string | null = null;
  quickType: IssueType = 'Story';
  quickTitle = '';

  // drag & drop
  draggedId: number | null = null;
  dragOverSection: string | null = null;
  dragOverItem: number | null = null;

  drawerIssueId: number | null = null;

  loadData(): void {
    this.loaderService.showLoader();
    this.loadEpics();
    this.agileService.getSprints(this.projectID).subscribe({
      next: sprints => {
        this.sprints = sprints.filter(s => s.State !== 'Completed').sort((a, b) => (a.State === 'Active' ? -1 : 0) - (b.State === 'Active' ? -1 : 0) || a.StartDate.localeCompare(b.StartDate));
        this.loadIssues();
      },
      error: err => this.handleError(err)
    });
  }

  loadIssues() {
    this.agileService.getIssues(this.projectID, { Type: this.type, EpicID: this.epicID, AssigneeID: this.assigneeID, Search: this.searchValue }).subscribe({
      next: issues => {
        this.sections = [
          ...this.sprints.map(s => ({ key: String(s.ID), sprint: s, issues: issues.filter(i => i.SprintID === s.ID) })),
          { key: 'backlog', sprint: null, issues: issues.filter(i => !i.SprintID) },
        ];
        this.loaderService.hideLoader();
      },
      error: err => this.handleError(err)
    });
  }

  get hasFilters(): boolean {
    return !!(this.type || this.epicID || this.assigneeID || this.searchValue);
  }

  clearFilters() {
    this.type = '';
    this.epicID = null;
    this.assigneeID = null;
    this.searchValue = '';
    this.loadIssues();
  }

  getSearchValue(event: Event) {
    this.searchValue = (event.target as HTMLInputElement).value;
    this.loadIssues();
  }

  toggle(key: string) {
    this.collapsed[key] = !this.collapsed[key];
  }

  points(list: Issue[]): number {
    return this.agileService.points(list);
  }

  pointsBy(list: Issue[], status: string): number {
    return this.points(list.filter(i => i.Status === status));
  }

  get totalIssues(): number {
    return this.sections.reduce((s, x) => s + x.issues.length, 0);
  }

  get unestimated(): number {
    return this.sections.reduce((s, x) => s + x.issues.filter(i => i.StoryPoints == null).length, 0);
  }

  sprintOf(ID: number | null): string {
    return this.sprints.find(s => s.ID === ID)?.Name || '';
  }

  // ---------- drag & drop ----------

  onDragStart(event: DragEvent, i: Issue) {
    this.draggedId = i.ID;
    event.dataTransfer?.setData('text/plain', String(i.ID));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd() {
    this.draggedId = null;
    this.dragOverSection = null;
    this.dragOverItem = null;
  }

  onSectionDragOver(event: DragEvent, key: string) {
    event.preventDefault();
    this.dragOverSection = key;
    this.dragOverItem = null;
  }

  onItemDragOver(event: DragEvent, key: string, i: Issue) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverSection = key;
    this.dragOverItem = i.ID === this.draggedId ? null : i.ID;
  }

  onSectionDragLeave(event: DragEvent, key: string) {
    const related = event.relatedTarget as Node | null;
    if (!related || !(event.currentTarget as HTMLElement).contains(related)) {
      if (this.dragOverSection === key) { this.dragOverSection = null; this.dragOverItem = null; }
    }
  }

  onDrop(event: DragEvent, section: BacklogSection, before: Issue | null = null) {
    event.preventDefault();
    event.stopPropagation();
    const ID = this.draggedId ?? Number(event.dataTransfer?.getData('text/plain'));
    this.onDragEnd();
    if (!ID || before?.ID === ID) return;
    const from = this.sections.find(s => s.issues.some(i => i.ID === ID));
    const issue = from?.issues.find(i => i.ID === ID);
    if (!from || !issue) return;

    // optimistic UI
    from.issues = from.issues.filter(i => i.ID !== ID);
    const idx = before ? section.issues.findIndex(i => i.ID === before.ID) : -1;
    issue.SprintID = section.sprint?.ID ?? null;
    section.issues.splice(idx < 0 ? section.issues.length : idx, 0, issue);

    this.agileService.moveIssue(ID, section.sprint?.ID ?? null, before?.ID ?? null).subscribe({
      next: () => {
        if (from !== section) {
          this.notificationsService.showNotification('success', `${issue.Key} moved to ${section.sprint?.Name || 'Backlog'}`);
        }
      },
      error: err => { this.handleError(err); this.loadIssues(); }
    });
  }

  // ---------- quick create ----------

  startQuickAdd(key: string) {
    this.quickSection = key;
    this.quickTitle = '';
    setTimeout(() => (document.getElementById('quickAdd_' + key) as HTMLInputElement | null)?.focus());
  }

  saveQuickAdd(section: BacklogSection) {
    const title = this.quickTitle.trim();
    if (!title) { this.quickSection = null; return; }
    this.agileService.issueAddEdit({
      AddEdit: 'A', ProjectID: this.projectID, Type: this.quickType, Title: title, SprintID: section.sprint?.ID ?? null,
      EpicID: this.epicID && this.epicID > 0 ? this.epicID : null,
    }).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.quickTitle = '';
      this.loadIssues();
      setTimeout(() => (document.getElementById('quickAdd_' + section.key) as HTMLInputElement | null)?.focus(), 250);
    });
  }

  createSprint() {
    this.agileService.createSprint(this.projectID).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.loadData();
    });
  }

  planSprint(s: Sprint) {
    this.router.navigate(['/agile/planning'], { queryParams: { project: this.projectID, sprint: s.ID } });
  }

  // ---------- drawer ----------

  get drawerSprint(): string {
    return this.sections.find(s => s.issues.some(i => i.ID === this.drawerIssueId))?.sprint?.Name || '';
  }

  openIssue(i: Issue) {
    this.drawerIssueId = i.ID;
  }

  onIssueChanged(deleted: boolean) {
    if (deleted) this.drawerIssueId = null;
    this.loadEpics();
    this.loadIssues();
  }
}
