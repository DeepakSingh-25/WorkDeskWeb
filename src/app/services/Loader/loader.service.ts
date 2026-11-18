import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoaderService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  showLoader() {
    // console.log('🟢 Loader Started');
    this.loadingSubject.next(true);
  }

  hideLoader() {
    // console.log('🔴 Loader Stopped'); 
    this.loadingSubject.next(false);
  }
}
