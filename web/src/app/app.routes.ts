import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'e/hackathon-2026' },
  {
    path: 'e/:slug',
    title: 'Event',
    loadComponent: () => import('./pages/event-page').then((m) => m.EventPage),
  },
  {
    path: 'e/:slug/submissions',
    title: 'Submissions',
    loadComponent: () => import('./pages/submissions-page').then((m) => m.SubmissionsPage),
  },
  {
    path: 'e/:slug/vote',
    title: 'Vote',
    loadComponent: () => import('./pages/vote-page').then((m) => m.VotePage),
  },
  {
    path: 'e/:slug/results',
    title: 'Results',
    loadComponent: () => import('./pages/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'e/:slug/prizes',
    title: 'Prizes',
    loadComponent: () => import('./pages/prizes-page').then((m) => m.PrizesPage),
  },
  {
    path: 'e/:slug/register',
    title: 'Register',
    loadComponent: () => import('./pages/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'e/:slug/submit',
    title: 'Submit a project',
    loadComponent: () => import('./pages/submit-page').then((m) => m.SubmitPage),
  },
  {
    path: 's/:id',
    title: 'Submission',
    loadComponent: () => import('./pages/submission-detail-page').then((m) => m.SubmissionDetailPage),
  },
  { path: '**', redirectTo: '' },
];
