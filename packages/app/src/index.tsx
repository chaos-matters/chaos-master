/* @refresh reload */
import './styles/index.css'
import { inject } from '@vercel/analytics'
import { render } from 'solid-js/web'
import { Wrappers } from './App'

const root = document.getElementById('root')

if (!root) {
  throw new Error(`Could not find element with id 'root'`)
}

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  )
}

render(() => <Wrappers />, root)
inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
})
