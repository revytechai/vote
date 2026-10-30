import { provideRouter } from '@angular/router';
import { AuthService, MockAuthService } from './auth/auth.service';
import { MockVoteApi, VoteApi } from './api/vote-api';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useClass: MockAuthService }, { provide: VoteApi, useClass: MockVoteApi }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="brand-link"]')?.textContent).toContain('OpenZFS Hackathon');
  });
});
