import type { Campaign } from '../types.js';
import { campaigns } from './data.js';

export interface CampaignStatus {
  campaign: Campaign;
  state: 'active-boosted' | 'active-normal' | 'upcoming' | 'ended' | 'weekend';
  /** Countdown string to next state change */
  countdown: string;
  /** 0-1 progress through current period */
  progress: number;
}

function getTimeInTz(tz: string): { hour: number; minute: number; second: number; dow: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false, weekday: 'short', timeZone: tz,
  }).formatToParts(now);

  let hour = 0, minute = 0, second = 0, dow = '';
  for (const p of parts) {
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
    if (p.type === 'second') second = parseInt(p.value, 10);
    if (p.type === 'weekday') dow = p.value;
  }
  if (hour === 24) hour = 0;
  return { hour, minute, second, dow };
}

function isWeekend(dow: string): boolean {
  return dow === 'Sat' || dow === 'Sun';
}

/** ET day-of-week: Mon=1..Sun=7 */
function getDowNum(dow: string): number {
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[dow] ?? 1;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}

export function getActiveCampaign(): CampaignStatus | null {
  const now = new Date();

  for (const campaign of campaigns) {
    const start = new Date(campaign.start);
    const end = new Date(campaign.end);

    if (now < start) {
      return { campaign, state: 'upcoming', countdown: '', progress: 0 };
    }

    if (now > end) continue;

    const rules = campaign.rules;
    const tz = rules.peakHours?.tz ?? 'America/New_York';
    const { hour, minute, second, dow } = getTimeInTz(tz);
    const currentSecs = hour * 3600 + minute * 60 + second;
    const peakStartSecs = (rules.peakHours?.start ?? 8) * 3600;
    const peakEndSecs = (rules.peakHours?.end ?? 14) * 3600;
    const peakDuration = peakEndSecs - peakStartSecs;

    if (rules.weekdaysOnly && isWeekend(dow)) {
      // Weekend: countdown to Monday 8AM ET
      const dowNum = getDowNum(dow);
      const daysUntilMon = 8 - dowNum; // Sat→2, Sun→1
      const secsUntilPeak = daysUntilMon * 86400 + peakStartSecs - currentSecs;
      // Progress: how far through the weekend off-peak period
      // Off-peak started Friday 2PM, ends Monday 8AM = 66 hours
      const totalWeekendSecs = 66 * 3600;
      const daysSinceFri = dowNum - 5; // Sat→1, Sun→2
      const secsSinceFriPeak = daysSinceFri * 86400 + (currentSecs - peakEndSecs);
      const progress = Math.max(0, Math.min(1, secsSinceFriPeak / totalWeekendSecs));

      return {
        campaign,
        state: 'weekend',
        countdown: formatCountdown(secsUntilPeak),
        progress,
      };
    }

    if (rules.peakHours) {
      const isPeak = currentSecs >= peakStartSecs && currentSecs < peakEndSecs;

      if (isPeak) {
        const secsUntilChange = peakEndSecs - currentSecs;
        const progress = (currentSecs - peakStartSecs) / peakDuration;
        return {
          campaign,
          state: 'active-normal',
          countdown: formatCountdown(secsUntilChange),
          progress,
        };
      }

      // Off-peak weekday
      let secsUntilPeak: number;
      if (currentSecs < peakStartSecs) {
        secsUntilPeak = peakStartSecs - currentSecs;
      } else {
        // After peak today, next peak is tomorrow (or Monday if Friday)
        const dowNum = getDowNum(dow);
        const daysUntil = dowNum === 5 ? 3 : 1;
        secsUntilPeak = daysUntil * 86400 + peakStartSecs - currentSecs;
      }

      // Progress through off-peak: from last peak end to next peak start
      let secsSinceLastPeak: number;
      if (currentSecs >= peakEndSecs) {
        secsSinceLastPeak = currentSecs - peakEndSecs;
      } else {
        secsSinceLastPeak = 86400 - peakEndSecs + currentSecs;
      }
      const totalOffPeak = secsSinceLastPeak + secsUntilPeak;
      const progress = totalOffPeak > 0 ? secsSinceLastPeak / totalOffPeak : 0;

      return {
        campaign,
        state: 'active-boosted',
        countdown: formatCountdown(secsUntilPeak),
        progress,
      };
    }

    return { campaign, state: 'active-boosted', countdown: '', progress: 0 };
  }

  return null;
}
