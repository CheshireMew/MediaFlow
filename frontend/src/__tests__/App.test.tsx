import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import App from '../App'
import { installElectronMock } from './testUtils/electronMock'
import { initializeUiStateSettings, resetUiStateSettingsForTests } from '../services/persistence/uiStateSettings'
import { createMockUserSettings } from './testUtils/mockUserSettings'
import { resetNavigationPersistenceForTests } from '../services/ui/navigationPersistence'
import {
  initializeWorkspaceState,
  resetWorkspaceStateForTests,
  writeWorkspaceStateValue,
} from '../services/persistence/workspaceState'

type MockIconComponent = (props: Record<string, unknown>) => ReactElement

const { prewarmFasterWhisperCliFromStoredPreferencesMock } = vi.hoisted(() => ({
  prewarmFasterWhisperCliFromStoredPreferencesMock: vi.fn(),
}))

installElectronMock()

afterEach(() => {
  window.location.hash = '#/'
  localStorage.clear()
  resetUiStateSettingsForTests()
  resetWorkspaceStateForTests()
  resetNavigationPersistenceForTests()
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../services/asrCliPrewarm', () => ({
  prewarmFasterWhisperCliFromStoredPreferences: prewarmFasterWhisperCliFromStoredPreferencesMock,
}))

// Mock Lucide icons and other complex components
vi.mock('lucide-react', () => {
  const icons = ['LayoutDashboard', 'Download', 'Type', 'Languages', 'Video', 'Settings', 'Clapperboard', 'Save', 'Scissors', 'Trash2', 'Plus', 'Play', 'Pause', 'Upload', 'CheckCircle', 'ChevronRight', 'X', 'Mic', 'Search', 'Clock', 'ChevronDown', 'Info', 'AlertCircle', 'Filter', 'ArrowLeftRight', 'Pencil', 'FileAudio', 'LogOut', 'MonitorPlay', 'Eraser', 'ScanText', 'Loader2', 'FolderOpen', 'ArrowRight', 'Wand2', 'RefreshCw', 'Minus', 'Square', 'Activity', 'Globe']
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
vi.mock('../context/TaskProvider', () => ({
  TaskProvider: ({ children }: { children: ReactNode }) => <div data-testid="task-provider">{children}</div>,
}))

vi.mock('../context/taskContext', () => ({
  useTaskContext: () => ({
    tasks: [],
    connected: false,
    remoteTasksReady: false,
    tasksSettled: false,
    pauseAllTasks: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    deleteTask: vi.fn(),
    clearTasks: vi.fn(),
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

test('renders app with navigation sidebar', async () => {
  const { container } = render(<App />)
  await waitFor(() => {
    expect(screen.getByTitle(/Editor/i)).toBeInTheDocument()
    expect(screen.getByTestId('page-downloader')).toBeInTheDocument()
  })
  expect(container.querySelector('.titlebar-drag-region')).not.toBeInTheDocument()
})

test('opens downloader on first launch', async () => {
  render(<App />)
  await waitFor(() => {
    expect(screen.getByTestId('page-downloader')).toBeInTheDocument()
  })
  await waitFor(() => {
    expect(prewarmFasterWhisperCliFromStoredPreferencesMock).toHaveBeenCalled()
  })
})

test('restores the last opened page from workspace state', async () => {
  initializeUiStateSettings(createMockUserSettings())
  writeWorkspaceStateValue('mediaflow:last-route', 'translator')
  await initializeWorkspaceState()
  render(<App />)
  await waitFor(() => {
    expect(screen.getByTestId('page-translator')).toBeInTheDocument()
  })
})

test('gates editor page on backend readiness', async () => {
  window.location.hash = '#/editor'
  render(<App appReady remoteBackendReady={false} startupMessage="Waiting" />)
  expect(screen.queryByTestId('page-editor')).not.toBeInTheDocument()
  expect(screen.getByText('Waiting')).toBeInTheDocument()
})

test('exposes the startup retry action for recoverable failures', () => {
  const onRetryStartup = vi.fn()
  render(
    <App
      appReady={false}
      remoteBackendReady={false}
      startupMessage="Temporarily unavailable"
      startupStatus="retryable-error"
      onRetryStartup={onRetryStartup}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: /startup\.action\.retry/ }))
  expect(onRetryStartup).toHaveBeenCalledTimes(1)
})
