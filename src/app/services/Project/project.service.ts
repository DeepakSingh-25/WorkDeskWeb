import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../Auth/auth.service';
import {
  Milestone, PagedResult, Project, ProjectActionResponse, ProjectActivity, ProjectCategory, ProjectLookups, ProjectMember,
  ProjectSettings, ProjectSummary, ProjectTask, ProjectUser, SaveMemberRequest, SaveMilestoneRequest, SaveProjectRequest,
  SaveProjectSettingsRequest
} from '../../Interface/project';

/**
 * Projects — live API (`api/Projects`, spec 007-projects). Token AuthInterceptor lagata hai.
 * Errors catch nahi karte (P3 404 ko chhod kar): HttpErrorResponse component tak jaata hai.
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private url = `${environment.baseUrl}Projects`;
  // P9 ek hi baar mangate hain; error par cache reset, taaki retry kaam kare.
  // Cache token se bandha hai (EntitlementService jaisa) — logout → doosra user login kare to purani list na dikhe.
  private lookups$: Observable<ProjectLookups> | null = null;
  private lookupsFor: string | null = null;

  constructor(private http: HttpClient, private authService: AuthService) { }

  // ---------------- Projects ----------------

  /** P1. Empty params are not sent. */
  getPaginatedProjectList(startIndex: number, length: number, sortColumn: string, sortColumnDir: string,
    criteriaSearch: string, status: string = '', archived: boolean = false): Observable<PagedResult<Project>> {
    let params = new HttpParams()
      .set('StartIndex', String(startIndex))
      .set('Length', String(length))
      .set('Archived', String(archived));
    if (sortColumn) params = params.set('SortColumn', sortColumn);
    if (sortColumnDir) params = params.set('SortDir', sortColumnDir);
    const search = (criteriaSearch || '').trim();
    if (search) params = params.set('Search', search);
    if (status) params = params.set('Status', status);
    return this.http.get<PagedResult<Project>>(this.url, { params });
  }

  /** Q13 — unpaged list (Home / Reports / Global search), ordered by Code. */
  getAllProjects(archived: boolean = false): Observable<Project[]> {
    const params = new HttpParams().set('Archived', String(archived));
    return this.http.get<Project[]>(`${this.url}/all`, { params });
  }

  /** P2 */
  getProjectSummary(): Observable<ProjectSummary> {
    return this.http.get<ProjectSummary>(`${this.url}/summary`);
  }

  /** P3. 404 ⇒ undefined (screens show "not found"); every other error is rethrown. */
  getProjectByID(ID: number): Observable<Project | undefined> {
    return this.http.get<Project>(`${this.url}/${ID}`).pipe(
      catchError((err: unknown) => err instanceof HttpErrorResponse && err.status === 404
        ? of(undefined)
        : throwError(() => err))
    );
  }

  /** P4 (AddEdit 'A') / P5 (AddEdit 'E', needs ID + RowVersion). */
  projectAddEdit(data: SaveProjectRequest & { ID?: number; AddEdit: 'A' | 'E' }): Observable<ProjectActionResponse> {
    const { ID, AddEdit, ...body } = data;
    return AddEdit === 'E'
      ? this.http.put<ProjectActionResponse>(`${this.url}/${ID}`, body)
      : this.http.post<ProjectActionResponse>(this.url, body);
  }

  /** P10 — suggested next code (stays editable on the form). */
  getNextCode(): Observable<string> {
    return this.http.get<{ Code: string }>(`${this.url}/next-code`).pipe(map(r => r?.Code ?? ''));
  }

  /** P6 */
  archiveProject(ID: number): Observable<ProjectActionResponse> {
    return this.http.post<ProjectActionResponse>(`${this.url}/${ID}/archive`, {});
  }

  /** P7 */
  restoreProject(ID: number): Observable<ProjectActionResponse> {
    return this.http.post<ProjectActionResponse>(`${this.url}/${ID}/restore`, {});
  }

  /** P8 — the server allows it only for archived projects. */
  deleteProject(ID: number): Observable<ProjectActionResponse> {
    return this.http.delete<ProjectActionResponse>(`${this.url}/${ID}`);
  }

  // ---------------- Lookups (P9) ----------------

  getLookups(): Observable<ProjectLookups> {
    const token = this.authService.getToken();
    if (this.lookupsFor !== token) {
      this.lookups$ = null;
      this.lookupsFor = token;
    }
    if (!this.lookups$) {
      const req$: Observable<ProjectLookups> = this.http.get<ProjectLookups>(`${this.url}/lookups`).pipe(
        catchError((err: unknown) => {
          if (this.lookups$ === req$) this.lookups$ = null;
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.lookups$ = req$;
    }
    return this.lookups$;
  }

  getUserList(): Observable<ProjectUser[]> {
    return this.getLookups().pipe(map(l => l.Users ?? []));
  }

  getRoleList(): Observable<string[]> {
    return this.getLookups().pipe(map(l => l.MemberRoles ?? []));
  }

  getCategoryList(): Observable<ProjectCategory[]> {
    return this.getLookups().pipe(map(l => l.Categories ?? []));
  }

  getCurrencyList(): Observable<string[]> {
    return this.getLookups().pipe(map(l => l.Currencies ?? []));
  }

  // ---------------- Members ----------------

  /** M1 */
  getProjectMembers(ProjectID: number): Observable<ProjectMember[]> {
    return this.http.get<ProjectMember[]>(`${this.url}/${ProjectID}/members`);
  }

  /** M3 when ID is set (the server ignores UserID there), else M2. */
  memberAddEdit(data: { ID: number; ProjectID: number } & SaveMemberRequest): Observable<ProjectActionResponse> {
    const body: SaveMemberRequest = { UserID: data.UserID, Role: data.Role, Allocation: Number(data.Allocation) };
    return data.ID
      ? this.http.put<ProjectActionResponse>(`${this.url}/${data.ProjectID}/members/${data.ID}`, body)
      : this.http.post<ProjectActionResponse>(`${this.url}/${data.ProjectID}/members`, body);
  }

  /** M4 */
  removeMember(ProjectID: number, ID: number): Observable<ProjectActionResponse> {
    return this.http.delete<ProjectActionResponse>(`${this.url}/${ProjectID}/members/${ID}`);
  }

  // ---------------- Milestones ----------------

  /** MS1 (ordered by DueDate). */
  getMilestones(ProjectID: number): Observable<Milestone[]> {
    return this.http.get<Milestone[]>(`${this.url}/${ProjectID}/milestones`);
  }

  /** MS3 when ID is set, else MS2. */
  milestoneAddEdit(data: { ID: number; ProjectID: number } & SaveMilestoneRequest): Observable<ProjectActionResponse> {
    const body: SaveMilestoneRequest = {
      Title: data.Title, Description: data.Description, StartDate: data.StartDate, DueDate: data.DueDate,
      Status: data.Status, Progress: Number(data.Progress), OwnerUserID: data.OwnerUserID, RowVersion: data.RowVersion
    };
    return data.ID
      ? this.http.put<ProjectActionResponse>(`${this.url}/${data.ProjectID}/milestones/${data.ID}`, body)
      : this.http.post<ProjectActionResponse>(`${this.url}/${data.ProjectID}/milestones`, body);
  }

  /** MS4 */
  completeMilestone(ProjectID: number, ID: number): Observable<ProjectActionResponse> {
    return this.http.post<ProjectActionResponse>(`${this.url}/${ProjectID}/milestones/${ID}/complete`, {});
  }

  /** MS5 */
  deleteMilestone(ProjectID: number, ID: number): Observable<ProjectActionResponse> {
    return this.http.delete<ProjectActionResponse>(`${this.url}/${ProjectID}/milestones/${ID}`);
  }

  // ---------------- Timeline ----------------

  /** Tasks spec aane tak khaali. */
  getProjectTasks(_ProjectID: number): Observable<ProjectTask[]> {
    return of([]);
  }

  // ---------------- Settings / activity ----------------

  /** S1 */
  getProjectSettings(ProjectID: number): Observable<ProjectSettings> {
    return this.http.get<ProjectSettings>(`${this.url}/${ProjectID}/settings`);
  }

  /** S2 — General + Preferences in one call (one transaction on the server). */
  saveProjectSettings(ProjectID: number, data: SaveProjectSettingsRequest): Observable<ProjectActionResponse> {
    return this.http.put<ProjectActionResponse>(`${this.url}/${ProjectID}/settings`, data);
  }

  /** A1 — newest first. */
  getActivity(ProjectID: number, take: number = 20): Observable<ProjectActivity[]> {
    const params = new HttpParams().set('Take', String(take));
    return this.http.get<ProjectActivity[]>(`${this.url}/${ProjectID}/activity`, { params });
  }
}
