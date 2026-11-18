import { Component, ChangeDetectionStrategy, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, catchError, debounceTime, finalize, forkJoin, of } from 'rxjs';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { SearchResult, SearchResultType } from '../../Interface/workspace';
import { Project } from '../../Interface/project';
import { ProjectService } from '../../services/Project/project.service';
import { TaskService } from '../../services/Task/task.service';
import { WorkspaceService } from '../../services/Workspace/workspace.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { NotificationsService } from '../../services/notifications.service';
import { DEPARTMENTS, TEAMS, USERS } from '../../services/Shared/mock-directory';
import { WorkspaceUi } from '../workspace-ui';

interface ResultGroup {
  Type: SearchResultType;
  Label: string;
  Items: SearchResult[];
  Total: number;
}

/** Global search across projects, tasks, people, documents and help (`/workspace/search?q=`). */
@Component({
    selector: 'app-global-search',
    templateUrl: './global-search.component.html',
    styleUrl: './global-search.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  ui = WorkspaceUi;
  faClose = faXmark;

  readonly types: { Type: SearchResultType; Label: string; Word: string }[] = [
    { Type: 'Project', Label: 'Projects', Word: 'Project' },
    { Type: 'Task', Label: 'Tasks', Word: 'Task' },
    { Type: 'Person', Label: 'People', Word: 'Person' },
    { Type: 'Document', Label: 'Files', Word: 'File' },
    { Type: 'Help', Label: 'Help', Word: 'Help' },
  ];
  readonly suggestions = ['CRM', 'sprint', 'invoice', 'Priya', 'backup', 'release notes', 'policy'];
  private readonly recentKey = 'pm.workspace.recentSearches';
  private readonly perGroup = 5;

  index: SearchResult[] = [];
  loaded = false;
  query = '';          // input value
  q = '';              // applied query (from URL)
  typeFilter: SearchResultType | '' = '';
  groups: ResultGroup[] = [];
  counts: { [t: string]: number } = {};
  flat: SearchResult[] = [];
  activeIndex = -1;
  recent: string[] = [];

  private input$ = new Subject<string>();
  private subs = new Subscription();

  constructor(
    private projectService: ProjectService,
    private taskService: TaskService,
    private workspaceService: WorkspaceService,
    private loaderService: LoaderService,
    private notificationsService: NotificationsService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.recent = this.readRecent();
    this.loaderService.showLoader();
    forkJoin({
      // Projects.View na ho to 403 — sirf projects khaali, baaki search chalta rahe.
      projects: this.projectService.getAllProjects(false).pipe(catchError(() => of([] as Project[]))),
      archived: this.projectService.getAllProjects(true).pipe(catchError(() => of([] as Project[]))),
      tasks: this.taskService.getTasks({}),
      files: this.workspaceService.getFiles(),
      articles: this.workspaceService.getHelpArticles(),
      categories: this.workspaceService.getHelpCategories(),
    }).pipe(finalize(() => this.loaderService.hideLoader())).subscribe({
      next: d => {
        const idx: SearchResult[] = [];
        [...(d.projects || []), ...(d.archived || [])].forEach(p => idx.push({
          Type: 'Project', ID: p.ID, Title: p.Name, Subtitle: `${p.Code} · ${p.ClientName} · ${p.ManagerName}`,
          Meta: p.IsArchived ? 'Archived' : p.Status, Link: `/projects/${p.ID}`, QueryParams: null
        }));
        d.tasks.forEach(t => idx.push({
          Type: 'Task', ID: t.ID, Title: `${t.Key} ${t.Title}`, Subtitle: `${t.ProjectName}${t.AssigneeName ? ' · ' + t.AssigneeName : ''}${t.Labels.length ? ' · ' + t.Labels.join(', ') : ''}`,
          Meta: t.Status, Link: '/tasks', QueryParams: { task: t.ID }
        }));
        USERS.forEach(u => idx.push({
          Type: 'Person', ID: u.ID, Title: u.Name,
          Subtitle: `${u.Designation} · ${TEAMS.find(t => t.ID === u.TeamID)?.Name || ''} · ${DEPARTMENTS.find(x => x.ID === u.DepartmentID)?.Name || ''}`,
          Meta: u.Email, Link: `/team/people/${u.ID}`, QueryParams: null
        }));
        d.files.forEach(f => idx.push({
          Type: 'Document', ID: f.ID, Title: f.Name, Subtitle: `${this.workspaceService.folderPath(f.FolderID)}${f.Tags.length ? ' · ' + f.Tags.join(', ') : ''}`,
          Meta: WorkspaceUi.formatBytes(f.FileSize), Link: '/workspace/documents', QueryParams: { doc: f.ID }
        }));
        this.index = idx;
        this.loaded = true;
        this.runSearch();
      },
      error: () => {
        // "Searching…" par atka na rahe — khaali index ke saath "no results" dikhao.
        this.index = [];
        this.loaded = true;
        this.runSearch();
        this.notificationsService.showNotification('error', 'Unable to load search data');
      }
    });

    let first = true;
    this.subs.add(this.route.queryParamMap.subscribe(p => {
      const q = p.get('q') || '';
      const type = (p.get('type') || '') as SearchResultType | '';
      if (q !== this.q && q !== this.query.trim()) this.query = q;
      if (first && q) this.addRecent(q);       // arrived from the header search box
      first = false;
      this.q = q;
      this.typeFilter = this.types.some(t => t.Type === type) ? type : '';
      this.runSearch();
    }));

    this.subs.add(this.input$.pipe(debounceTime(300)).subscribe(v => this.applyQuery(v)));
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  // ---------------- input ----------------
  onInput(event: Event) {
    this.query = (event.target as HTMLInputElement).value;
    this.input$.next(this.query);
  }

  private applyQuery(v: string) {
    const q = v.trim();
    if (q === this.q) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: { q: q || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  useQuery(q: string) {
    this.query = q;
    this.applyQuery(q);
    this.searchInput?.nativeElement.focus();
  }

  clear() {
    this.query = '';
    this.applyQuery('');
    this.searchInput?.nativeElement.focus();
  }

  setType(t: SearchResultType | '') {
    this.router.navigate([], { relativeTo: this.route, queryParams: { type: t || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.flat.length) this.setActive(Math.min(this.flat.length - 1, this.activeIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.flat.length) this.setActive(Math.max(0, this.activeIndex - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.activeIndex >= 0 && this.flat[this.activeIndex]) this.open(this.flat[this.activeIndex]);
      else { this.addRecent(this.query); this.applyQuery(this.query); }
    } else if (event.key === 'Escape') {
      this.clear();
    }
  }

  private setActive(i: number) {
    this.activeIndex = i;
    setTimeout(() => document.getElementById('ws-sr-' + i)?.scrollIntoView({ block: 'nearest' }));
  }

  // ---------------- search ----------------
  private runSearch() {
    this.activeIndex = -1;
    if (!this.loaded || !this.q) {
      this.groups = [];
      this.flat = [];
      this.counts = {};
      return;
    }
    const matches = this.index.filter(r => WorkspaceUi.matches(this.q, r.Title, r.Subtitle, r.Meta))
      .sort((a, b) => this.score(b) - this.score(a));
    this.counts = { All: matches.length };
    this.types.forEach(t => this.counts[t.Type] = matches.filter(m => m.Type === t.Type).length);
    this.groups = this.types
      .filter(t => !this.typeFilter || t.Type === this.typeFilter)
      .map(t => {
        const all = matches.filter(m => m.Type === t.Type);
        return { Type: t.Type, Label: t.Label, Total: all.length, Items: this.typeFilter ? all : all.slice(0, this.perGroup) };
      })
      .filter(g => g.Total > 0);
    this.flat = this.groups.flatMap(g => g.Items);
    if (this.flat.length) this.activeIndex = 0;
  }

  /** title matches rank above subtitle matches; prefix matches rank highest */
  private score(r: SearchResult): number {
    const q = this.q.toLowerCase(), t = r.Title.toLowerCase();
    return (t.startsWith(q) ? 3 : 0) + (t.includes(q) ? 2 : 0) + (WorkspaceUi.matches(q, r.Title) ? 1 : 0);
  }

  /** One small word shown on the right of a result row. */
  typeWord(t: SearchResultType): string {
    return this.types.find(x => x.Type === t)?.Word || t;
  }

  typeLabel(t: SearchResultType | ''): string {
    return this.types.find(x => x.Type === t)?.Label || '';
  }

  /** Results not shown in the short "All" list (each type is capped there). */
  get hiddenCount(): number {
    return this.typeFilter ? 0 : (this.counts['All'] || 0) - this.flat.length;
  }

  open(r: SearchResult) {
    this.addRecent(this.q);
    this.router.navigate([r.Link], { queryParams: r.QueryParams || {} });
  }

  // ---------------- recent searches ----------------
  private readRecent(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(this.recentKey) || '[]');
      return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 8) : [];
    } catch {
      return [];
    }
  }

  private addRecent(q: string) {
    const v = (q || '').trim();
    if (v.length < 2) return;
    this.recent = [v, ...this.recent.filter(x => x.toLowerCase() !== v.toLowerCase())].slice(0, 8);
    this.saveRecent();
  }

  removeRecent(q: string, event: Event) {
    event.stopPropagation();
    this.recent = this.recent.filter(x => x !== q);
    this.saveRecent();
  }

  clearRecent() {
    this.recent = [];
    this.saveRecent();
  }

  private saveRecent() {
    try {
      localStorage.setItem(this.recentKey, JSON.stringify(this.recent));
    } catch { /* storage unavailable (private mode) */ }
  }
}
