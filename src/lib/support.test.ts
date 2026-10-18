import { describe, expect, it } from 'vitest';
import { checkAttachment, hasUnreadReply, statusAfterMessage, tagsFor, TICKETS_PER_HOUR } from './support';

describe('support ticket rules', () => {
  it('accepts only PNG/JPG screenshots up to 5 MB', () => {
    expect(checkAttachment('image/png', 5 * 1024 * 1024)).toBeNull();
    expect(checkAttachment('image/jpeg', 1000)).toBeNull();
    expect(checkAttachment('image/png', 5 * 1024 * 1024 + 1)).not.toBeNull();
    expect(checkAttachment('application/pdf', 1000)).not.toBeNull();
  });
  it('reopens on user reply and marks replied on staff reply', () => {
    expect(statusAfterMessage('user')).toBe('open');
    expect(statusAfterMessage('staff')).toBe('replied');
  });
  it('tags data requests for legal deadlines only', () => {
    expect(tagsFor('data_request')).toContain('legal_deadline');
    expect(tagsFor('billing')).toEqual([]);
  });
  it('limits new tickets to 5 per hour', () => expect(TICKETS_PER_HOUR).toBe(5));
  it('flags staff replies newer than the last read time as unread', () => {
    expect(hasUnreadReply('2026-10-18T10:00:00Z', [{ sender: 'staff', created_at: '2026-10-18T11:00:00Z' }])).toBe(true);
    expect(hasUnreadReply('2026-10-18T12:00:00Z', [{ sender: 'staff', created_at: '2026-10-18T11:00:00Z' }])).toBe(false);
    expect(hasUnreadReply('2026-10-18T10:00:00Z', [{ sender: 'user', created_at: '2026-10-18T11:00:00Z' }])).toBe(false);
  });
});
