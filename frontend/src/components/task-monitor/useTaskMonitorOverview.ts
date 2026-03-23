import React from 'react';
import { useSyncExternalStore } from 'react';
import { useTaskContext } from '../../context/taskContext';
import { isDesktopRuntime } from '../../services/desktop';
import { getExecutionModeDisplay } from '../../services/ui/executionModeDisplay';
import type { ExecutionMode } from '../../services/domain';
import { useRuntimeExecutionStore } from '../../stores/runtimeExecutionStore';
import {
    getTaskSourceDiagnosticState,
    subscribeTaskSourceDiagnostics,
} from '../../context/taskSources/diagnostics';

const matchesFilterType = (task: { type: string; name?: string; request_params?: { steps?: Array<{ step_name?: string; action?: string }> } }, filterTypes?: string[]) => {
    if (!filterTypes || filterTypes.length === 0) {
        return true;
    }

    if (filterTypes.includes(task.type)) {
        return true;
    }

    if (task.type === 'pipeline' && filterTypes.includes('download')) {
        return Boolean(
            task.name?.toLowerCase().includes('download') ||
            task.request_params?.steps?.some((step) => step.step_name === 'download' || step.action === 'download'),
        );
    }

    return false;
};

export const useTaskMonitorOverview = (filterTypes?: string[]) => {
    const {
        tasks,
        connected,
        remoteTasksReady,
        taskOwnerMode,
    } = useTaskContext();
    const runtimeExecutionScopes = useRuntimeExecutionStore((state) => state.scopes);
    const taskFeedDiagnostics = useSyncExternalStore(
        subscribeTaskSourceDiagnostics,
        getTaskSourceDiagnosticState,
        getTaskSourceDiagnosticState,
    );
    const desktopRuntime = isDesktopRuntime();

    const filteredTasks = React.useMemo(
        () => tasks.filter((task) => matchesFilterType(task, filterTypes)),
        [filterTypes, tasks],
    );

    const summary = React.useMemo(() => {
        const counts = {
            pending: 0,
            running: 0,
            paused: 0,
        };

        for (const task of filteredTasks) {
            if (task.status === 'pending') counts.pending += 1;
            else if (task.status === 'running') counts.running += 1;
            else if (task.status === 'paused') counts.paused += 1;
        }

        return counts;
    }, [filteredTasks]);

    const executionSummary = React.useMemo(() => {
        const activeModes = Object.values(runtimeExecutionScopes).filter(
            (mode): mode is ExecutionMode => mode === 'task_submission' || mode === 'direct_result',
        );

        return {
            taskSubmission: activeModes.filter((mode) => mode === 'task_submission').length,
            directResult: activeModes.filter((mode) => mode === 'direct_result').length,
        };
    }, [runtimeExecutionScopes]);

    const executionBadges = React.useMemo(() => {
        return [
            executionSummary.taskSubmission > 0
                ? {
                    key: 'task_submission',
                    count: executionSummary.taskSubmission,
                    ...getExecutionModeDisplay('task_submission'),
                }
                : null,
            executionSummary.directResult > 0
                ? {
                    key: 'direct_result',
                    count: executionSummary.directResult,
                    ...getExecutionModeDisplay('direct_result'),
                }
                : null,
        ].filter((item): item is NonNullable<typeof item> => item !== null);
    }, [executionSummary.directResult, executionSummary.taskSubmission]);

    return {
        connected,
        desktopRuntime,
        executionBadges,
        executionSummary,
        filteredTasks,
        summary,
        taskFeedDiagnostics,
        taskOwnerMode,
        remoteTasksReady,
    };
};
