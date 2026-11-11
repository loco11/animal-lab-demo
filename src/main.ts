import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/modern.css'
import './styles/hub.css'
import './styles/mobile.css'

import './pages/index'

import { mountApp } from './app'

mountApp(document.getElementById('app') as HTMLElement)
