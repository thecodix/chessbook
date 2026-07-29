import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'

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

// Smoke test: verify canvas context stub doesn't crash when a component
// with <canvas> and getContext('2d') is rendered
describe('Canvas 2D context stub', () => {
  it('provides a working canvas getContext stub for testing', () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    expect(ctx).toBeDefined()
    expect(ctx).not.toBeNull()

    // Verify the stub supports the key operations Board.jsx uses
    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.font = '12px Arial'
    expect(ctx.fillStyle).toBe('#000000')
    expect(ctx.lineWidth).toBe(2)

    // Verify methods can be called without throwing
    ctx.fillRect(0, 0, 100, 100)
    ctx.strokeRect(10, 10, 50, 50)
    ctx.beginPath()
    ctx.arc(50, 50, 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillText('test', 50, 50)
    ctx.drawImage(canvas, 0, 0)

    const metrics = ctx.measureText('test')
    expect(metrics.width).toBe(0)
  })
})
