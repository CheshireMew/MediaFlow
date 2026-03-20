import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App'

type MockElectronAPI = {
  openFile: ReturnType<typeof vi.fn>
  readFile: ReturnType<typeof vi.fn>
  saveFile: ReturnType<typeof vi.fn>
  onProgress: ReturnType<typeof vi.fn>
  minimize: ReturnType<typeof vi.fn>
  maximize: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

type MockIconComponent = (props: Record<string, unknown>) => JSX.Element

// Mock Electron API
window.electronAPI = {
  openFile: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  onProgress: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  close: vi.fn(),
} as unknown as MockElectronAPI & Window['electronAPI']

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock Lucide icons and other complex components
vi.mock('lucide-react', () => {
  const icons = ['LayoutDashboard', 'Download', 'Type', 'Languages', 'Video', 'Settings', 'Clapperboard', 'Save', 'Scissors', 'Trash2', 'Plus', 'Play', 'Pause', 'Upload', 'CheckCircle', 'ChevronRight', 'X', 'Mic', 'Search', 'Clock', 'ChevronDown', 'Info', 'AlertCircle', 'Filter', 'ArrowLeftRight', 'Pencil', 'FileAudio', 'LogOut', 'MonitorPlay', 'Eraser', 'ScanText', 'Loader2', 'FolderOpen', 'ArrowRight', 'Wand2', 'Minus', 'Square', 'Activity', 'Globe']
  const mockIcons: Record<string, unknown> = {
    __esModule: true
  }
  icons.forEach(icon => {
    mockIcons[icon] = ((props: Record<string, unknown>) => <div data-testid={`icon-${icon.toLowerCase()}`} {...props}>{icon} Icon</div>) as MockIconComponent
  })
  // Proxy to catch any other icons not listed, but ONLY for uppercase/PascalCase names
  return new Proxy(mockIcons, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop]
      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {
        return ((props: Record<string, unknown>) => <div data-testid={`icon-${prop.toLowerCase()}`} {...props}>{prop} Icon</div>) as MockIconComponent
      }
      return undefined
    }
  })
})

// Mock TaskContext to avoid WebSocket side effects
vi.mock('../context/taskContext', () => ({
  TaskProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="task-provider">{children}</div>,
  useTaskContext: () => ({
    tasks: [],
    connected: false,
    cancelTask: vi.fn(),
    addTask: vi.fn()
  })
}))

// Mock WaveSurfer and components that use it
vi.mock('../components/editor/WaveformPlayer', () => ({
  WaveformPlayer: () => <div data-testid="waveform-player">Waveform Player Mock</div>
}))

// Mock Pages to avoid heavy rendering/side effects in smoke test
vi.mock('../pages/EditorPage', () => ({ EditorPage: () => <div data-testid="page-editor">Editor Page Mock</div> }))
vi.mock('../pages/DashboardPage', () => ({ DashboardPage: () => <div data-testid="page-dashboard">Dashboard Page Mock</div> }))
vi.mock('../pages/DownloaderPage', () => ({ DownloaderPage: () => <div data-testid="page-downloader">Downloader Page Mock</div> }))
vi.mock('../pages/TranscriberPage', () => ({ TranscriberPage: () => <div data-testid="page-transcriber">Transcriber Page Mock</div> }))
vi.mock('../pages/TranslatorPage', () => ({ TranslatorPage: () => <div data-testid="page-translator">Translator Page Mock</div> }))

test('renders app with navigation sidebar', () => {
  render(<App />)
  // Check for sidebar items via "Editor" title
  expect(screen.getByTitle(/Editor/i)).toBeInTheDocument()
})
