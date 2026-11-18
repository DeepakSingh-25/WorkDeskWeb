import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Notification {
  type: 'success' | 'error' | 'confirm' | 'delete';
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {

  private notificationsSubject = new Subject<Notification>();
  notifications$ = this.notificationsSubject.asObservable();

  private confirmSubject = new Subject<boolean>();
  private deleteSubject = new Subject<boolean>();

  showNotification(type: 'success' | 'error' | 'confirm' | 'delete', message: string) {
    this.notificationsSubject.next({ type, message });
  }

  showConfirm(message: string): Promise<boolean> {
    this.notificationsSubject.next({ type: 'confirm', message });
    return new Promise((resolve) => {
      this.confirmSubject.subscribe(resolve);
    });
  }

  confirm(response: boolean) {
    this.confirmSubject.next(response);
  }

  showdelete(message: string): Promise<boolean> {
    this.notificationsSubject.next({ type: 'delete', message });
    return new Promise((resolve) => {
      this.deleteSubject.subscribe(resolve);
    });
  }

  deleteAnswer(response: boolean) {
    this.deleteSubject.next(response);
  }
}
