// SVG Cartoon Avatar Generator & Customizer
const AVATAR_COLORS = [
  '#4ade80', // Green
  '#38bdf8', // Blue
  '#f43f5e', // Pink
  '#fbbf24', // Yellow
  '#a855f7', // Purple
  '#fb923c', // Orange
  '#2dd4bf', // Teal
  '#f472b6'  // Rose
];

const EYE_STYLES = [
  { id: 1, name: 'Happy', render: () => `
    <circle cx="35" cy="45" r="5" fill="#0f172a" />
    <circle cx="65" cy="45" r="5" fill="#0f172a" />
    <circle cx="37" cy="43" r="2" fill="#ffffff" />
    <circle cx="67" cy="43" r="2" fill="#ffffff" />
  `},
  { id: 2, name: 'Wink', render: () => `
    <circle cx="35" cy="45" r="5" fill="#0f172a" />
    <path d="M 60 45 Q 65 40 70 45" stroke="#0f172a" stroke-width="4" stroke-linecap="round" fill="none" />
  `},
  { id: 3, name: 'Glasses', render: () => `
    <rect x="22" y="38" width="24" height="16" rx="4" fill="#0f172a" />
    <rect x="54" y="38" width="24" height="16" rx="4" fill="#0f172a" />
    <line x1="46" y1="46" x2="54" y2="46" stroke="#0f172a" stroke-width="4" />
    <line x1="16" y1="44" x2="22" y2="44" stroke="#0f172a" stroke-width="3" />
    <line x1="78" y1="44" x2="84" y2="44" stroke="#0f172a" stroke-width="3" />
  `},
  { id: 4, name: 'Cute Star', render: () => `
    <polygon points="35,38 37,44 43,44 38,48 40,54 35,50 30,54 32,48 27,44 33,44" fill="#0f172a" />
    <polygon points="65,38 67,44 73,44 68,48 70,54 65,50 60,54 62,48 57,44 63,44" fill="#0f172a" />
  `},
  { id: 5, name: 'Shocked', render: () => `
    <circle cx="35" cy="45" r="7" fill="#ffffff" stroke="#0f172a" stroke-width="3" />
    <circle cx="35" cy="45" r="3" fill="#0f172a" />
    <circle cx="65" cy="45" r="7" fill="#ffffff" stroke="#0f172a" stroke-width="3" />
    <circle cx="65" cy="45" r="3" fill="#0f172a" />
  `}
];

const MOUTH_STYLES = [
  { id: 1, name: 'Big Smile', render: () => `
    <path d="M 32 64 Q 50 82 68 64" stroke="#0f172a" stroke-width="4" stroke-linecap="round" fill="none" />
  `},
  { id: 2, name: 'Tongue Out', render: () => `
    <path d="M 34 64 Q 50 78 66 64" stroke="#0f172a" stroke-width="4" stroke-linecap="round" fill="none" />
    <path d="M 44 68 Q 50 84 56 68 Z" fill="#f43f5e" stroke="#0f172a" stroke-width="2" />
  `},
  { id: 3, name: 'Smirk', render: () => `
    <path d="M 36 68 Q 55 64 66 60" stroke="#0f172a" stroke-width="4" stroke-linecap="round" fill="none" />
  `},
  { id: 4, name: 'Mustache', render: () => `
    <path d="M 30 65 Q 40 58 50 64 Q 60 58 70 65 Q 60 72 50 67 Q 40 72 30 65 Z" fill="#0f172a" />
  `},
  { id: 5, name: 'Open Laugh', render: () => `
    <path d="M 34 62 Q 50 88 66 62 Z" fill="#0f172a" stroke="#0f172a" stroke-width="2" />
    <path d="M 40 74 Q 50 84 60 74 Z" fill="#f43f5e" />
  `}
];

class AvatarGenerator {
  constructor() {
    this.current = {
      eyes: 1,
      mouth: 1,
      color: AVATAR_COLORS[0]
    };
  }

  randomize() {
    this.current.eyes = Math.floor(Math.random() * EYE_STYLES.length) + 1;
    this.current.mouth = Math.floor(Math.random() * MOUTH_STYLES.length) + 1;
    this.current.color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    return this.current;
  }

  renderSVG(config = this.current) {
    const eyeObj = EYE_STYLES.find(e => e.id === config.eyes) || EYE_STYLES[0];
    const mouthObj = MOUTH_STYLES.find(m => m.id === config.mouth) || MOUTH_STYLES[0];
    const color = config.color || '#4ade80';

    return `
      <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <!-- Head Base -->
        <circle cx="50" cy="50" r="44" fill="${color}" stroke="#0f172a" stroke-width="5" />
        
        <!-- Cheeks -->
        <ellipse cx="25" cy="56" rx="6" ry="3" fill="#f43f5e" opacity="0.4" />
        <ellipse cx="75" cy="56" rx="6" ry="3" fill="#f43f5e" opacity="0.4" />
        
        <!-- Eyes -->
        ${eyeObj.render()}
        
        <!-- Mouth -->
        ${mouthObj.render()}
      </svg>
    `;
  }
}

window.avatarGen = new AvatarGenerator();
