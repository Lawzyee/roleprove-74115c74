// Edit support contact details and Help page FAQ here.
export const SUPPORT_EMAIL = 'support@roleprove.com';

export const FAQ: { section: string; items: { q: string; a: string }[] }[] = [
  { section: 'Billing and trial', items: [
    { q: 'How much does Practice/Prep cost?', a: 'Practice/Prep is $15 USD per month and unlocks unlimited simulations, interview prep and verified attempts.' },
    { q: 'What happens if I cancel?', a: 'You keep access until the end of the period you already paid for, then return to the free plan.' },
    { q: 'Is there a free trial?', a: 'When paid plans begin, each account gets one 21-day trial with no card required.' },
  ] },
  { section: 'How scoring works', items: [
    { q: 'How is my score calculated?', a: 'Each answer is marked against clear criteria. Must-have skills count more than nice-to-have skills, and your best attempt for a role is used.' },
    { q: 'I think my score is wrong.', a: 'Open the results page and choose "Dispute this score". A person will review it. Disputes never change a score automatically.' },
  ] },
  { section: 'Privacy and video recordings', items: [
    { q: 'Who can see my recordings?', a: 'Only you. Recordings are private and are only made when you choose a verified attempt.' },
    { q: 'What is recorded?', a: 'Your screen, camera and microphone during a verified attempt, and nothing outside it.' },
  ] },
  { section: 'Deleting or exporting my data', items: [
    { q: 'How do I export my data?', a: 'Go to Settings and choose "Export my data" for an instant download.' },
    { q: 'How do I delete my data?', a: 'Go to Settings and choose "Delete my data". This is the fastest way and also removes recordings and support tickets.' },
  ] },
  { section: 'Technical problems', items: [
    { q: 'Screen sharing or the camera does not work.', a: 'Use a recent desktop version of Chrome, Edge or Firefox, allow camera and screen permissions, and share your entire screen.' },
    { q: 'A simulation failed to load.', a: 'Wait a moment and try again. If it keeps happening, contact support with a screenshot.' },
  ] },
];
