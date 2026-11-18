import { Component, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { OnInit, AfterViewChecked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDesktop,faGear,faDiagramProject,faListCheck,faUsers,faArrowsSpin,faSitemap,faChartPie,faLayerGroup,faSliders,faLock } from '@fortawesome/free-solid-svg-icons';
import { AccessModule, MyAccess } from '../Interface/access';
import { EntitlementService } from '../services/Access/entitlement.service';

export interface SidebarItem { path: string; label: string; icon: IconDefinition; module: AccessModule; }
/** How a module link shows: normal, with 🔒 (upsell to admins), or not at all. */
export type SidebarLinkState = 'show' | 'locked' | 'hidden';

/** Plan-gated module links, in sidebar order (spec 005 §8.4). Dashboard is always shown, Settings separately. */
export const SIDEBAR_MODULES: SidebarItem[] = [
  { path: '/projects', label: 'Projects', icon: faDiagramProject, module: 'Projects' },
  { path: '/tasks', label: 'Tasks', icon: faListCheck, module: 'Tasks' },
  { path: '/team', label: 'Team', icon: faUsers, module: 'Team' },
  { path: '/agile', label: 'Sprints & Agile', icon: faArrowsSpin, module: 'Agile' },
  { path: '/workflows', label: 'Workflows', icon: faSitemap, module: 'Workflows' },
  { path: '/reports', label: 'Reports', icon: faChartPie, module: 'Reports' },
  { path: '/workspace', label: 'Workspace', icon: faLayerGroup, module: 'Workspace' },
];

/**
 * Sidebar rule (spec 005 §8.4): can View → show; not in plan and the user may see Billing → 🔒 link to the
 * upgrade page (upsell for admins only); otherwise hide.
 * No answer (still loading / A1 failed) → show, so a broken A1 call never hides the menu; the route guard
 * then shows the "try again" page and the API is the real gate.
 */
export function sidebarLinkState(access: MyAccess | null, module: AccessModule): SidebarLinkState {
  if (!access) return 'show';
  const m = access.Modules[module];
  if (m?.View) return 'show';
  if (m && !m.InPlan && access.Modules.Billing?.View) return 'locked';
  return 'hidden';
}

@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SidebarComponent implements OnInit, AfterViewChecked {
  desktop = faDesktop;
  setting = faGear;
  faLock = faLock;
  /** project-management modules (each stays active on its sub pages) */
  pmMenu = SIDEBAR_MODULES;
  settingsItem = { path: '/settings', label: 'Admin Settings', icon: faSliders };
  /** Visible module links with their state; recomputed whenever A1 changes. */
  menu: { item: SidebarItem; state: SidebarLinkState }[] = SIDEBAR_MODULES.map(item => ({ item, state: 'show' }));
  showSettings = true;
  activeMenu: string = '';

  constructor(private entitlement: EntitlementService, private destroyRef: DestroyRef) {

  }
  ngOnInit() {
    const btnToggler = window.document.querySelectorAll(".navbar-toggler");
    const navbar: any = window.document.querySelector(".navbar");
    btnToggler.forEach((x) => {
      x.addEventListener('click', () => {
        navbar.classList.toggle('active');
      });
    })

    this.entitlement.access$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(access => this.applyAccess(access));
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  ngAfterViewChecked() {

  }

  /** /accessdenied upgrade page for a module that is not in the plan. */
  lockedQuery(m: SidebarItem) {
    return { reason: 'plan', module: m.module };
  }

  private applyAccess(access: MyAccess | null) {
    this.menu = SIDEBAR_MODULES
      .map(item => ({ item, state: sidebarLinkState(access, item.module) }))
      .filter(x => x.state !== 'hidden');
    // Settings is always-on; hidden only when we know the role has no Settings.View.
    this.showSettings = !access || !!access.Modules.Settings?.View;
  }

  get locationHref() {
    return window.location.pathname
  }

  toggleDropdown(event: any, menuName: string) {
    // Find the closest parent 'li' element of the clicked link
    const menuItem = event.target.closest('.menu-item');
    if (!menuItem) {
      console.warn('Clicked element is not inside a menu-item');
      return;
    }

    // Remove the 'active' class from all menu items
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => item.classList.remove('active'));

    // Remove the 'active' class from all sub menu items
    const submenuItems = document.querySelectorAll('.submenu');
    submenuItems.forEach(item => item.classList.remove('active'));


    // Add 'active' class to the clicked menu item
    menuItem.classList.add('active');


    // Find the submenu (next sibling of the <li>)
    const submenu = menuItem.nextElementSibling;
    if (submenu && submenu.classList.contains('submenu')) {
      // Toggle visibility of the submenu
      submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
    } else {
      const allSubmenus = document.querySelectorAll('.submenu');

    // Pehle sabko hide kar do
    allSubmenus.forEach(submenu => {
      (submenu as HTMLElement).style.display = 'none';
    });
      console.warn('No submenu found next to the clicked menu item.');
    }
    this.activeMenu = this.activeMenu === menuName ? '' : menuName;
  }

  close(){
    const allSubmenus = document.querySelectorAll('.submenu');

    // Pehle sabko hide kar do
    allSubmenus.forEach(submenu => {
      (submenu as HTMLElement).style.display = 'none';
    });
  }

  isActive(path: any): string {
    const current = window.location.pathname;
    // module links stay active on their sub pages (create, details, board ...)
    if (path === '/dashboard' || path === this.settingsItem.path || this.pmMenu.some(m => m.path === path)) return current === path || current.startsWith(path + '/') ? 'active' : '';
    return current == path ? 'active' : '';
  }

}
