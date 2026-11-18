import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BehaviorSubject, of } from 'rxjs';

import { SidebarComponent, sidebarLinkState } from './sidebar.component';
import { ACCESS_MODULES, EntitlementService } from '../services/Access/entitlement.service';
import { AccessModule, ModuleAccess, MyAccess } from '../Interface/access';

function makeAccess(change: (m: Record<AccessModule, ModuleAccess>) => void = () => {}): MyAccess {
  const modules = {} as Record<AccessModule, ModuleAccess>;
  ACCESS_MODULES.forEach(m => modules[m] = {
    InPlan: true, View: true, Create: true, Edit: true, Delete: true, Manage: true, AvailableIn: []
  });
  change(modules);
  return {
    UserID: 'u1', RoleID: 4, Modules: modules, Version: 'v1',
    License: {
      State: 'Active', PlanCode: 'Pro', PlanName: 'Pro', IsTrial: false, ExpiresAt: null, GraceEndsAt: null,
      DaysLeft: null, ReadOnly: false, SeatsExceeded: false, Banner: null
    }
  };
}

const off = (inPlan: boolean): ModuleAccess =>
  ({ InPlan: inPlan, View: false, Create: false, Edit: false, Delete: false, Manage: false, AvailableIn: inPlan ? [] : ['Enterprise'] });

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let access$: BehaviorSubject<MyAccess | null>;

  const labels = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.menu-link-text'))
    .map(e => e.textContent?.trim());
  const locked = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.menu-item.locked a'));

  beforeEach(async () => {
    access$ = new BehaviorSubject<MyAccess | null>(null);
    const entitlement = jasmine.createSpyObj<EntitlementService>('EntitlementService', ['ensureLoaded'], { access$: access$.asObservable() });
    entitlement.ensureLoaded.and.returnValue(of(null));

    await TestBed.configureTestingModule({
      declarations: [SidebarComponent],
      imports: [FontAwesomeModule, RouterModule.forRoot([])],
      providers: [{ provide: EntitlementService, useValue: entitlement }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create; unknown access shows every link (A1 failure never hides the menu)', () => {
    expect(component).toBeTruthy();
    expect(labels()).toEqual(['Dashboard', 'Projects', 'Tasks', 'Team', 'Sprints & Agile', 'Workflows', 'Reports', 'Workspace', 'Admin Settings']);
  });

  it('Member without Workflows View → no Workflows link, no Settings', () => {
    access$.next(makeAccess(m => {
      m.Workflows = off(true);
      m.Settings = off(true);
      m.Billing = off(true);
    }));
    fixture.detectChanges();
    expect(labels()).not.toContain('Workflows');
    expect(labels()).not.toContain('Admin Settings');
    expect(labels()).toContain('Dashboard');
    expect(locked().length).toBe(0);
  });

  it('admin with Workflows not in plan → 🔒 link to the upgrade page', () => {
    access$.next(makeAccess(m => m.Workflows = off(false)));
    fixture.detectChanges();
    const links = locked();
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/accessdenied?reason=plan&module=Workflows');
    expect(labels()).toContain('Admin Settings');
  });

  it('not in plan and no Billing.View → hidden', () => {
    expect(sidebarLinkState(makeAccess(m => { m.Agile = off(false); m.Billing = off(true); }), 'Agile')).toBe('hidden');
    expect(sidebarLinkState(makeAccess(), 'Agile')).toBe('show');
    expect(sidebarLinkState(null, 'Agile')).toBe('show');
  });
});
