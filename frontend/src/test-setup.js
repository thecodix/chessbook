import '@testing-library/jest-dom'

// happy-dom (like jsdom) has no real canvas 2D backend. Board.jsx calls
// canvas.getContext('2d') unconditionally in its draw effect, so without
// this stub any test that renders a component containing <Board> throws.
HTMLCanvasElement.prototype.getContext = () => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineJoin: 'miter',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  fillRect: () => {},
  strokeRect: () => {},
  clearRect: () => {},
  fillText: () => {},
  strokeText: () => {},
  beginPath: () => {},
  closePath: () => {},
  arc: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fill: () => {},
  drawImage: () => {},
  save: () => {},
  restore: () => {},
  measureText: () => ({ width: 0 }),
  scale: () => {},
  rotate: () => {},
  translate: () => {},
  setTransform: () => {},
  transform: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
})
