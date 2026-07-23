// Static repertoire data — in production this comes from your FastAPI backend.
// Shape mirrors the DB model: opening → lines → moves[]

export const OPENINGS = {
  london: {
    key: 'london',
    name: 'London System',
    color: 'white',
    description: 'Solid, low-theory setup. Control d4 with Bf4 before Black can challenge it. The goal is a stable pawn structure (d4+e3+c3) that lets you outplay opponents positionally without memorising long forced lines. Works against almost everything Black plays.',
    lines: [
      {
        moves: ['d4','d5','Bf4','Nf6','e3','e6','Nf3','Be7','Bd3','O-O'],
        label: 'Main line',
        idea: 'Black sets up a classical Queen\'s Gambit-style structure. Complete development with Bd3, Nbd2, O-O, and look to expand with c4 or e4 once your pieces are coordinated.',
      },
      {
        moves: ['d4','Nf6','Bf4','e6','e3','b6','Nf3','Bb7','Bd3','c5'],
        label: 'vs KID setup',
        idea: 'Black fianchettoes the bishop, aiming for a hypermodern game. Stay solid — don\'t be tempted by c4 too early. Let Black commit before you react. Bd3 covers the h7 diagonal and eyes a future kingside attack.',
      },
      {
        moves: ['d4','d5','Bf4','c5','e3','Nc6','Nf3','Qb6','Qc1'],
        label: 'vs c5 sideline',
        idea: 'Black tries to exploit the b2 pawn immediately with ...Qb6. Qc1 is the key move — it defends b2 without blocking development and keeps tension in the center. Don\'t trade on c5 yet; maintain the pawn on d4.',
      },
    ],
    retention: 88,
    openingRetention: 75,
  },
  italian: {
    key: 'italian',
    name: 'Italian Game',
    color: 'white',
    description: 'Classic open-game development. Place the bishop on c4 to target the weak f7 square and control the center. The Italian gives rich middlegame positions with clear plans — ideal for building attacking intuition without relying on engine prep.',
    lines: [
      {
        moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d4'],
        label: 'Giuoco Piano',
        idea: 'The main theoretical battleground. After ...exd4 cxd4 Bb4+ you enter the richest lines. The plan is simple: seize the center with d4, castle kingside, and use the open d-file to create pressure. Piece activity beats pawn structure here.',
      },
      {
        moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6','d3','Bc5'],
        label: 'Slow Italian',
        idea: 'Sidestep sharp theory with d3. The position is quieter but gives you a safe positional edge. Develop with Nc3, O-O, then decide between a kingside attack (f4) or a central break (d4) based on what Black does. Good when you want a full game.',
      },
    ],
    retention: 71,
    openingRetention: 71,
  },
  sicilian: {
    key: 'sicilian',
    name: 'Sicilian Dragon',
    color: 'black',
    description: 'Double-edged and uncompromising. Black gives up central symmetry for dynamic counterplay on the queenside and the long diagonal. Both sides castle on opposite wings and race to attack — you must understand the imbalances, not just memorise moves.',
    lines: [
      {
        moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','g6'],
        label: 'Dragon setup',
        idea: 'Fianchetto the bishop to g7 to dominate the long diagonal. Your plan: ...O-O, ...Nc6, ...a5-a4 queenside expansion while watching for the Yugoslav Attack (Be3+Qd2+O-O-O). In sharp lines you must move fast — every tempo counts when kings are on opposite sides.',
      },
      {
        moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','g6','Nc3','Bg7'],
        label: 'Accelerated Dragon',
        idea: 'Reach the Dragon structure without playing ...d6, keeping ...d5 as a one-move threat. If White plays Nb3, you can equalise comfortably. The key advantage: avoid the Yugoslav Attack entirely. Trade-off: slightly less active in some lines.',
      },
    ],
    retention: 91,
    openingRetention: 91,
  },
  carokann: {
    key: 'carokann',
    name: 'Caro-Kann',
    color: 'black',
    description: 'Solid and principled reply to 1.e4. Black supports d5 with c6 before committing the pawn, leading to a healthy pawn structure and no long-term weaknesses. Ideal if you want to avoid the sharp Open Game theory while still fighting for equality with Black.',
    lines: [
      {
        moves: ['e4','c6','d4','d5','Nc3','dxe4','Nxe4','Bf5'],
        label: 'Classical',
        idea: 'Bf5 is the critical move — activate the bishop before it gets locked in. After Ng3 Bg6, your bishop is safely placed and you focus on ...Nf6, ...e6, ...Bd6 or ...Be7 development. The resulting middlegame is solid with good endgame prospects thanks to the healthy pawn structure.',
      },
    ],
    retention: 38,
    openingRetention: 38,
  },
  french: {
    key: 'french',
    name: 'French Defense',
    color: 'black',
    description: 'Fight for the center with ...e6+...d5. Black accepts a slightly cramped position early in exchange for a rock-solid structure and clear counterplay plans. The light-squared bishop can be a problem — your plan is to trade it or reroute it via d7.',
    lines: [
      {
        moves: ['e4','e6','d4','d5','Nc3','Nf6','e5','Nfd7','f4'],
        label: 'Advance variation',
        idea: 'White locks the center with e5 and will try to storm the kingside with f4-f5. Your plan: ...c5 to attack d4, ...Nc6 to pressure the chain, and castle queenside if possible. Don\'t rush — let White overextend before striking. The knight on d7 reroutes to b6 to pressure d4.',
      },
    ],
    retention: 62,
    openingRetention: 62,
  },
}

export const OPENING_LIST = Object.values(OPENINGS)
