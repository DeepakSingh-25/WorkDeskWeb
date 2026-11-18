import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { HomeService } from '../../services/Home/home.service';

/** Sub navigation shown on every dashboard screen (with inbox / notification badges). */
@Component({
    selector: 'app-home-nav',
    templateUrl: './home-nav.component.html',
    styleUrl: './home-nav.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeNavComponent implements OnInit, OnDestroy {
  inboxCount = 0;
  unreadCount = 0;
  private subs = new Subscription();

  links: { path: string; label: string; exact: boolean; badge?: 'inbox' | 'notif' }[] = [
    { path: '/dashboard', label: 'Overview', exact: true },
    { path: '/dashboard/tasks', label: 'My Tasks', exact: false },
    { path: '/dashboard/notifications', label: 'Notifications', exact: false, badge: 'notif' },
  ];

  constructor(private homeService: HomeService) { }

  ngOnInit() {
    this.subs.add(this.homeService.inboxCount$.subscribe(c => this.inboxCount = c));
    this.subs.add(this.homeService.unreadCount$.subscribe(c => this.unreadCount = c));
    this.homeService.refreshCounts();
  }

  badge(kind?: 'inbox' | 'notif'): number {
    return kind === 'inbox' ? this.inboxCount : kind === 'notif' ? this.unreadCount : 0;
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
