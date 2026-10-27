import { resolveAuthoritativeUcc } from '../server/pipeline/criticalEntityResolver';

const segments = [
  { start_time: 0, end_time: 5, speaker: 'ADVISOR', text: 'Hello sir. The otp is 12345.' },
  { start_time: 6, end_time: 12, speaker: 'ADVISOR', text: 'Buying 10 Reliance at ₹2500.' }
];
const transcript = `
  Advisor: Hello sir. The otp is 12345.
  Advisor: Buying 10 Reliance at ₹2500.
  Client: Okay done.
`;

const res = resolveAuthoritativeUcc(segments as any, transcript, 'WIA12345');
console.log('uccRes:', res);
