import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';

// Only assistant text events are eligible; tool output and reasoning are not reports.
const [eventsPath, reportPath] = process.argv.slice(2);
let lastText;
const parts = []; let finalMessage; let finalSession; let ambiguous = false;
try {
  for (const line of readFileSync(eventsPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.part?.messageID) finalMessage = event.part.messageID;
    if (event.sessionID) {
      if (finalSession && finalSession !== event.sessionID) ambiguous = true;
      finalSession = event.sessionID;
    }
    if (event.type === 'text' && event.part?.type === 'text' && typeof event.part.text === 'string') {
      lastText = event.part.text;
      if (event.part.messageID && event.part.id) parts.push(event.part);
    }
  }
} catch {
  process.exit(1);
}
if (ambiguous) process.exit(1);
// V2's native client reconciles completed text parts. Reassemble only the final
// assistant message, never tool/reasoning text or a previous message's report.
if (finalMessage && finalSession) {
  const seen = new Map(); const text = [];
  for (const part of parts.filter(p => p.messageID === finalMessage)) {
    if (part.sessionID !== finalSession) process.exit(1);
    if (seen.has(part.id)) { if (seen.get(part.id) !== part.text) process.exit(1); continue; }
    seen.set(part.id, part.text); text.push(part.text);
  }
  lastText = text.join('');
}
const report = lastText?.replace(/\r\n/g, '\n').trim();
const headings = ['Status', 'Implemented', 'Changed Files', 'Verification', 'Plan Deviations', 'Blockers'];
if (!report?.startsWith('# Status\n')) process.exit(1);
const sections = report.split(/^# /m).slice(1);
if (sections.length !== headings.length) process.exit(1);
const bodies = sections.map((section, index) => {
  const newline = section.indexOf('\n');
  if (section.slice(0, newline) !== headings[index]) process.exit(1);
  const body = section.slice(newline + 1).trim();
  if (!body) process.exit(1);
  return body;
});
if (!['SUCCESS', 'PARTIAL', 'BLOCKED'].includes(bodies[0])) process.exit(1);
if (bodies.slice(1).some((body) => !body.startsWith('- '))) process.exit(1);
const temporary = `${reportPath}.recovered-${process.pid}`;
try {
  writeFileSync(temporary, `${report}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, reportPath);
} finally {
  rmSync(temporary, { force: true });
}
