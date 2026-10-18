export const SUPPORT_CATEGORIES = [
  { value: 'billing', label: 'Billing' },
  { value: 'scoring_dispute', label: 'Scoring dispute' },
  { value: 'technical', label: 'Technical problem' },
  { value: 'data_request', label: 'Data request' },
  { value: 'other', label: 'Other' },
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]['value'];
export type TicketStatus = 'open' | 'replied' | 'resolved';

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const BODY_MIN = 10;
export const BODY_MAX = 5000;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg'];
export const TICKETS_PER_HOUR = 5;

export const categoryLabel = (value: string) => SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
export const statusLabel: Record<TicketStatus, string> = { open: 'Open', replied: 'Replied', resolved: 'Resolved' };

export function checkAttachment(type: string, size: number): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(type)) return 'Screenshots must be PNG or JPG.';
  if (size > MAX_ATTACHMENT_BYTES) return 'Screenshots must be 5 MB or smaller.';
  return null;
}

/** Status after a message: staff replies mark "replied"; user messages (including on resolved tickets) reopen. */
export function statusAfterMessage(sender: 'user' | 'staff'): TicketStatus {
  return sender === 'staff' ? 'replied' : 'open';
}

export function hasUnreadReply(lastReadAt: string, messages: { sender: string; created_at: string }[]) {
  const read = new Date(lastReadAt).getTime();
  return messages.some((m) => m.sender === 'staff' && new Date(m.created_at).getTime() > read);
}

export function tagsFor(category: SupportCategory) {
  return category === 'data_request' ? ['data_request', 'legal_deadline'] : [];
}
