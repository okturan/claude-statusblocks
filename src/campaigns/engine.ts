import type { Campaign } from '../types.js';
import { campaigns } from './data.js';

const SECS_PER_DAY = 86400;
const SECS_PER_HOUR = 3600;

export interface CampaignStatus {
  campaign: Campaign;
  state: 'active-boosted' | 'active-normal' | 'upcoming' | 'ended' | 'weekend';
  countdown: string;
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

function getDowNum(dow: string): number {
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[dow] ?? 1;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const h = Math.floor(totalSeconds / SECS_PER_HOUR);
  const m = Math.floor((totalSeconds % SECS_PER_HOUR) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}

interface TimingContext {
  currentSecs: number;
  peakStartSecs: number;
  peakEndSecs: number;
  dow: string;
}

function resolveWeekendState(ctx: TimingContext, campaign: Campaign): CampaignStatus {
  const { currentSecs, peakStartSecs, peakEndSecs, dow } = ctx;
  const dowNum = getDowNum(dow);
  const daysUntilMon = 8 - dowNum;
  const secsUntilPeak = daysUntilMon * SECS_PER_DAY + peakStartSecs - currentSecs;

  const totalWeekendSecs = (2 * SECS_PER_DAY) + peakStartSecs + (SECS_PER_DAY - peakEndSecs);
  const daysSinceFri = dowNum - 5;
  // Can be negative on early Saturday before peak-end time; clamped below
  const secsSinceFriPeak = daysSinceFri * SECS_PER_DAY + (currentSecs - peakEndSecs);
  const progress = Math.max(0, Math.min(1, secsSinceFriPeak / totalWeekendSecs));

  return { campaign, state: 'weekend', countdown: formatCountdown(secsUntilPeak), progress };
}

function resolvePeakState(ctx: TimingContext, campaign: Campaign): CampaignStatus {
  const { currentSecs, peakStartSecs, peakEndSecs } = ctx;
  const secsUntilChange = peakEndSecs - currentSecs;
  const progress = (currentSecs - peakStartSecs) / (peakEndSecs - peakStartSecs);
  return { campaign, state: 'active-normal', countdown: formatCountdown(secsUntilChange), progress };
}

function resolveOffPeakState(ctx: TimingContext, campaign: Campaign): CampaignStatus {
  const { currentSecs, peakStartSecs, peakEndSecs, dow } = ctx;

  let secsUntilPeak: number;
  if (currentSecs < peakStartSecs) {
    secsUntilPeak = peakStartSecs - currentSecs;
  } else {
    const dowNum = getDowNum(dow);
    const daysUntil = dowNum === 5 ? 3 : 1;
    secsUntilPeak = daysUntil * SECS_PER_DAY + peakStartSecs - currentSecs;
  }

  const secsSinceLastPeak = currentSecs >= peakEndSecs
    ? currentSecs - peakEndSecs
    : SECS_PER_DAY - peakEndSecs + currentSecs;
  const totalOffPeak = secsSinceLastPeak + secsUntilPeak;
  const progress = totalOffPeak > 0 ? secsSinceLastPeak / totalOffPeak : 0;

  return { campaign, state: 'active-boosted', countdown: formatCountdown(secsUntilPeak), progress };
}

export function getActiveCampaign(): CampaignStatus | null {
  const now = new Date();

  for (const campaign of campaigns) {
    const start = new Date(campaign.start);
    const end = new Date(campaign.end);

    if (now < start) return { campaign, state: 'upcoming', countdown: '', progress: 0 };
    if (now > end) continue;

    const rules = campaign.rules;
    const tz = rules.peakHours?.tz ?? 'America/New_York';
    const time = getTimeInTz(tz);
    const ctx: TimingContext = {
      currentSecs: time.hour * SECS_PER_HOUR + time.minute * 60 + time.second,
      peakStartSecs: (rules.peakHours?.start ?? 8) * SECS_PER_HOUR,
      peakEndSecs: (rules.peakHours?.end ?? 14) * SECS_PER_HOUR,
      dow: time.dow,
    };

    if (rules.weekdaysOnly && isWeekend(time.dow)) return resolveWeekendState(ctx, campaign);
    if (!rules.peakHours) return { campaign, state: 'active-boosted', countdown: '', progress: 0 };

    const isPeak = ctx.currentSecs >= ctx.peakStartSecs && ctx.currentSecs < ctx.peakEndSecs;
    return isPeak ? resolvePeakState(ctx, campaign) : resolveOffPeakState(ctx, campaign);
  }

  return null;
}
