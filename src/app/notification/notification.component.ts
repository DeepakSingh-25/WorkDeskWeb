import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NotificationsService } from '../services/notifications.service';
@Component({
    selector: 'app-notification',
    templateUrl: './notification.component.html',
    styleUrl: './notification.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class NotificationComponent {
  notifications: any[] = [];
  isPermission = false;
  constructor(private notificationsService: NotificationsService) {}

  ngOnInit(): void {
    this.notificationsService.notifications$.subscribe((notification:any) => {
      this.notifications.push(notification);
      if (notification.type !== 'confirm' && notification.type !== 'delete') {
        setTimeout(() => {
          this.notifications.shift();
        }, 5000);
      }
    });
  }

  onConfirm(response: boolean) {
    this.notificationsService.confirm(response);
    this.notifications.shift(); // Remove the confirmation message
  }

  deletePermission(response: boolean) {
    this.isPermission = false;
    this.notificationsService.deleteAnswer(response);
    this.notifications.shift(); // Remove the confirmation message
  }


  closeNotification(index:number){
    this.notifications.splice(index, 1);
  }

  checkPermission(event:any){
    this.isPermission = event.target.checked;
  }
  
}
