import { normalizePhone } from './format';
import type { DeliveryContact } from './types';

export const emptyContact: DeliveryContact = {
  recipientName: '',
  phone: '',
  addressLine: '',
  city: '',
};

/** Fields that the API's DeliveryContactSchema would reject. */
export function contactErrors(contact: DeliveryContact): Set<keyof DeliveryContact> {
  const bad = new Set<keyof DeliveryContact>();
  const length = (value: string, min: number, max: number) =>
    value.trim().length >= min && value.trim().length <= max;
  if (!length(contact.recipientName, 2, 120)) bad.add('recipientName');
  if (!/^\+?[0-9]{7,15}$/.test(normalizePhone(contact.phone))) bad.add('phone');
  if (!length(contact.addressLine, 5, 240)) bad.add('addressLine');
  if (!length(contact.city, 2, 120)) bad.add('city');
  // The courier note is optional: empty is fine, otherwise 2–200 characters on one line.
  const note = contact.note?.trim() ?? '';
  if (note !== '' && (!length(note, 2, 200) || /[\r\n]/.test(note))) bad.add('note');
  return bad;
}
