import { Injectable, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Project } from '../Interface/project';
import { ProjectService } from '../services/Project/project.service';
import { NotificationsService } from '../services/notifications.service';
import { ProjectErrorsService } from './project-errors.service';

/**
 * Holds the currently opened project for the Project Details shell and its tabs.
 * Provided at ProjectDetailsComponent level, so every child tab shares one instance.
 */
@Injectable()
export class ProjectContextService implements OnDestroy {
  private projectSubject = new BehaviorSubject<Project | null>(null);
  project$ = this.projectSubject.asObservable();
  projectID = 0;
  /** true jab last load 404 ke alawa kisi error se fail hua (offline / 500) — "not found" se alag dikhana hai. */
  loadError = false;
  private loadSub: Subscription | null = null;

  constructor(
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private errors: ProjectErrorsService
  ) { }

  get project(): Project | null {
    return this.projectSubject.value;
  }

  load(ID: number) {
    this.projectID = ID;
    this.reload();
  }

  reload() {
    // Purana load chal raha ho to cancel — results out of order na aayen.
    this.loadSub?.unsubscribe();
    this.loadSub = this.projectService.getProjectByID(this.projectID).subscribe({
      next: p => {
        this.loadError = false;
        this.projectSubject.next(p ?? null);
      },
      error: (err: unknown) => {
        // 401: AuthInterceptor already logged out and navigated.
        if (err instanceof HttpErrorResponse && err.status === 401) return;
        this.loadError = true;
        this.projectSubject.next(null);
        this.notificationsService.showNotification('error', this.errors.message(err, 'Could not load the project. Please try again.'));
      }
    });
  }

  ngOnDestroy() {
    this.loadSub?.unsubscribe();
  }
}
