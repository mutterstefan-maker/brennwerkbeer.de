import DishOrbitCarousel, { type Dish } from '@/components/ui/dish-orbit-carousel'

const offers: Dish[] = [
  { title: '3-Seiten', subtitle: 'Kipper', image: 'img/anhaenger/3-seitenkipper-seite.avif', alt: '3-Seitenkipper mit Gitteraufsatz', eyebrow: 'Anhängerverleih · Freising', label: '3-Seitenkipper', rating: 60, chef: 'Ab 60 € / Tag', kitchen: 'inkl. Versicherung · 150 € Kaution', description: 'Für Erde, Kies, Sand und Grünabfall. Kippt nach rechts, links und hinten.', ingredients: ['3,5 t Gesamtgewicht', '2,5 t Nutzlast', '4 × 2 m Ladefläche'], likes: 0, accent: '#f6a37c' },
  { title: 'Geschützt', subtitle: 'Transportieren', image: 'img/anhaenger/planenanhaenger-seite.avif', alt: 'Planenanhänger in Seitenansicht', eyebrow: 'Planenanhänger · Freising', label: 'Planenanhänger', rating: 50, chef: 'Ab 50 € / Tag', kitchen: 'inkl. Versicherung · 150 € Kaution', description: 'Mit Planenaufbau für alles, was geschützt und trocken transportiert werden soll.', ingredients: ['2,7 t Gesamtgewicht', '2,0 t Nutzlast', '3,3 × 1,8 m Ladefläche', '1,8 m Innenhöhe'], likes: 0, accent: '#9fcbe8' },
  { title: 'Wärme für', subtitle: 'Zuhause', image: 'img/brennholz.webp', alt: 'Aufgestapeltes Brennholz', eyebrow: 'Brennholz · Freising und Umgebung', label: 'Brennholz', rating: 65, chef: 'Ab 65 € / SRM', kitchen: 'Weichholz · Hartholz ab 100 € / SRM', description: 'Gespaltenes Brennholz in verschiedenen Längen. Lieferung nach Vereinbarung.', ingredients: ['Weichholz', 'Hartholz', '25 oder 33 cm', 'Lieferung auf Anfrage'], likes: 0, accent: '#bcd98e' },
]

export default function Home() {
  function order(_: Dish, index: number) {
    // The existing HTML buttons own the booking and wood dialog logic.
    const button = document.querySelector<HTMLButtonElement>(index < 2 ? `#anhaenger [data-book="${index + 1}"]` : '#holz [data-order]')
    if (button) button.click()
    else window.location.hash = index < 2 ? 'anhaenger' : 'holz'
  }
  return <DishOrbitCarousel dishes={offers} loop={false} offerMode height="calc(max(700px, 100svh) - var(--dsh-header-offset, 0px))" onOrder={order} onPlay={(_, i) => { window.location.hash = i < 2 ? 'anhaenger' : 'holz' }} className="home-orbit" />
}
