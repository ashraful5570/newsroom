import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function localTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Time unknown';
}
export function uuid() {
  return crypto.randomUUID();
}
