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
  blackmar_diemer: {
    key: 'blackmar_diemer',
    name: 'Blackmar-Diemer Gambit',
    color: 'white',
    description: 'An active answer to 1...d5: offer the e-pawn for rapid development, open lines, and pressure on the kingside. The repertoire covers Black\'s accepted defenses, countergambits, and the main ways to decline.',
    lines: [
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','Bf5','g4','Bg6','g5','Nd5'], label: '1. Bogoljubow: immediate g4', idea: 'Gain space with g4-g5, then develop Nge2 and h4 to keep Black\'s kingside pieces under pressure.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','Bf5','g4','Bg6','Nge2','e6','h4'], label: '2. Bogoljubow: Nge2 and h4', idea: 'Use Nge2 to support the centre and h4 to challenge the bishop.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','Bf5','g4','Bg6','Bc4','e6','Nge2'], label: '3. Bogoljubow: Bc4 development', idea: 'Develop toward f7 before committing the king.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','e6','Bc4','Be7','fxe4'], label: '4. Euwe Defense: Bc4', idea: 'Recover the centre with fxe4 and use Bc4 to make castling awkward.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','e6','Bg5','Be7','fxe4'], label: '5. Euwe Defense: Bg5', idea: 'Pin the knight before recapturing.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','Bg4','Bc4','exf3','Nxf3'], label: '6. Teichmann Defense', idea: 'Develop with tempo on f7 and recapture with the knight.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','c6','Bc4','Bf5','fxe4'], label: '7. Ryder Defense: ...c6', idea: 'Use Bc4 and fxe4 to maintain central pressure.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','c5','d5','exf3','Nxf3'], label: "8. O'Kelly Defense: ...c5", idea: 'Advance d5, then recapture with the knight and keep the initiative.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','g6','Bc4','Bg7','fxe4'], label: '9. Fianchetto Defense: ...g6', idea: 'Use the centre before Black\'s fianchetto becomes a defensive asset.' },
      { moves: ['d4','d5','e4','dxe4','Nc3','Nf6','f3','e5','dxe5','Qxd1+','Kxd1','Nfd7'], label: '10. Hübsch Gambit: accept', idea: 'Accept the countergambit, develop calmly, and retain the e5 pawn.' },
      { moves: ['d4','d5','e4','c6','Nc3','Nf6','f3','dxe4','fxe4'], label: '11. Lemberger Defense: ...c6', idea: 'Recapture with the f-pawn and use the open f-file.' },
      { moves: ['d4','d5','e4','e6','e5','c5','c3','Nc6','Nf3','Qb6','Bd3'], label: '12. French Declined: Advance', idea: 'Claim space with e5 and build an Advance French structure.' },
      { moves: ['d4','Nf6','Nc3','d5','e4','dxe4','f3','exf3','Nxf3'], label: '13. Alekhine Move Order', idea: 'Regain the pawn with the knight and use the lead in development.' },
      { moves: ['d4','d5','e4','c5','exd5','Nf6','Nc3','Nxd5','Nxd5'], label: '14. Symmetrical Declined: ...c5', idea: 'Trade the d-pawn, recapture on d5, and finish development quickly.' },
    ],
    retention: 50,
    openingRetention: 50,
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
    description: 'The main black repertoire against 1.e4: build the French center with ...e6 and ...d5, then choose the right break with ...c5. Keep d5 defended, route the kingside knight through e7, and attack the wing where White has castled.',
    lines: [
      {
        moves: ['e4','e6','d4','d5','exd5','exd5','Nf3','Bd6','Bd3','Ne7','O-O','O-O','Nc3','c6','Be3','Bf5','Qd2','Nd7'],
        label: '1. Exchange: solid setup',
        idea: 'Build the solid ...d5 and ...c6 structure. Rook to e8 is the main improving move, followed by ...Nf8 and ...Ng6-e6, or ...b5 and ...a5 when the queenside expansion is safe.',
      },
      {
        moves: ['e4','e6','d4','d5','exd5','exd5','Bf4','Bd6','Qd2','Ne7','Nc3','c6','O-O-O','O-O','f3','b5','g4','a5','h4','a4','h5','b4','Nce2','b3','a3','bxc2','Kxc2','Ba6','h6','g6'],
        label: '2. Exchange with opposite-side castling',
        idea: 'White attacks on the kingside after castling long, so race on the queenside with ...b5-b4 and ...a5-a4. Before ...c5, calculate how the d5 pawn will remain defended.',
      },
      {
        moves: ['e4','e6','d4','d5','e5','c5','c3','Nc6','Nf3','Qb6','Bd3','cxd4','cxd4','Bd7','Be2','Nh6','Bxh6','Qxb2','Nbd2','gxh6'],
        label: '3. Advance: ...Nh6 and ...c5',
        idea: 'The ...Nh6 route avoids the knight manoeuvre to a3 and keeps the f8 bishop flexible for ...Bb4+. If White does not exchange the knight, continue with ...Nf5.',
      },
      {
        moves: ['e4','e6','d4','d5','e5','c5','c3','Nc6','Be3','Qb6','Qd2','Nh6','Bd3','Ng4','Ne2','c4','Bc2','Qxb2'],
        label: '4. Advance with Be3',
        idea: 'Develop the knight through h6-g4 and strike at b2. The advanced c-pawn restricts White\'s queenside pieces while the queen creates immediate practical pressure.',
      },
      {
        moves: ['e4','e6','d4','d5','e5','c5','c3','Nc6','Nf3','Qb6','Be2','cxd4','cxd4','Nh6','O-O','Nf5'],
        label: '5. Advance with Be2',
        idea: 'Against Be2, do not retreat the bishop to d7 first. Play ...Nh6 and reach f5 quickly; if White captures the knight, the queen enters on b2 as in the main idea.',
      },
      {
        moves: ['e4','e6','d4','d5','e5','c5','c3','Nc6','Nf3','Qb6','a3','Nh6','Bd3','cxd4','O-O','Nf5'],
        label: '6. Advance with a3',
        idea: 'White prepares b4, so do not release the central tension with an automatic ...cxd4 too early. Develop with ...Nh6-f5; after an exchange on f5, use the bishop on e6 to hold the pawn chain.',
      },
      {
        moves: ['e4','e6','d4','d5','Nc3','Nf6','Bg5','dxe4','Nxe4','Be7','Bd3','Nxe4','Bxe7','Qxe7','Bxe4','Qb4+','c3','Qxb2'],
        label: '7a. Nc3 with Bg5: early exchange',
        idea: 'Against Bg5, exchange on e4 immediately. Playing ...Be7 first allows e5 and can leave Black in a difficult position.',
      },
      {
        moves: ['e4','e6','d4','d5','Nc3','Nf6','Bg5','dxe4','Nxe4','Be7','Bxf6','Bxf6','Nf3','O-O','Nxf6+','Qxf6','Bd3','c5','c3','cxd4'],
        label: '7b. Nc3 with Bg5: bishop exchange',
        idea: 'The second Bg5 branch also starts with ...dxe4. After the exchanges, ...c5 is the freeing break and the structure remains easy to handle.',
      },
      {
        moves: ['e4','e6','d4','d5','Nc3','Nf6','e5','Nfd7','f4','c5','Nf3','Nc6','Be3','cxd4','Nxd4','Bc5','Nxc6','bxc6'],
        label: '8. Nc3 with e5',
        idea: 'Meet the Advance structure with ...c5 and ...Nc6. If White chooses Qd2 instead of Nxc6, simplify with ...Nxd4, ...Bxd4, ...Bxd4, ...Qxd4 and ...Qb6 for an equal endgame.',
      },
      {
        moves: ['e4','e6','d4','d5','Nc3','Nf6','Bd3','c5','Nf3','c4','e5','cxd3','exf6','dxc2','Qxc2','gxf6'],
        label: '9a. Nc3 with Bd3',
        idea: 'Against Bd3, play ...c5 immediately. Capturing the final pawn with the g-pawn matters: taking with the queen allows Nxd5 because the c8 bishop is then attacked.',
      },
      {
        moves: ['e4','e6','d4','d5','Nc3','Nf6','Bd3','c5','exd5','Nxd5','Nxd5','Qxd5','Nf3','cxd4'],
        label: '9b. Nc3 with Bd3: early exchange',
        idea: 'If White exchanges on d5, recapture with the knight and welcome the simplification. After ...cxd4, develop naturally and Black should have no structural problems.',
      },
      {
        moves: ['e4','e6','d4','d5','Nd2','c5','Ngf3','cxd4','Nxd4','Nf6','exd5','Qxd5','Nb5','Qd8','Bd3','a6','Nc3','Nc6'],
        label: '10a. Tarrasch: central exchanges',
        idea: 'The Tarrasch is easy to equalise when White exchanges in the centre. Develop naturally and use the open lines rather than forcing a premature attack.',
      },
      {
        moves: ['e4','e6','d4','d5','Nd2','c5','exd5','exd5','Ngf3','cxd4','Bc4','Qd6'],
        label: '10b. Tarrasch: queen recaptures',
        idea: 'When White chooses exd5 or Nf3, meet the position with ...Nf6 if needed and decide which central exchanges favour Black. The queen on d6 can later reposition toward c7.',
      },
      {
        moves: ['e4','e6','d4','d5','Nd2','c5','exd5','Qxd5','Ngf3','cxd4','Bc4','Qd6'],
        label: '10c. Tarrasch: ...Qxd5',
        idea: 'After ...Qxd5, develop with ...cxd4 and ...Qd6. Against anything other than exd5 or Nf3, play ...Nf6 and choose the central exchanges that best suit Black.',
      },
    ],
    retention: 62,
    openingRetention: 62,
  },
}

export const OPENING_LIST = Object.values(OPENINGS)
