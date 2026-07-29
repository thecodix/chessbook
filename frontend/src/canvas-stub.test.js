import { describe, it, expect } from 'vitest'

// Smoke test for the canvas 2D context stub installed by test-setup.js's
// setupFiles hook (which runs before every test file, so the stub is
// already in place here). Verifies it doesn't crash when a component with
// <canvas> and getContext('2d') is rendered — kept in its own file so
// setupFiles stays pure setup with no test assertions of its own (that
// setup re-executes per test file, so embedding this test there was
// silently inflating every file's reported test count).
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
