/** Human-readable REBUILT rule catalog used by the rules page and referee tools. */
export type RuleCategory = 'scoring' | 'field' | 'robot' | 'human' | 'conduct' | 'cards';
export type Detection = 'automatic' | 'review' | 'referee-only';

export interface RuleDefinition {
  id: string;
  title: string;
  category: RuleCategory;
  summary: string;
  penalty: string;
  card?: 'yellow' | 'red' | 'conditional';
  detection: Detection;
  simulator: string;
  severity: 'warning' | 'minor' | 'major';
}

export const RULE_CATALOG: RuleDefinition[] = [
  {
    id: 'G101',
    title: 'Humans remain outside the field',
    category: 'human',
    summary:
      'A team member may not reach into the FIELD with any part of their body during a MATCH. The prohibition applies to the whole team.',
    penalty: 'Verbal warning first, then YELLOW CARD for subsequent violations in the event.',
    card: 'yellow',
    detection: 'automatic',
    simulator:
      'The human-player console tracks reach past the alliance wall. Reaching into the field raises a warning, then a card.',
    severity: 'warning',
  },
  {
    id: 'G403',
    title: 'No AUTO contact across the center line',
    category: 'conduct',
    summary:
      'A ROBOT whose BUMPERS are completely across the CENTER LINE may not contact an opponent ROBOT during AUTO.',
    penalty: 'MAJOR FOUL',
    detection: 'automatic',
    simulator:
      'AUTO contacts are checked against each robot’s center-line projection and attributed to the crossing robot.',
    severity: 'major',
  },
  {
    id: 'G404',
    title: 'Do not use FUEL to alter a field challenge',
    category: 'scoring',
    summary:
      'A ROBOT may not deliberately launch or use a SCORING ELEMENT to alter or amplify a FIELD challenge (for example, disrupting a climb).',
    penalty: 'MAJOR FOUL',
    detection: 'referee-only',
    simulator: 'Available from the referee call panel; high-speed projectile impacts are also flagged for review.',
    severity: 'major',
  },
  {
    id: 'G405',
    title: 'Do not eject SCORING ELEMENTS from the field',
    category: 'scoring',
    summary: 'A ROBOT may not intentionally eject FUEL from the FIELD. Repeated ejections escalate.',
    penalty: 'MINOR FOUL; MAJOR FOUL if repeated.',
    detection: 'automatic',
    simulator: 'Projectiles leaving the field boundary are attributed to the last robot that launched them.',
    severity: 'minor',
  },
  {
    id: 'G408',
    title: 'Do not control FUEL released by a HUB',
    category: 'scoring',
    summary:
      'A ROBOT may not gain greater-than-momentary control of FUEL released by a HUB, or redirect it, until that FUEL contacts something else.',
    penalty: 'MINOR FOUL; MAJOR FOUL + YELLOW CARD if strategic.',
    card: 'yellow',
    detection: 'automatic',
    simulator: 'FUEL ejected from an inactive HUB is marked and checked for immediate robot pickup.',
    severity: 'minor',
  },
  {
    id: 'G413',
    title: 'Expansion limits',
    category: 'robot',
    summary:
      'A ROBOT may not extend more than 12 in (0.305 m) beyond its ROBOT PERIMETER, may extend in only one direction, and may never exceed 30 in (0.762 m) tall.',
    penalty: 'MINOR FOUL; MAJOR FOUL if expansion is strategic (impeding or enabling scoring).',
    detection: 'automatic',
    simulator:
      'The expander is a simulated mechanism. Over-expansion while near a HUB or while contacting an opponent is upgraded to major.',
    severity: 'minor',
  },
  {
    id: 'G415',
    title: 'Stay out of other ROBOTS',
    category: 'conduct',
    summary:
      'A ROBOT may not use a component outside its ROBOT PERIMETER (except BUMPERS) to initiate contact with an opponent’s perimeter or bumper mounting, except at bumper openings.',
    penalty: 'MINOR FOUL',
    detection: 'review',
    simulator: 'Extended-mechanism contacts are proposed for referee review, never auto-penalized.',
    severity: 'minor',
  },
  {
    id: 'G416',
    title: 'Do not damage or impair an opponent',
    category: 'conduct',
    summary:
      'A ROBOT may not intentionally or recklessly damage or functionally impair an opponent ROBOT.',
    penalty: 'MAJOR FOUL + YELLOW CARD; MAJOR FOUL + RED CARD if the opponent is unable to drive.',
    card: 'conditional',
    detection: 'review',
    simulator: 'High-energy impacts are queued for review. Referees can issue yellow or red cards from the event.',
    severity: 'major',
  },
  {
    id: 'G417',
    title: 'No tipping or entanglement',
    category: 'conduct',
    summary:
      'A ROBOT may not deliberately attach to, tip, or entangle an opponent. An unintended tip in normal bumper-to-bumper interaction is not a violation.',
    penalty: 'MAJOR FOUL + YELLOW CARD; MAJOR FOUL + RED CARD if continuous or the opponent cannot drive.',
    card: 'conditional',
    detection: 'review',
    simulator: 'Tipping and entanglement physics produce a pending review event for the head referee.',
    severity: 'major',
  },
  {
    id: 'G418',
    title: 'Pinning',
    category: 'conduct',
    summary:
      'A ROBOT may not PIN an opponent for more than 3 seconds. A pin is preventing an opponent’s movement through direct or transitive contact.',
    penalty: 'MINOR FOUL at 3 s, then a MAJOR FOUL for every additional 3 s. A 15+ s pin may also draw a card.',
    detection: 'automatic',
    simulator:
      'Sustained contact with a suppressed opponent starts a pin count. Separation or 72 in of movement for more than 3 s ends it; getting pinned also ends it.',
    severity: 'minor',
  },
  {
    id: 'G419',
    title: 'No isolating major field play',
    category: 'conduct',
    summary:
      'Two or more ROBOTS may not work together to isolate or close off a major element of MATCH play. One robot blocking an area is normal gameplay.',
    penalty: 'MAJOR FOUL, plus another MAJOR FOUL for every 3 seconds uncorrected.',
    detection: 'referee-only',
    simulator: 'Available as a referee call, with notes and a reviewable event.',
    severity: 'major',
  },
  {
    id: 'G420',
    title: 'TOWER protection in the final 30 seconds',
    category: 'field',
    summary:
      'In the final 30 seconds, a ROBOT may not contact an opponent robot that is in contact with its TOWER, directly or through FUEL.',
    penalty: 'MAJOR FOUL; if the protected robot is off the ground, award it LEVEL 3 TOWER points.',
    detection: 'automatic',
    simulator: 'Tower-zone contacts in END GAME are automatically called and award Level 3 points to the climber.',
    severity: 'major',
  },
  {
    id: 'G421',
    title: 'Human players stay in their alliance area',
    category: 'human',
    summary: 'A HUMAN PLAYER may not contact anything outside their ALLIANCE AREA, subject to the listed exceptions.',
    penalty: 'MINOR FOUL',
    detection: 'referee-only',
    simulator: 'Referee call with one-click minor foul.',
    severity: 'minor',
  },
  {
    id: 'G423',
    title: 'CHUTE and CORRAL reach limits',
    category: 'human',
    summary:
      'A DRIVE TEAM member may not reach into a CHUTE past the alliance-colored tape line while the CHUTE DOOR is open, or into the CORRAL past its tape line.',
    penalty: 'MINOR FOUL',
    detection: 'referee-only',
    simulator: 'Included in human-player reach warnings and available as a referee call.',
    severity: 'minor',
  },
  {
    id: 'G424',
    title: 'No FUEL-assisted field challenges',
    category: 'human',
    summary: 'A DRIVE TEAM member may not deliberately use a SCORING ELEMENT to ease or amplify a field challenge.',
    penalty: 'MAJOR FOUL',
    detection: 'referee-only',
    simulator: 'Referee call, or review of flagged projectile contacts with climbing robots.',
    severity: 'major',
  },
  {
    id: 'G425',
    title: 'Legal FUEL delivery only',
    category: 'human',
    summary:
      'FUEL may be introduced through the CHUTE, the bottom OUTPOST opening, or thrown over the ALLIANCE WALL. Other delivery methods are prohibited.',
    penalty: 'MAJOR FOUL',
    detection: 'automatic',
    simulator: 'The human-player console only offers legal delivery points; any forced override is flagged.',
    severity: 'major',
  },
  {
    id: 'G427',
    title: 'Off-field FUEL storage limits',
    category: 'human',
    summary:
      'Off-field FUEL may be stored only in the CHUTE and CORRAL. Once both are full, excess FUEL must immediately enter the FIELD.',
    penalty: 'MINOR FOUL; MAJOR FOUL if continuous.',
    detection: 'automatic',
    simulator: 'The chute storage counter raises a minor foul when over capacity and escalates if left full.',
    severity: 'minor',
  },
  {
    id: 'R105',
    title: 'Horizontal expansion',
    category: 'robot',
    summary: 'A ROBOT may not extend more than 12 in beyond the vertical projection of its ROBOT PERIMETER.',
    penalty: 'Enforced as G413 once the robot is on the field.',
    detection: 'automatic',
    simulator: 'Validation prevents illegal starting configurations; G413 covers in-match expansion.',
    severity: 'minor',
  },
  {
    id: 'R107',
    title: 'Height limit',
    category: 'robot',
    summary: 'Total ROBOT height may not exceed 30 in (0.762 m).',
    penalty: 'Not legal at inspection; G413 in play.',
    detection: 'automatic',
    simulator: 'The bot builder blocks configurations above 30 in.',
    severity: 'minor',
  },
  {
    id: 'G211',
    title: 'Head referee discretion',
    category: 'cards',
    summary:
      'The Head REFEREE may issue a YELLOW CARD for egregious behavior or repeated violations. A second yellow in the same tournament phase becomes a RED CARD.',
    penalty: 'YELLOW CARD; second card = RED CARD and disqualification.',
    card: 'conditional',
    detection: 'referee-only',
    simulator: 'The referee dashboard issues cards. A second yellow automatically becomes a red card.',
    severity: 'major',
  },
];

export const RULES_BY_ID = Object.fromEntries(RULE_CATALOG.map((r) => [r.id, r]));

export function getRule(id: string): RuleDefinition | undefined {
  return RULES_BY_ID[id];
}
