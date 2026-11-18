import { Directive, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AgileService } from '../services/Agile/agile.service';
import { NotificationsService } from '../services/notifications.service';
import { LoaderService } from '../services/Loader/loader.service';
import { EpicSummary } from '../Interface/agile';
import { DirectoryUser, PROJECTS } from '../services/Shared/mock-directory';
import { AgileUi } from './agile-ui';

/**
 * Common behaviour of all agile screens: the `?project=` query param (default project 1),
 * project team / epics lookups and error handling.
 */
@Directive()
export abstract class AgilePageBase implements OnInit, OnDestroy {
  ui = AgileUi;
  protected agileService = inject(AgileService);
  protected notificationsService = inject(NotificationsService);
  protected loaderService = inject(LoaderService);
  protected router = inject(Router);
  protected route = inject(ActivatedRoute);
  protected subs = new Subscription();

  projectID = 1;
  team: DirectoryUser[] = [];
  epics: EpicSummary[] = [];

  ngOnInit() {
    this.subs.add(this.route.queryParamMap.subscribe(q => {
      const p = Number(q.get('project')) || 1;
      const ID = PROJECTS.some(x => x.ID === p) ? p : 1;
      if (ID !== this.projectID || !this.team.length) {
        this.projectID = ID;
        this.team = this.agileService.getTeam(ID);
        this.onProjectChanged();
        this.loadData();
      }
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  abstract loadData(): void;

  /** hook for screens that keep per-project state (selected sprint, filters ...) */
  protected onProjectChanged(): void { }

  get projectName(): string {
    return PROJECTS.find(p => p.ID === this.projectID)?.Name || '';
  }

  loadEpics(done?: () => void) {
    this.agileService.getEpics(this.projectID).subscribe(e => { this.epics = e; done?.(); });
  }

  epicOf(ID: number | null): EpicSummary | undefined {
    return ID ? this.epics.find(e => e.ID === ID) : undefined;
  }

  memberName(ID: number | null): string {
    return this.team.find(u => u.ID === ID)?.Name || '';
  }

  protected handleError(error: any) {
    this.loaderService.hideLoader();
    if (error?.status == 401) {
      this.router.navigate(['/login']);
    } else {
      this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
    }
  }
}
