import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, forkJoin, of, switchMap } from 'rxjs';
import { Milestone, Project, ProjectActivity, ProjectMember } from '../../Interface/project';
import { ProjectService } from '../../services/Project/project.service';
import { ProjectContextService } from '../project-context.service';
import { ProjectErrorsService } from '../project-errors.service';
import { ProjectUi } from '../project-ui';

@Component({
    selector: 'app-project-overview',
    templateUrl: './project-overview.component.html',
    styleUrl: './project-overview.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProjectOverviewComponent implements OnInit {
  ui = ProjectUi;
  project: Project | null = null;
  members: ProjectMember[] = [];
  milestones: Milestone[] = [];
  activities: { who: string; text: string; when: string }[] = [];

  constructor(
    private context: ProjectContextService,
    private projectService: ProjectService,
    private errors: ProjectErrorsService,
    private destroyRef: DestroyRef
  ) { }

  ngOnInit() {
    // switchMap: naya project aaya to purani requests cancel.
    this.context.project$.pipe(
      switchMap(p => {
        this.project = p;
        if (!p) return EMPTY;
        // Har call apna fallback [] — ek fail ho to baaki cards khaali na hon; toast sirf ek baar.
        let failed = false;
        const safe = <T>(src: Observable<T[]>) => src.pipe(catchError((err: unknown) => {
          if (!failed) {
            failed = true;
            this.errors.handle(err, 'Could not load the project overview. Please try again.');
          }
          return of([] as T[]);
        }));
        return forkJoin({
          members: safe(this.projectService.getProjectMembers(p.ID)),
          milestones: safe(this.projectService.getMilestones(p.ID)),
          activity: safe(this.projectService.getActivity(p.ID, 20)),
        });
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(d => {
      this.members = d.members ?? [];
      this.milestones = d.milestones ?? [];
      this.activities = (d.activity ?? []).map(a => this.toActivity(a));
    });
  }

  get upcomingMilestones(): Milestone[] {
    return this.milestones.filter(m => m.Status !== 'Completed').slice(0, 4);
  }

  get budgetUsed(): number {
    return this.project && this.project.Budget ? Math.round(this.project.Spent / this.project.Budget * 100) : 0;
  }

  get daysLeft(): number {
    return this.project ? ProjectUi.daysLeft(this.project.EndDate) : 0;
  }

  /** A1 row → feed row: who = actor, text = action (first letter lower-case) + “detail”, when = UTC ISO (date pipe → local day). */
  private toActivity(a: ProjectActivity): { who: string; text: string; when: string } {
    const action = a.Action ? a.Action.charAt(0).toLowerCase() + a.Action.slice(1) : '';
    return {
      who: a.ActorName,
      text: action + (a.Detail ? ` “${a.Detail}”` : ''),
      when: this.asUtc(a.Timestamp)
    };
  }

  // API DateTime (Kind Unspecified) bina 'Z' ke aata hai, par value UTC hai — zone na ho to 'Z' laga do.
  private asUtc(ts: string): string {
    if (!ts) return '';
    return /(Z|[+-]\d{2}:?\d{2})$/i.test(ts) ? ts : ts + 'Z';
  }
}
