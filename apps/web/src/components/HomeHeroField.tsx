import { BotAvatar } from './BotAvatar';
import { PRESET_BOTS } from '@rebuilt/shared';

export function HomeHeroField() {
  const atlas = PRESET_BOTS[0];
  const valkyrie = PRESET_BOTS[1];
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hero-arena-glow" />
      <div className="arena-plate">
        <div className="arena-plate-top">
          <span className="plate-label">FIELD 16.46 m × 8.23 m</span>
          <span className="plate-label">REBUILT // 2026</span>
        </div>
        <svg viewBox="0 0 700 440" className="hero-field-svg" role="img">
          <defs>
            <linearGradient id="floor" x1=".15" y1="0" x2=".85" y2="1">
              <stop offset="0" stopColor="#343a42" />
              <stop offset=".55" stopColor="#282d34" />
              <stop offset="1" stopColor="#1c222a" />
            </linearGradient>
            <linearGradient id="apron" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#161c24" />
              <stop offset="1" stopColor="#0a0e14" />
            </linearGradient>
            <linearGradient id="redHub" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff4055" />
              <stop offset="1" stopColor="#9f0b22" />
            </linearGradient>
            <linearGradient id="blueHub" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4b93ff" />
              <stop offset="1" stopColor="#003e8c" />
            </linearGradient>
            <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d5dee8" />
              <stop offset="1" stopColor="#6d7a89" />
            </linearGradient>
            <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe16a" />
              <stop offset="1" stopColor="#e9a315" />
            </linearGradient>
            <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#000" floodOpacity=".55" />
            </filter>
            <radialGradient id="arenaLight" cx=".5" cy=".2" r=".9">
              <stop offset="0" stopColor="#90bfff" stopOpacity=".2" />
              <stop offset=".65" stopColor="#4f7cff" stopOpacity=".03" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <pattern id="fieldGrid" width="28" height="16" patternUnits="userSpaceOnUse" patternTransform="skewY(-11)">
              <path d="M0 0h28M0 0v16" fill="none" stroke="#ffffff" strokeOpacity=".035" strokeWidth="1" />
            </pattern>
          </defs>

          <rect width="700" height="440" fill="url(#arenaLight)" />
          <g filter="url(#softShadow)">
            <polygon points="42,202 554,74 666,272 154,400" fill="url(#apron)" stroke="#2b3542" strokeWidth="2" />
            <polygon points="70,202 540,88 638,264 168,378" fill="#10151c" stroke="#35404e" strokeWidth="1.5" />
            <polygon points="112,203 524,102 602,255 190,356" fill="url(#floor)" />
            <polygon points="112,203 524,102 602,255 190,356" fill="url(#fieldGrid)" />
            {/* Red and blue endzones */}
            <polygon points="112,203 205,179 269,321 190,356" fill="#ff3b4e" opacity=".16" />
            <polygon points="524,102 602,255 535,273 448,120" fill="#2f7dff" opacity=".16" />
            <polygon points="112,203 180,186 214,251 152,270" fill="#ff3b4e" opacity=".24" />
            <polygon points="512,124 586,221 529,237 456,146" fill="#2f7dff" opacity=".24" />
            {/* Field markings */}
            <polyline points="116,204 522,104 598,252" fill="none" stroke="#eef4fb" strokeOpacity=".45" strokeWidth="2" />
            <polyline points="192,352 599,252" fill="none" stroke="#eef4fb" strokeOpacity=".25" strokeWidth="1.5" />
            <line x1="357" y1="163" x2="394" y2="306" stroke="#fff" strokeOpacity=".65" strokeWidth="2.5" />
            <line x1="192" y1="282" x2="230" y2="193" stroke="#ff5263" strokeOpacity=".55" strokeWidth="2" />
            <line x1="496" y1="285" x2="534" y2="194" stroke="#5c9aff" strokeOpacity=".55" strokeWidth="2" />
            <ellipse cx="358" cy="249" rx="74" ry="28" fill="#ffd23f" opacity=".045" />
            {/* Fuel cluster */}
            {Array.from({ length: 31 }).map((_, i) => {
              const angle = (i * 2.39) % (Math.PI * 2);
              const radius = 10 + (i % 6) * 9;
              const x = 359 + Math.cos(angle) * radius * 1.5;
              const y = 247 + Math.sin(angle) * radius * 0.52;
              return (
                <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 4.4 : 3.4} fill="url(#gold)" stroke="#755209" strokeWidth=".8" opacity=".95" />
              );
            })}

            {/* Red HUB */}
            <g>
              <ellipse cx="287" cy="237" rx="54" ry="18" fill="#000" opacity=".34" />
              <polygon points="250,225 306,209 335,224 279,241" fill="#65101f" />
              <polygon points="250,225 279,241 279,280 250,263" fill="#a30e28" />
              <polygon points="279,241 335,224 335,261 279,280" fill="#d51836" />
              <polygon points="259,235 305,222 326,232 280,246" fill="#ff3f54" />
              <polygon points="263,211 307,199 331,212 286,226" fill="#e12a42" />
              <polygon points="286,226 331,212 331,221 286,235" fill="#8e0c21" />
              <polygon points="263,211 286,226 286,235 263,220" fill="#ba122c" />
              <ellipse cx="296" cy="211" rx="15" ry="5.5" fill="#12070b" />
              <path d="M278 198c5-16 32-18 39-4" fill="none" stroke="#ff8794" strokeWidth="3.5" strokeLinecap="round" />
              <text x="292" y="258" fill="#fff" fontSize="11" fontWeight="800" fontFamily="Barlow Condensed, sans-serif" textAnchor="middle">RED HUB</text>
            </g>

            {/* Blue HUB */}
            <g>
              <ellipse cx="444" cy="208" rx="54" ry="18" fill="#000" opacity=".34" />
              <polygon points="408,194 465,177 493,192 437,210" fill="#0b2850" />
              <polygon points="408,194 437,210 437,249 408,232" fill="#0a4d9f" />
              <polygon points="437,210 493,192 493,230 437,249" fill="#126bd6" />
              <polygon points="417,204 463,191 484,201 438,215" fill="#4b96ff" />
              <polygon points="421,180 465,168 489,181 444,195" fill="#3385f0" />
              <polygon points="444,195 489,181 489,190 444,204" fill="#073a78" />
              <polygon points="421,180 444,195 444,204 421,189" fill="#0b4d97" />
              <ellipse cx="454" cy="180" rx="15" ry="5.5" fill="#030b16" />
              <path d="M436 167c5-16 32-18 39-4" fill="none" stroke="#8cc0ff" strokeWidth="3.5" strokeLinecap="round" />
              <text x="449" y="227" fill="#fff" fontSize="11" fontWeight="800" fontFamily="Barlow Condensed, sans-serif" textAnchor="middle">BLUE HUB</text>
            </g>

            {/* TOWER left */}
            <g>
              <ellipse cx="160" cy="276" rx="27" ry="9" fill="#000" opacity=".35" />
              <polygon points="151,272 163,269 184,214 172,217" fill="#cbd5e0" />
              <polygon points="172,217 184,214 189,223 177,226" fill="#6f7c8b" />
              <polygon points="158,270 169,267 191,206 180,209" fill="#ef3e51" opacity=".8" />
              <path d="M149 269v-24M173 264v-24M142 257h34M139 245h34M137 233h34" stroke="#c4cfdb" strokeWidth="2.5" />
              <path d="M150 241h25M149 253h27" stroke="#e53a4e" strokeWidth="3" />
              <text x="162" y="288" fill="#ffd6db" fontSize="9.5" fontWeight="700" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif">RED TOWER</text>
            </g>

            {/* TOWER right */}
            <g>
              <ellipse cx="539" cy="174" rx="27" ry="9" fill="#000" opacity=".35" />
              <polygon points="530,170 542,167 563,112 551,115" fill="#cbd5e0" />
              <polygon points="551,115 563,112 568,121 556,124" fill="#6f7c8b" />
              <polygon points="534,166 545,163 566,105 555,108" fill="#2f7dff" opacity=".8" />
              <path d="M528 167v-24M552 162v-24M521 155h34M518 143h34M516 131h34" stroke="#c4cfdb" strokeWidth="2.5" />
              <path d="M529 139h25M528 151h27" stroke="#2f7dff" strokeWidth="3" />
              <text x="541" y="186" fill="#cfe4ff" fontSize="9.5" fontWeight="700" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif">BLUE TOWER</text>
            </g>

            {/* Robots */}
            <g transform="translate(233 277)">
              <ellipse cx="14" cy="15" rx="23" ry="7" fill="#000" opacity=".5" />
              <polygon points="0,7 12,3 30,8 18,13" fill="#d8e1ea" />
              <polygon points="0,7 18,13 18,24 0,18" fill="#981025" />
              <polygon points="18,13 30,8 30,19 18,24" fill="#c8102e" />
              <rect x="6" y="4" width="10" height="4" fill="#ffd23f" />
              <text x="16" y="22" fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif">8621</text>
            </g>
            <g transform="translate(280 298)">
              <ellipse cx="14" cy="15" rx="22" ry="7" fill="#000" opacity=".5" />
              <polygon points="0,7 12,3 30,8 18,13" fill="#d8e1ea" />
              <polygon points="0,7 18,13 18,24 0,18" fill="#8a1022" />
              <polygon points="18,13 30,8 30,19 18,24" fill="#d81c39" />
              <rect x="6" y="4" width="10" height="4" fill="#ffd23f" />
              <text x="16" y="22" fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif">3141</text>
            </g>
            <g transform="translate(431 226)">
              <ellipse cx="14" cy="15" rx="23" ry="7" fill="#000" opacity=".5" />
              <polygon points="0,7 12,3 30,8 18,13" fill="#d8e1ea" />
              <polygon points="0,7 18,13 18,24 0,18" fill="#073e7c" />
              <polygon points="18,13 30,8 30,19 18,24" fill="#0057b8" />
              <rect x="6" y="4" width="10" height="4" fill="#8cf3e2" />
              <text x="16" y="22" fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif">7407</text>
            </g>
            <g transform="translate(478 207)">
              <ellipse cx="14" cy="15" rx="22" ry="7" fill="#000" opacity=".5" />
              <polygon points="0,7 12,3 30,8 18,13" fill="#d8e1ea" />
              <polygon points="0,7 18,13 18,24 0,18" fill="#08346a" />
              <polygon points="18,13 30,8 30,19 18,24" fill="#126bd6" />
              <rect x="6" y="4" width="10" height="4" fill="#8cf3e2" />
              <text x="16" y="22" fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif">2712</text>
            </g>

            {/* OUTPOST chutes */}
            <g>
              <polygon points="98,252 130,244 138,260 106,268" fill="#2a323d" />
              <polygon points="106,268 138,260 138,283 106,291" fill="#751025" />
              <rect x="114" y="255" width="16" height="5" fill="#070b10" />
              <text x="118" y="300" fill="#ff9fab" fontSize="8" textAnchor="middle" fontWeight="700">OUTPOST</text>
            </g>
            <g>
              <polygon points="567,235 599,227 607,243 575,251" fill="#2a323d" />
              <polygon points="575,251 607,243 607,266 575,274" fill="#07346c" />
              <rect x="583" y="238" width="16" height="5" fill="#070b10" />
              <text x="588" y="283" fill="#9cc6ff" fontSize="8" textAnchor="middle" fontWeight="700">OUTPOST</text>
            </g>

            {/* Truss frame */}
            <path d="M96 188 520 74M104 200 528 86" stroke="#728191" strokeWidth="2" opacity=".55" />
            <path d="M96 188v-34M180 166v-34M264 144v-34M348 122v-34M432 100v-34M516 78v-34" stroke="#5d6a79" strokeWidth="2" opacity=".65" />
            <path d="M96 154h420M96 154l84-22M180 154l84-22M264 154l84-22M348 154l84-22M432 154l84-22" stroke="#4d5967" strokeWidth="1.4" opacity=".55" />
            <path d="M180 166l84-22M264 144l84-22M348 122l84-22" stroke="#4d5967" strokeWidth="1.2" opacity=".35" />
          </g>

          {/* HUD reticle */}
          <g opacity=".75">
            <path d="M354 156v-14h14M384 156v-14h-14" stroke="#ffd23f" strokeWidth="2" fill="none" />
            <path d="M354 306v14h14M384 306v14h-14" stroke="#ffd23f" strokeWidth="2" fill="none" />
            <text x="348" y="335" fill="#7f8d9f" fontSize="9" letterSpacing="2" fontFamily="Inter, sans-serif">CENTER FIELD</text>
          </g>
        </svg>
        <div className="floating-score">
          <span className="floating-score-label">SIMULATION 01</span>
          <div className="floating-score-row">
            <span className="fs-red">RED <b>12</b></span>
            <span className="fs-time">1:36</span>
            <span className="fs-blue"><b>8</b> BLUE</span>
          </div>
          <div className="floating-score-meta">
            <span>SHIFT 2 // BLUE HUB ACTIVE</span>
            <span>2v2 // 160s</span>
          </div>
        </div>
      </div>
      <div className="hero-camera-tag">
        <span className="live-dot" /> ARENA FEED
      </div>
      <div className="hero-bot-chip chip-red">
        <BotAvatar config={atlas.config} alliance="red" size={52} />
        <div>
          <strong>{atlas.name}</strong>
          <span>#{atlas.teamNumber} · YOU</span>
        </div>
      </div>
      <div className="hero-bot-chip chip-blue">
        <BotAvatar config={valkyrie.config} alliance="blue" size={52} />
        <div>
          <strong>{valkyrie.name}</strong>
          <span>#{valkyrie.teamNumber} · AI</span>
        </div>
      </div>
    </div>
  );
}
