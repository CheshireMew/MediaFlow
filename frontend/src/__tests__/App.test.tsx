import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import App from '../App'
import { installElectronMock } from './testUtils/electronMock'

type MockIconComponent = (props: Record<string, unknown>) => ReactElement

installElectronMock()

afterEach(() => {
  window.location.hash = '#/'
  localStorage.clear()
})

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
  TaskProvider: ({ children }: { children: ReactNode }) => <div data-testid="task-provider">{children}</div>,
  useTaskContext: () => ({
    tasks: [],
    connected: false,
    remoteTasksReady: false,
    tasksSettled: false,
      taskOwnerMode: "desktop",
    pauseLocalTasks: vi.fn(),
    pauseRemoteTasks: vi.fn(),
    pauseAllTasks: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    deleteTask: vi.fn(),
    clearTasks: vi.fn(),
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
vi.mock('../pages/PreprocessingPage', () => ({ PreprocessingPage: () => <div data-testid="page-preprocessing">Preprocessing Page Mock</div> }))

test('renders app with navigation sidebar', () => {
  render(<App />)
  // Check for sidebar items via "Editor" title
  expect(screen.getByTitle(/Editor/i)).toBeInTheDocument()
})

test('opens downloader on first launch', async () => {
  render(<App />)
  await waitFor(() => {
    expect(screen.getByTestId('page-downloader')).toBeInTheDocument()
  })
})

test('restores the last opened page from localStorage', async () => {
  localStorage.setItem('mediaflow:last-route', 'translator')
  render(<App />)
  await waitFor(() => {
    expect(screen.getByTestId('page-translator')).toBeInTheDocument()
  })
})

test('renders preprocessing page without backend readiness gate', () => {
  window.location.hash = '#/preprocessing'
  render(<App appReady remoteBackendReady={false} startupMessage="Waiting" />)
  expect(screen.getByTestId('page-preprocessing')).toBeInTheDocument()
})

test('allows editor in desktop runtime before backend health is ready', () => {
  window.location.hash = '#/editor'
  render(<App appReady remoteBackendReady={false} startupMessage="Waiting" />)
  expect(screen.getByTestId('page-editor')).toBeInTheDocument()
})


