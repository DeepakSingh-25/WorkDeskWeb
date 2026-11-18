import { Component, ChangeDetectionStrategy } from '@angular/core';
import { LoaderService } from '../services/Loader/loader.service';

@Component({
    selector: 'app-loader',
    templateUrl: './loader.component.html',
    styleUrl: './loader.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LoaderComponent {
  loading$;

  constructor(private readonly loaderService: LoaderService) { 
    this.loading$ = this.loaderService.loading$; // ✅ Proper Initialization
  }

}
