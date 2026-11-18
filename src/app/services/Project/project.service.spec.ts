import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ProjectService } from './project.service';
import { Project, ProjectLookups, ProjectUser, SaveProjectRequest } from '../../Interface/project';

describe('ProjectService', () => {
  let service: ProjectService;
  let httpMock: HttpTestingController;
  const base = `${environment.baseUrl}Projects`;

  const lookups: ProjectLookups = {
    Users: [{ ID: 'a1b2', Name: 'Asha', Email: 'asha@example.com' }],
    Categories: [{ ID: 1, Name: 'Web Application' }],
    MemberRoles: ['Developer'],
    Currencies: ['INR', 'USD'],
    DefaultCurrency: 'INR'
  };

  const save: SaveProjectRequest = {
    Code: 'TST-0001', Name: 'Portal', Description: '', ClientName: '', CategoryID: 1, StartDate: '2026-11-01',
    EndDate: '2026-12-31', Budget: 0, Spent: 0, Currency: 'INR', Priority: 'Medium', Status: 'Not Started',
    ManagerUserID: 'a1b2', MemberUserIDs: ['a1b2'], RowVersion: null
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  let savedToken: string | null;
  beforeEach(() => savedToken = localStorage.getItem('token'));

  afterEach(() => {
    httpMock.verify();
    if (savedToken === null) localStorage.removeItem('token');
    else localStorage.setItem('token', savedToken);
  });

  it('P9 lookups cache is dropped when the auth token changes', () => {
    localStorage.setItem('token', 'token-user-a');
    let first: string[] = [];
    service.getUserList().subscribe(u => first = u.map(x => x.ID));
    httpMock.expectOne(`${base}/lookups`).flush(lookups);
    expect(first).toEqual(['a1b2']);

    service.getUserList().subscribe();
    httpMock.expectNone(`${base}/lookups`);

    localStorage.setItem('token', 'token-user-b');
    let second: string[] = [];
    service.getUserList().subscribe(u => second = u.map(x => x.ID));
    httpMock.expectOne(`${base}/lookups`).flush({ ...lookups, Users: [{ ID: 'c3d4', Name: 'Ravi', Email: 'ravi@example.com' }] });
    expect(second).toEqual(['c3d4']);
  });

  it('P1 sends paging params and omits empty Search / Status / SortColumn', () => {
    service.getPaginatedProjectList(10, 25, '', 'desc', '  ', '', false).subscribe();
    const req = httpMock.expectOne(r => r.url === base);
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('StartIndex')).toBe('10');
    expect(p.get('Length')).toBe('25');
    expect(p.get('SortDir')).toBe('desc');
    expect(p.get('Archived')).toBe('false');
    expect(p.has('Search')).toBeFalse();
    expect(p.has('Status')).toBeFalse();
    expect(p.has('SortColumn')).toBeFalse();
    req.flush({ Result: [], FilterRecords: 0 });

    service.getPaginatedProjectList(0, 10, 'Name', 'asc', 'crm', 'On Hold', true).subscribe();
    const req2 = httpMock.expectOne(r => r.url === base);
    expect(req2.request.params.get('Search')).toBe('crm');
    expect(req2.request.params.get('Status')).toBe('On Hold');
    expect(req2.request.params.get('SortColumn')).toBe('Name');
    expect(req2.request.params.get('Archived')).toBe('true');
    req2.flush({ Result: [], FilterRecords: 0 });
  });

  it('P1 omits SortDir when it is empty', () => {
    service.getPaginatedProjectList(0, 10, 'Name', '', '', '', false).subscribe();
    const req = httpMock.expectOne(r => r.url === base);
    expect(req.request.params.has('SortDir')).toBeFalse();
    expect(req.request.params.get('SortColumn')).toBe('Name');
    req.flush({ Result: [], FilterRecords: 0 });
  });

  it('P3 404 ⇒ undefined; other errors are rethrown', () => {
    let result: Project | undefined | null = null;
    service.getProjectByID(7).subscribe(r => result = r);
    httpMock.expectOne(`${base}/7`).flush({ Success: false, Message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    expect(result).toBeUndefined();

    let status = 0;
    service.getProjectByID(7).subscribe({ error: e => status = e.status });
    httpMock.expectOne(`${base}/7`).flush({ Success: false, Message: 'No', Code: 'NO_PERMISSION' }, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
  });

  it('P3 rethrows a 500 to the error callback', () => {
    let status = 0;
    let emitted = false;
    service.getProjectByID(8).subscribe({ next: () => emitted = true, error: e => status = e.status });
    const req = httpMock.expectOne(`${base}/8`);
    expect(req.request.method).toBe('GET');
    req.flush({ Success: false, Message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    expect(status).toBe(500);
    expect(emitted).toBeFalse();
  });

  it('P4 (AddEdit A) posts, P5 (AddEdit E) puts to /{ID} — ID / AddEdit not in the body', () => {
    service.projectAddEdit({ ...save, ID: 0, AddEdit: 'A' }).subscribe();
    const post = httpMock.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(save);
    post.flush({ Success: true, Message: 'Project created.', ID: 5 });

    service.projectAddEdit({ ...save, RowVersion: 'AAAA', ID: 5, AddEdit: 'E' }).subscribe();
    const put = httpMock.expectOne(`${base}/5`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.RowVersion).toBe('AAAA');
    expect(put.request.body.ID).toBeUndefined();
    expect(put.request.body.AddEdit).toBeUndefined();
    put.flush({ Success: true, Message: 'Project updated.', ID: 5 });
  });

  it('P9 lookups are requested once and shared (shareReplay)', () => {
    let users: ProjectUser[] = [];
    let roles: string[] = [];
    let currencies: string[] = [];
    service.getUserList().subscribe(u => users = u);
    let categories: string[] = [];
    service.getRoleList().subscribe(r => roles = r);
    const req = httpMock.expectOne(`${base}/lookups`);
    expect(req.request.method).toBe('GET');
    req.flush(lookups);
    service.getCategoryList().subscribe(c => categories = c.map(x => x.Name));
    service.getCurrencyList().subscribe(c => currencies = c);
    httpMock.expectNone(`${base}/lookups`);
    expect(categories).toEqual(['Web Application']);
    expect(users.map(u => u.ID)).toEqual(['a1b2']);
    expect(roles).toEqual(['Developer']);
    expect(currencies).toEqual(['INR', 'USD']);
  });

  it('a lookup error resets the cache so the next call retries', () => {
    let failed = false;
    service.getCategoryList().subscribe({ error: () => failed = true });
    httpMock.expectOne(`${base}/lookups`).flush(null, { status: 0, statusText: 'Unknown Error' });
    expect(failed).toBeTrue();

    let names: string[] = [];
    service.getCategoryList().subscribe(c => names = c.map(x => x.Name));
    httpMock.expectOne(`${base}/lookups`).flush(lookups);
    expect(names).toEqual(['Web Application']);
  });

  it('M4 removeMember URL includes the ProjectID', () => {
    service.removeMember(3, 42).subscribe();
    const req = httpMock.expectOne(`${base}/3/members/42`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ Success: true, Message: 'Removed.' });
  });

  it('MS4 completeMilestone posts to …/milestones/{id}/complete', () => {
    service.completeMilestone(3, 9).subscribe();
    const req = httpMock.expectOne(`${base}/3/milestones/9/complete`);
    expect(req.request.method).toBe('POST');
    req.flush({ Success: true, Message: 'Completed.' });
  });

  it('S2 saves General + Preferences in a single PUT', () => {
    const body = {
      General: { Name: 'Portal', Status: 'In Progress' as const, Priority: 'High' as const, ManagerUserID: 'a1b2', RowVersion: 'AAAA' },
      Preferences: {
        Visibility: 'Team' as const, DefaultView: 'List' as const, WorkingDays: ['Mon', 'Tue'], TimeTracking: true, ClientAccess: false,
        NotifyOnTaskAssign: true, NotifyOnStatusChange: true, NotifyOnMilestoneDue: false, WeeklyReport: false
      }
    };
    service.saveProjectSettings(3, body).subscribe();
    const req = httpMock.expectOne(`${base}/3/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({ Success: true, Message: 'Settings saved.' });
  });

  it('Q13 getAllProjects → GET Projects/all?Archived=…', () => {
    let rows: Project[] = [];
    service.getAllProjects(true).subscribe(r => rows = r);
    const req = httpMock.expectOne(r => r.url === `${base}/all`);
    expect(req.request.params.get('Archived')).toBe('true');
    req.flush([]);
    expect(rows).toEqual([]);
  });

  it('Q13 getAllProjects(false) → GET Projects/all?Archived=false and returns the array', () => {
    let rows: Project[] = [];
    service.getAllProjects(false).subscribe(r => rows = r);
    const req = httpMock.expectOne(r => r.url === `${base}/all`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('Archived')).toBe('false');
    req.flush([{ ID: 1, Code: 'TST-0001', Name: 'Portal' }]);
    expect(rows.length).toBe(1);
    expect(rows[0].Code).toBe('TST-0001');
  });
});
