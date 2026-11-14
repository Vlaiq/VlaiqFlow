/**
 * A calendar reminder built on the device (.ics, RFC 5545). Phones keep calendar alarms even when the
 * web app is closed, which a web page cannot promise. Nothing is sent anywhere: the file is downloaded.
 */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export interface Reminder {
  title: string;
  description: string;
  start: Date;
  /** Minutes the event lasts; the alarm fires at the start. */
  minutes?: number;
  /** Where the event is, as plain text (e.g. the parking name). */
  location?: string;
}

export function icsFile(r: Reminder, now = new Date()): string {
  const end = new Date(r.start.getTime() + (r.minutes ?? 10) * 60_000);
  const uid = `${stamp(r.start)}-${Math.random().toString(36).slice(2, 10)}@vlaiqflow.ro`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VLAIQ//VLAIQ FLOW//RO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(r.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(r.title)}`,
    `DESCRIPTION:${escape(r.description)}`,
    ...(r.location ? [`LOCATION:${escape(r.location)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(r.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function downloadReminder(r: Reminder, filename = 'vlaiq-flow-reminder.ics') {
  const url = URL.createObjectURL(new Blob([icsFile(r)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const clock = (d: Date) =>
  new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(d);
