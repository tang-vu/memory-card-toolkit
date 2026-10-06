// Each selection and each read has its own identity, even when the device is the same.
export function createDeviceInfoRequests(onChange) {
    let activeOwner = null;
    let activeRequest = null;

    const isCurrent = (request) => request !== null &&
        request === activeRequest && request.owner === activeOwner;

    return {
        activate(owner) {
            activeOwner = owner;
            activeRequest = null;
        },
        deactivate(owner) {
            if (activeOwner === owner) {
                activeOwner = null;
                activeRequest = null;
            }
        },
        begin(owner, device) {
            // Delayed callbacks may still hold a previous selection's owner.
            if (activeOwner !== owner || !device || owner.device !== device) return null;
            const request = { owner };
            activeRequest = request;
            onChange({ owner, status: 'loading', info: null });
            return request;
        },
        complete(request, info) {
            if (isCurrent(request)) {
                // The existing read APIs return null when metadata is unavailable.
                const hasInfo = info !== null && info !== undefined;
                onChange({ owner: request.owner, status: hasInfo ? 'ready' : 'error', info: hasInfo ? info : null });
            }
        },
        fail(request) {
            if (isCurrent(request)) {
                onChange({ owner: request.owner, status: 'error', info: null });
            }
        },
    };
}

export function getDeviceInfoTarget(device) {
    if (device?.driveLetter) {
        return typeof device.driveLetter === 'string' && /^[A-Z]:$/i.test(device.driveLetter)
            ? { method: 'getInfo', value: device.driveLetter }
            : null;
    }
    return Number.isInteger(device?.diskNumber) && device.diskNumber >= 0
        ? { method: 'getPhysicalInfo', value: device.diskNumber }
        : null;
}
