import { useState, useMemo, useLayoutEffect, useEffect, useCallback } from 'react';
import { createDeviceInfoRequests, getDeviceInfoTarget } from './deviceInfoRequests';

export default function useDeviceInfo(selectedDevice) {
    const [details, setDetails] = useState(null);
    const [requests] = useState(() => createDeviceInfoRequests(setDetails));
    const owner = useMemo(() => ({ device: selectedDevice }), [selectedDevice]);

    // Invalidate the previous selection before the browser can paint or reads settle.
    useLayoutEffect(() => {
        requests.activate(owner);
        return () => requests.deactivate(owner);
    }, [requests, owner]);

    const beginDeviceInfoRead = useCallback((device) => requests.begin(owner, device), [requests, owner]);

    const fetchDeviceInfo = useCallback(async (device) => {
        const request = beginDeviceInfoRead(device);
        if (!request) return;
        const target = getDeviceInfoTarget(device);
        if (!target) {
            requests.fail(request);
            return;
        }

        try {
            const info = window.electronAPI
                ? await window.electronAPI.disk[target.method](target.value)
                : {
                    ...device,
                    usedSpace: device.size - (device.freeSpace || 0),
                    driveType: 'Removable Disk',
                    diskNumber: device.diskNumber ?? 2,
                    isProtected: false,
                };
            requests.complete(request, info);
        } catch (error) {
            requests.fail(request);
            console.error('Error fetching device info:', error);
        }
    }, [beginDeviceInfoRead, requests]);

    useEffect(() => {
        if (selectedDevice) fetchDeviceInfo(selectedDevice);
    }, [selectedDevice, fetchDeviceInfo]);

    // Effects run after rendering: never expose another selection's metadata meanwhile.
    const current = details?.owner === owner ? details : null;
    return {
        deviceInfo: current?.status === 'ready' ? current.info : null,
        deviceInfoStatus: selectedDevice ? (current?.status || 'loading') : 'idle',
        fetchDeviceInfo,
        beginDeviceInfoRead,
        completeDeviceInfoRead: requests.complete,
        failDeviceInfoRead: requests.fail,
    };
}
