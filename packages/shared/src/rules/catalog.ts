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
    id: 'G401',
    title: 'Behind the lines',
    category: 'human',
    summary:
      'During AUTO, DRIVE TEAM members stay behind the HUMAN STARTING LINE and may not contact anything in front of it, except for safety, an E-stop/A-stop, or with REFEREE/FTA permission.',
    penalty: 'MINOR FOUL, counted once however many items were contacted.',
    detection: 'referee-only',
    simulator: 'Referee call; the human-player console keeps reach behind the alliance wall.',
    severity: 'minor',
  },
  {
    id: 'G402',
    title: 'Let the ROBOT do its thing',
    category: 'human',
    summary:
      'During AUTO, DRIVE TEAM members may not directly or indirectly interact with the ROBOT or the OPERATOR CONSOLE, except for safety or an E-stop/A-stop. A HUMAN PLAYER entering FUEL is expressly allowed.',
    penalty: 'MINOR FOUL + YELLOW CARD.',
    card: 'yellow',
    detection: 'referee-only',
    simulator:
      'Referee call. Solo practice deliberately lets the driver keep hands on the controls through AUTO, which a real match would not allow.',
    severity: 'minor',
  },
  {
    id: 'G403',
    title: 'Stay on your side in AUTO',
    category: 'conduct',
    summary:
      'A ROBOT whose BUMPERS are completely across the CENTER LINE may not contact an opponent ROBOT during AUTO. Team Update 22 tightens this further, prohibiting a robot from completely crossing the CENTER LINE in AUTO at all.',
    penalty: 'MAJOR FOUL',
    detection: 'automatic',
    simulator:
      'AUTO contacts are checked against each robot’s center-line projection and attributed to the crossing robot. The AI never crosses the line in AUTO, which is what a legal AUTO routine looks like.',
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
    id: 'G406',
    title: 'Do not abuse SCORING ELEMENTS',
    category: 'scoring',
    summary:
      'ROBOTS and HUMAN PLAYERS may not damage a SCORING ELEMENT. Normal wear such as scratching is allowed; routinely gouging, tearing or marking FUEL is not.',
    penalty: 'VERBAL WARNING first, then MAJOR FOUL for a repeat in a later MATCH at the event. The ROBOT may also be DISABLED.',
    detection: 'referee-only',
    simulator: 'Referee call; FUEL wear is not modelled.',
    severity: 'major',
  },
  {
    id: 'G407',
    title: 'Only score while in your ALLIANCE ZONE',
    category: 'scoring',
    summary:
      'A ROBOT may not launch a SCORING ELEMENT into its HUB unless its BUMPERS are partially or fully within its ALLIANCE ZONE.',
    penalty: 'No score; the head referee may address repeat launches.',
    detection: 'automatic',
    simulator:
      'Every shot is tagged with the launching robot’s ALLIANCE ZONE state. FUEL that would score from outside the zone is ejected from the HUB and logged instead.',
    severity: 'warning',
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
    id: 'G409',
    title: 'ROBOTS must be safe',
    category: 'robot',
    summary:
      'A ROBOT may not create an undue hazard: a controlled object leaving the FIELD, a fully detached BUMPER segment, an exposed ROBOT-perimeter corner, an indeterminate number or colour, BUMPERS repeatedly or too long outside the BUMPER ZONE, or any dangerous design or operation.',
    penalty: 'The ROBOT is DISABLED; corrective action or re-inspection may follow.',
    detection: 'review',
    simulator:
      'Bumper damage and detachment are physics events in the review queue, and the referee panel can disable the robot, which zeroes its outputs for the rest of the match.',
    severity: 'warning',
  },
  {
    id: 'G410',
    title: 'Keep your BUMPERS low',
    category: 'robot',
    summary:
      'An extension may not interact with the carpet, the BUMPS or the TOWER BASE in a way that lifts the BUMPERS out of the BUMPER ZONE.',
    penalty: 'MINOR FOUL; corrective action or re-inspection may follow.',
    detection: 'referee-only',
    simulator: 'Referee call from the event log.',
    severity: 'minor',
  },
  {
    id: 'G411',
    title: 'Do not damage the FIELD',
    category: 'field',
    summary: 'A ROBOT may not damage FIELD elements.',
    penalty:
      'VERBAL WARNING first; the ROBOT may be DISABLED if more damage is likely, and later damage during the event is a YELLOW CARD.',
    card: 'conditional',
    detection: 'referee-only',
    simulator: 'Referee call; the impact log keeps the contact that caused it.',
    severity: 'warning',
  },
  {
    id: 'G412',
    title: 'Watch your FIELD interaction',
    category: 'field',
    summary:
      'Except for RUNGS and UPRIGHTS, a ROBOT may not grab, grasp, attach to, become entangled with or suspend from a FIELD element, including vacuum or hook attachments to the carpet.',
    penalty: 'MAJOR FOUL; YELLOW CARD if repeated or longer than MOMENTARY. The ROBOT may be DISABLED if damage is likely.',
    card: 'conditional',
    detection: 'review',
    simulator:
      'TOWER contact and climbing are modelled; grabbing and entanglement physics are queued for referee review.',
    severity: 'major',
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
    id: 'G414',
    title: 'Do not climb on each other',
    category: 'conduct',
    summary: 'ROBOTS may not fully support the weight of alliance ROBOTS to climb the TOWER.',
    penalty: 'No point foul: the supported ROBOTS are ineligible for TOWER points for the rest of the MATCH.',
    detection: 'referee-only',
    simulator: 'Referee call; robots in this sim do not stack, so a supported climb cannot occur.',
    severity: 'warning',
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
    id: 'G422',
    title: 'Hands off the controls',
    category: 'human',
    summary:
      'Only the team’s DRIVERS and/or HUMAN PLAYERS may operate the ROBOT; a DRIVE COACH may only activate the E-stop or A-stop.',
    penalty: 'MAJOR FOUL; RED CARD if the violation is greater than MOMENTARY.',
    card: 'conditional',
    detection: 'referee-only',
    simulator:
      'The room server accepts driver input only from the seat bound to that ROBOT, so another team’s controls never reach the sim.',
    severity: 'major',
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
    id: 'G426',
    title: 'DRIVE COACHES, SCORING ELEMENTS are off limits',
    category: 'human',
    summary: 'DRIVE COACHES may not touch SCORING ELEMENTS except for safety.',
    penalty: 'MINOR FOUL.',
    detection: 'referee-only',
    simulator: 'Referee call from the event log.',
    severity: 'minor',
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
