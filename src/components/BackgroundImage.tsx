import type { SyntheticEvent } from 'react'

const SAMPLE_WIDTH = 64
const SAMPLE_HEIGHT = 8

function updateBackgroundBrightness(event: SyntheticEvent<HTMLImageElement>) {
  try {
    const image = event.currentTarget
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = SAMPLE_HEIGHT

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return

    const sourceHeight = Math.max(1, Math.floor(image.naturalHeight * 0.12))
    context.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)

    const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data
    let total = 0
    for (let i = 0; i < pixels.length; i += 4) {
      total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    }

    const isDark = total / (pixels.length / 4) < 100
    ;(window as any).__bgDark = isDark
    window.dispatchEvent(new CustomEvent('bg-dark-change', { detail: { isDark } }))
  } catch (error) {
    console.warn('[bg-image]', error)
  }
}

export default function BackgroundImage() {
  return (
    <div id="bg-wallpaper" aria-hidden="true">
      <img id="bg-wallpaper-img" src="/api/wallpaper/?v=2" alt="" onLoad={updateBackgroundBrightness} />
    </div>
  )
}
