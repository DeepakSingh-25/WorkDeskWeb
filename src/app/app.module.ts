import { NgModule,CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { CommonModule } from '@angular/common';
import { AppComponent } from './app.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { HeaderComponent } from './header/header.component';
import { HeaderResponsiveComponent } from './header-responsive/header-responsive.component';
import { AdminModule } from './admin/admin.module';
import { NotificationComponent } from './notification/notification.component';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { LoaderComponent } from './loader/loader.component';
import { LicenseBannerComponent } from './license-banner/license-banner.component';


@NgModule({
  declarations: [
    AppComponent,
    SidebarComponent,
    HeaderComponent,
    HeaderResponsiveComponent,
    NotificationComponent,
    LoaderComponent,
    LicenseBannerComponent
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    CommonModule,
    AdminModule,
    HttpClientModule,
    FontAwesomeModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent] 
})
export class AppModule { }