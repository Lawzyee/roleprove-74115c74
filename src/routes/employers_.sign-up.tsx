import { createFileRoute, redirect } from '@tanstack/react-router';

// Old address kept working: employer sign-up now lives on the shared create-account screen.
export const Route = createFileRoute('/employers_/sign-up')({
  beforeLoad: () => { throw redirect({ to: '/auth', search: { mode: 'signup', as: 'hiring' }, replace: true }); },
});
