import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';

export const agentSegment: Segment = {
  id: 'agent',
  priority: 35,
  enabled: (data) => !!data.agent,
  render(data) {
    const agent = data.agent!;
    const line1 = color(agent.name, c.magenta, c.bold);
    const line2 = agent.type ? color(agent.type, c.dim) : '';
    const lines = line2 ? [line1, line2] : [line1];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'agent', priority: 35, width, lines };
  },
};
