// Іконки ресурсів та інтерфейсу (inline SVG, 16×16), щоб не залежати від емодзі-шрифтів Windows.
(function () {
  const S = (body) => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
  window.ICONS = {
    gold: S('<circle cx="8" cy="8" r="6.2" fill="#e3b23c" stroke="#8a6512" stroke-width="1.2"/><circle cx="8" cy="8" r="3.6" fill="none" stroke="#a87b1a" stroke-width="1"/><path d="M6 5.5 Q8 4.5 9.6 6" stroke="#fff3c4" stroke-width="1" fill="none"/>'),
    wood: S('<rect x="1.5" y="8.5" width="13" height="5" rx="2.5" fill="#8b5a2b" stroke="#4e3014"/><rect x="2.5" y="3" width="11" height="5" rx="2.5" fill="#a26a35" stroke="#4e3014"/><circle cx="12.6" cy="5.5" r="1.7" fill="#d8b07a" stroke="#4e3014" stroke-width=".7"/><circle cx="13" cy="11" r="1.7" fill="#d8b07a" stroke="#4e3014" stroke-width=".7"/>'),
    stone: S('<path d="M2 12 L4 6 L8 3.5 L12.5 5.5 L14.2 11 L10 13.6 L4.5 13.6Z" fill="#9c9a93" stroke="#55534e"/><path d="M4 6 L8 7.5 L12.5 5.5 M8 7.5 L8.5 13.5" stroke="#6f6d67" fill="none" stroke-width=".8"/>'),
    grain: S('<path d="M8 15 L8 4" stroke="#8a6d1d" stroke-width="1.2"/><g fill="#e2b843" stroke="#8a6d1d" stroke-width=".6"><ellipse cx="6.3" cy="5" rx="1.4" ry="2.1" transform="rotate(-25 6.3 5)"/><ellipse cx="9.7" cy="5" rx="1.4" ry="2.1" transform="rotate(25 9.7 5)"/><ellipse cx="6.3" cy="8.4" rx="1.4" ry="2.1" transform="rotate(-25 6.3 8.4)"/><ellipse cx="9.7" cy="8.4" rx="1.4" ry="2.1" transform="rotate(25 9.7 8.4)"/><ellipse cx="8" cy="2.6" rx="1.2" ry="1.9"/></g>'),
    fish: S('<path d="M1.5 8 Q6 2.5 11.5 8 Q6 13.5 1.5 8Z" fill="#6f98b5" stroke="#2f4d63"/><path d="M11 8 L15 4.5 L15 11.5Z" fill="#6f98b5" stroke="#2f4d63"/><circle cx="4.6" cy="7.2" r=".9" fill="#1c2a33"/>'),
    bread: S('<path d="M1.8 10.5 Q1.8 4.5 8 4.5 Q14.2 4.5 14.2 10.5 Q14.2 12.5 12 12.5 L4 12.5 Q1.8 12.5 1.8 10.5Z" fill="#c98a3f" stroke="#6b3f14"/><path d="M5 9 L6.5 6.5 M7.8 9.3 L9.3 6.6 M10.6 9.4 L12 7" stroke="#f1d39a" stroke-width="1.1"/>'),
    planks: S('<g stroke="#6b4a24" stroke-width=".8"><rect x="1.5" y="10.5" width="13" height="3" fill="#d6a76a"/><rect x="1.5" y="7" width="13" height="3" fill="#c99556"/><rect x="1.5" y="3.5" width="13" height="3" fill="#d6a76a"/></g>'),
    iron: S('<path d="M2 12 L4 6.5 L12 6.5 L14 12Z" fill="#7d8790" stroke="#39414a"/><path d="M4 6.5 L5.5 4 L13 4 L12 6.5" fill="#a8b2bb" stroke="#39414a"/><path d="M13 4 L15 9.5 L14 12" fill="#5d666e" stroke="#39414a"/>'),
    tools: S('<path d="M3 14 L10 7" stroke="#7a5230" stroke-width="2.2" stroke-linecap="round"/><path d="M7.5 3.5 L12.5 8.5 L14.5 6.5 L9.5 1.5Z" fill="#8a949c" stroke="#3a4148"/>'),
    knowledge: S('<rect x="3" y="2.5" width="10" height="11" fill="#efe1bb" stroke="#7a5f2e"/><rect x="2" y="1.5" width="12" height="2.4" rx="1.2" fill="#c9a86a" stroke="#7a5f2e"/><rect x="2" y="12.1" width="12" height="2.4" rx="1.2" fill="#c9a86a" stroke="#7a5f2e"/><path d="M5 6 H11 M5 8 H11 M5 10 H9" stroke="#7a5f2e" stroke-width=".8"/>'),
    pop: S('<circle cx="8" cy="4.5" r="2.6" fill="#e0b48a" stroke="#6b4425"/><path d="M3 14.5 Q3 8 8 8 Q13 8 13 14.5Z" fill="#8a5a3a" stroke="#4a2c18"/>'),
    house: S('<path d="M2 8 L8 2.5 L14 8" fill="#a0462b" stroke="#5a2414"/><rect x="3.5" y="8" width="9" height="6" fill="#d9c49a" stroke="#6b5530"/><rect x="7" y="10" width="2.5" height="4" fill="#5a3a1e"/>'),
    shield: S('<path d="M8 1.5 L14 3.5 Q14 11 8 14.5 Q2 11 2 3.5Z" fill="#3d5a80" stroke="#1d2c40"/><path d="M8 3.5 V12.5 M4.5 6.5 H11.5" stroke="#e3b23c" stroke-width="1.4"/>'),
    sword: S('<path d="M13.5 2.5 L6 10" stroke="#aeb7bf" stroke-width="2.2" stroke-linecap="round"/><path d="M13.5 2.5 L6 10" stroke="#5d666e" stroke-width=".7"/><path d="M3.5 8.5 L7.5 12.5" stroke="#7a5230" stroke-width="1.8"/><path d="M5.5 10.5 L2.5 13.5" stroke="#5a3a1e" stroke-width="2"/>'),
    crown: S('<path d="M2 12 L2 5 L5 8 L8 3.5 L11 8 L14 5 L14 12Z" fill="#e3b23c" stroke="#8a6512"/><rect x="2" y="12" width="12" height="2" fill="#c99a2e" stroke="#8a6512"/>'),
    sun: S('<circle cx="8" cy="8" r="3.2" fill="#f0c040" stroke="#a67a10"/><g stroke="#d9a520" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g>'),
    snow: S('<g stroke="#7fa8c9" stroke-width="1.4" stroke-linecap="round"><path d="M8 1.5v13M2.4 4.8l11.2 6.4M2.4 11.2l11.2-6.4"/></g>'),
    leaf: S('<path d="M3 13 Q3 3 13 3 Q13 13 3 13Z" fill="#7aa64a" stroke="#3f5f22"/><path d="M3 13 L10 6" stroke="#3f5f22"/>'),
    maple: S('<path d="M8 1.5 L9.5 5 L13 4 L11.5 7.5 L14.5 9 L10.5 10 L11 13 L8 11.5 L5 13 L5.5 10 L1.5 9 L4.5 7.5 L3 4 L6.5 5Z" fill="#c8662a" stroke="#6e3210"/>'),
  };
  window.icon = (k) => window.ICONS[k] || '';
})();
