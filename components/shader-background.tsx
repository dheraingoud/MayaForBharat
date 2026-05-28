'use client'

import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'

export function ShaderBackground() {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    let animationId: number

    const colors = {
      light: {
        bg: '#F5F4F0',
        primary: '#E8601A',
        accent: '#FFFFFF',
        secondary: 'rgba(232, 96, 26, 0.1)',
      },
      dark: {
        bg: '#1A1917',
        primary: '#E8601A',
        accent: '#2A2925',
        secondary: 'rgba(232, 96, 26, 0.15)',
      },
    }

    const currentColors = theme === 'dark' ? colors.dark : colors.light

    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      r: number
      opacity: number
    }> = []

    // Initialize particles
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 150 + 100,
        opacity: Math.random() * 0.3 + 0.1,
      })
    }

    const animate = () => {
      // Clear canvas with theme-appropriate color
      ctx.fillStyle = currentColors.bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw moving gradient blobs
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy

        // Bounce off edges
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1

        // Clamp position
        p.x = Math.max(0, Math.min(canvas.width, p.x))
        p.y = Math.max(0, Math.min(canvas.height, p.y))

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
        gradient.addColorStop(0, `rgba(232, 96, 26, ${p.opacity})`)
        gradient.addColorStop(0.5, `rgba(232, 96, 26, ${p.opacity * 0.5})`)
        gradient.addColorStop(1, `rgba(232, 96, 26, 0)`)

        ctx.fillStyle = gradient
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
      })

      // Add subtle grid pattern
      ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
      ctx.lineWidth = 1

      const gridSize = 100
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
    }
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  )
}
