import { ref, type Ref } from 'vue'

export interface AlbumColors {
  dominant: string
  gradient: string
}

export function useAlbumColors() {
  const colors: Ref<AlbumColors> = ref({
    dominant: 'rgba(76,175,80,.06)',
    gradient: 'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(76,175,80,.22), rgba(18,18,18,.08), transparent 65%)',
  })

  const defaultGlow = 'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(76,175,80,.15), rgba(18,18,18,.06), transparent 65%)'

  function extractFromImage(imgSrc: string): void {
    if (!imgSrc || imgSrc === '') {
      colors.value = { dominant: 'rgba(76,175,80,.06)', gradient: defaultGlow }
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const size = 50
        canvas.width = size
        canvas.height = size
        ctx.drawImage(img, 0, 0, size, size)

        const imageData = ctx.getImageData(0, 0, size, size).data
        let r = 0, g = 0, b = 0, count = 0

        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i]
          g += imageData[i + 1]
          b += imageData[i + 2]
          count++
        }

        r = Math.round(r / count)
        g = Math.round(g / count)
        b = Math.round(b / count)

        const dominant = `rgba(${r},${g},${b},.06)`
        const gradient = `radial-gradient(ellipse 70% 50% at 50% 100%, rgba(${r},${g},${b},.25), rgba(${Math.round(r/2)},${Math.round(g/2)},${Math.round(b/2)},.10), transparent 65%)`

        colors.value = { dominant, gradient }
      } catch {
        colors.value = { dominant: 'rgba(76,175,80,.06)', gradient: defaultGlow }
      }
    }
    img.onerror = () => {
      colors.value = { dominant: 'rgba(76,175,80,.06)', gradient: defaultGlow }
    }
    img.src = imgSrc
  }

  return { colors, extractFromImage, defaultGlow }
}
