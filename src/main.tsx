import { createRoot } from 'react-dom/client'
import Demo from './demo'
import Home from './home'
import './carousel.css'

const root = document.getElementById('dish-carousel')
if (root) createRoot(root).render(root.dataset.page === 'home' ? <Home /> : <Demo />)
