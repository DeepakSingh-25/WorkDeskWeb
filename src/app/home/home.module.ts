import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgApexchartsModule } from 'ng-apexcharts';
import { HomeRoutingModule } from './home-routing.module';
import { HomeNavComponent } from './home-nav/home-nav.component';
import { HomeOverviewComponent } from './home-overview/home-overview.component';
import { HomeTasksComponent } from './home-tasks/home-tasks.component';
import { HomeNotificationsComponent } from './home-notifications/home-notifications.component';

@NgModule({
  declarations: [
    HomeNavComponent,
    HomeOverviewComponent,
    HomeTasksComponent,
    HomeNotificationsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    NgApexchartsModule,
    FontAwesomeModule,
    HomeRoutingModule
  ]
})
export class HomeModule { }
