import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { StoreProvider } from './store'
import { Toaster } from '@/components/ui/sonner'

// StrictMode intentionally omitted: its double-mount churns the WebGL context
// (r3f <Canvas>) and can leave the 3D scene black in dev.
createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
    <Toaster position="bottom-center" theme="dark" />
  </StoreProvider>,
)
