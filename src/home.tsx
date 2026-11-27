import { useEffect, useState } from 'react'
import DishOrbitCarousel, { type Dish } from '@/components/ui/dish-orbit-carousel'

type Offer = { dish: Dish; target: { kind: 'trailer'; id: string } | { kind: 'wood' } }
type SiteData = {
  content: Record<string, string>
  trailers: Array<{ id: string; name: string; price: string; description: string; specs: Array<{ label: string; value: string }>; images: string[] }>
}

const fallback: Offer[] = [
  { target: { kind: 'trailer', id: '1' }, dish: { title: '3-Seiten', subtitle: 'Kipper', image: 'img/anhaenger/3-seitenkipper-seite.avif', alt: '3-Seitenkipper mit Gitteraufsatz', eyebrow: 'Anhängerverleih · Freising', label: '3-Seitenkipper', rating: 60, chef: 'Ab 60 € / Tag', kitchen: 'inkl. Versicherung · 150 € Kaution', description: 'Für Erde, Kies, Sand und Grünabfall. Kippt nach rechts, links und hinten.', ingredients: ['3,5 t Gesamtgewicht', '2,5 t Nutzlast', '4 × 2 m Ladefläche'], likes: 0, accent: '#f6a37c' } },
  { target: { kind: 'trailer', id: '2' }, dish: { title: 'Geschützt', subtitle: 'Transportieren', image: 'img/anhaenger/planenanhaenger-seite.avif', alt: 'Planenanhänger in Seitenansicht', eyebrow: 'Planenanhänger · Freising', label: 'Planenanhänger', rating: 50, chef: 'Ab 50 € / Tag', kitchen: 'inkl. Versicherung · 150 € Kaution', description: 'Mit Planenaufbau für alles, was geschützt und trocken transportiert werden soll.', ingredients: ['2,7 t Gesamtgewicht', '2,0 t Nutzlast', '3,3 × 1,8 m Ladefläche', '1,8 m Innenhöhe'], likes: 0, accent: '#9fcbe8' } },
  { target: { kind: 'wood' }, dish: { title: 'Wärme für', subtitle: 'Zuhause', image: 'img/brennholz.webp', alt: 'Aufgestapeltes Brennholz', eyebrow: 'Brennholz · Freising und Umgebung', label: 'Brennholz', rating: 65, chef: 'Ab 65 € / SRM', kitchen: 'Weichholz · Hartholz ab 100 € / SRM', description: 'Gespaltenes Brennholz in verschiedenen Längen. Lieferung nach Vereinbarung.', ingredients: ['Weichholz', 'Hartholz', '25 oder 33 cm', 'Lieferung auf Anfrage'], likes: 0, accent: '#bcd98e' } },
]

const accents = ['#f6a37c', '#9fcbe8', '#d6b6e8', '#e7ca7b', '#9fd4b8']

function managedOffers(site: SiteData): Offer[] {
  const trailers = site.trailers.map((trailer, index): Offer => {
    const words = trailer.name.split(/\s+/)
    const split = Math.max(1, Math.ceil(words.length / 2))
    return {
      target: { kind: 'trailer', id: trailer.id },
      dish: {
        title: words.slice(0, split).join(' '), subtitle: words.slice(split).join(' ') || 'Anhänger',
        image: trailer.images[0], alt: trailer.name, eyebrow: `${site.content.trailer_eyebrow || 'Anhängerverleih'} · ${site.content.contact_city || 'Freising'}`,
        label: trailer.name, rating: Number(String(trailer.price).replace(',', '.')) || 0, chef: `${trailer.price} € / Tag`,
        kitchen: 'Preis pro Miettag', description: trailer.description, ingredients: trailer.specs.map(spec => `${spec.label}: ${spec.value}`), likes: 0, accent: accents[index % accents.length],
      },
    }
  })
  const content = site.content
  trailers.push({ target: { kind: 'wood' }, dish: {
    title: content.wood_title?.split(' ').slice(0, 2).join(' ') || 'Brennholz', subtitle: content.wood_title?.split(' ').slice(2).join(' ') || 'bestellen',
    image: 'img/brennholz.webp', alt: 'Aufgestapeltes Brennholz', eyebrow: `${content.wood_eyebrow || 'Brennholz'} · ${content.contact_city || 'Freising'}`,
    label: content.wood_eyebrow || 'Brennholz', rating: Number(String(content.wood_soft_srm || '0').replace(',', '.')) || 0,
    chef: `Ab ${content.wood_soft_srm || '0'} € / SRM`, kitchen: `${content.wood_soft_name || 'Weichholz'} · ${content.wood_hard_name || 'Hartholz'} ab ${content.wood_hard_srm || '0'} € / SRM`,
    description: content.wood_intro || '', ingredients: [content.wood_soft_species, content.wood_hard_species, content.wood_soft_lengths, 'Lieferung auf Anfrage'].filter(Boolean), likes: 0, accent: '#bcd98e',
  } })
  return trailers
}

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>(fallback)
  useEffect(() => {
    fetch('api/index.php?action=site', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()).then((site: SiteData) => setOffers(managedOffers(site))).catch(() => {})
  }, [])
  function order(_: Dish, index: number) {
    const target = offers[index]?.target
    const button = target?.kind === 'trailer' ? document.querySelector<HTMLButtonElement>(`#anhaenger [data-book="${CSS.escape(target.id)}"]`) : document.querySelector<HTMLButtonElement>('#holz [data-order]')
    if (button) button.click(); else window.location.hash = target?.kind === 'wood' ? 'holz' : 'anhaenger'
  }
  return <DishOrbitCarousel dishes={offers.map(offer => offer.dish)} loop={false} offerMode height="calc(max(700px, 100svh) - var(--dsh-header-offset, 0px))" onOrder={order} onPlay={(_, index) => { window.location.hash = offers[index]?.target.kind === 'wood' ? 'holz' : 'anhaenger' }} className="home-orbit" />
}
