import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HomeNotification, NotificationType } from '../../Interface/home';
import { HomeService } from '../../services/Home/home.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { HomeUi } from '../home-ui';

@Component({
    selector: 'app-home-notifications',
    templateUrl: './home-notifications.component.html',
    styleUrl: './home-notifications.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeNotificationsComponent implements OnInit {
  ui = HomeUi;
  list: HomeNotification[] = [];
  types: NotificationType[] = ['assignment', 'mention', 'approval', 'due', 'overdue', 'milestone', 'sprint'];
  type: NotificationType | '' = '';
  unreadOnly = false;
  groups: { name: string; items: HomeNotification[] }[] = [];
  taskTitles: { [id: number]: string } = {};

  constructor(
    private homeService: HomeService,
    private router: Router,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService
  ) { }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loaderService.showLoader();
    this.homeService.getNotifications().subscribe({
      next: list => { this.list = list; this.regroup(); this.loaderService.hideLoader(); },
      error: () => { this.loaderService.hideLoader(); this.notificationsService.showNotification('error', 'Unable to load notifications'); }
    });
    // Sirf task titles ke liye — error toast upar wala getNotifications dikha deta hai.
    this.homeService.getContext().subscribe({
      next: ctx => ctx.Tasks.forEach(t => this.taskTitles[t.ID] = t.Title),
      error: () => { }
    });
  }

  regroup() {
    const rows = this.list.filter(n => (!this.type || n.Type === this.type) && (!this.unreadOnly || !n.Read));
    this.groups = ['Today', 'Yesterday', 'Earlier']
      .map(name => ({ name, items: rows.filter(n => HomeUi.dayBucket(n.CreatedOn) === name) }))
      .filter(g => g.items.length);
  }

  setType(t: NotificationType | '') {
    this.type = t;
    this.regroup();
  }

  setUnread(on: boolean) {
    this.unreadOnly = on;
    this.regroup();
  }

  total(unread: boolean): number {
    return this.list.filter(n => (!this.type || n.Type === this.type) && (!unread || !n.Read)).length;
  }

  count(t: NotificationType | ''): number {
    return this.list.filter(n => (!t || n.Type === t) && (!this.unreadOnly || !n.Read)).length;
  }

  get unreadCount(): number {
    return this.list.filter(n => !n.Read).length;
  }

  open(n: HomeNotification) {
    this.homeService.markRead(n.ID).subscribe();
    this.router.navigate([n.Link], { queryParams: n.QueryParams || {} });
  }

  toggleRead(n: HomeNotification) {
    this.homeService.markRead(n.ID, !n.Read).subscribe(() => {
      n.Read = !n.Read;
      this.regroup();
    });
  }

  markAllRead() {
    this.homeService.markAllRead().subscribe(res => {
      this.list.forEach(n => n.Read = true);
      this.regroup();
      this.notificationsService.showNotification('success', res.Status);
    });
  }

  remove(n: HomeNotification) {
    this.notificationsService.showdelete('Delete this notification?').then(ok => {
      if (!ok) return;
      this.homeService.deleteNotification(n.ID).subscribe(res => {
        this.list = this.list.filter(x => x.ID !== n.ID);
        this.regroup();
        this.notificationsService.showNotification('success', res.Status);
      });
    });
  }
}
