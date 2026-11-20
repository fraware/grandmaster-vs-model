/**
 * Downloadable, offline calendar reminder for the pinned 2026 championship.
 * Nothing is transmitted. Scheduled start times do not certify actual play.
 */
import {roundInfo} from './match-2026.mjs';

const SITE='https://fraware.github.io/grandmaster-vs-model/';
const asciiLine=line=>{
  if(!/^[\x20-\x7E]*$/.test(line))
    throw new Error('Calendar field must contain printable ASCII');
  const lines=[];
  while(line.length>73){
    lines.push(line.slice(0,73));
    line=' '+line.slice(73);
  }
  lines.push(line);
  return lines.join('\r\n');
};
const timestamp=date=>{
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))
    throw new Error('Calendar timestamp is invalid');
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
};

/**
 * A 30-minute *start reminder*, not a representation of game duration.
 * @param {number} game - Pinned official round number, 1 through 14.
 * @param {Date} generatedAt - Local generation time; no clock attestation.
 * @returns {string} CRLF-terminated, RFC 5545-style text/calendar document.
 */
export function championshipCalendarIcs(game,generatedAt=new Date()){
  const round=roundInfo(game);
  const start=new Date(round.startsAt);
  const end=new Date(start.getTime()+30*60_000);
  const url=`${SITE}lab.html?mode=live&game=${game}#experiment`;
  const description='Scheduled broadcast start only; actual play and timing may differ. '+
    'Your local prediction is saved in this browser profile. Open the site to compare with the official broadcast. '+
    'The calendar event does not certify prediction or move timing.';
  const fields=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grandmaster vs Model//World Championship 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:gvm-2026-${round.roundId}@fraware.github.io`,
    `DTSTAMP:${timestamp(generatedAt)}`,
    `DTSTART:${timestamp(start)}`,
    `DTEND:${timestamp(end)}`,
    `SUMMARY:World Chess Championship 2026 - Game ${game} scheduled start`,
    `DESCRIPTION:${description}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:World Championship scheduled start reminder',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return fields.map(asciiLine).join('\r\n')+'\r\n';
}

/** Predictable ASCII filename without user-supplied data. */
export function championshipCalendarFilename(game){
  roundInfo(game);
  return `grandmaster-vs-model-game-${game}.ics`;
}
