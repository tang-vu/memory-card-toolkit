import React from 'react';
import { Icons } from './Icons';

function DeviceDetails({
    device,
    deviceInfo,
    deviceInfoStatus,
    onRetryDeviceInfo,
    selectedPreset,
    onFormat,
    onPartition,
    onApplyPreset,
    onAssignLetter,
    onInitialize,
    onExtend,
    onShrink,
}) {
    if (!device) {
        return (
            <main className="content-panel content-panel--empty">
                <div className="empty-state">
                    <Icons.MemoryCard />
                    <h2 className="empty-state__title">No Device Selected</h2>
                    <p className="empty-state__desc">
                        Select a removable device from the sidebar to view details and perform actions.
                    </p>
                </div>
            </main>
        );
    }

    const info = deviceInfo || device;
    const hasLetter = device.hasLetter !== false && device.driveLetter;
    const usedPercentage = info.size > 0 && info.freeSpace
        ? Math.round(((info.size - info.freeSpace) / info.size) * 100)
        : 0;

    return (
        <main className="content-panel">
            <div className="device-details">
                {/* Header */}
                <header className="device-header">
                    <div className="device-header__icon">
                        <Icons.MemoryCard />
                    </div>
                    <div className="device-header__info">
                        <h1 className="device-header__name">
                            {info.label || 'USB Disk'}
                        </h1>
                        <p className="device-header__path">
                            {device.driveLetter || `Disk ${device.diskNumber}`}
                        </p>
                        <div className="device-header__status">
                            <span className={`device-header__status-dot ${!hasLetter ? 'device-header__status-dot--warning' : ''}`} />
                            {hasLetter ? (info.driveType || 'Removable Disk') : 'No Drive Letter Assigned'}
                        </div>
                    </div>
                </header>

                {deviceInfoStatus === 'loading' && (
                    <p role="status">Loading device details. Showing the selected device summary.</p>
                )}
                {deviceInfoStatus === 'error' && (
                    <div role="status">
                        <p>Device details unavailable. Showing the selected device summary.</p>
                        <button className="btn" onClick={onRetryDeviceInfo}>Retry details</button>
                    </div>
                )}

                {/* No Letter Warning */}
                {!hasLetter && (
                    <div className="warning-box warning-box--warning">
                        <div className="warning-box__icon">
                            <Icons.AlertTriangle />
                        </div>
                        <div className="warning-box__content">
                            <div className="warning-box__title">Drive Letter Not Assigned</div>
                            <div className="warning-box__text">
                                This disk doesn't have a drive letter. You can assign one to access files,
                                or format/initialize the disk to fix issues.
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-card__label">Total Capacity</div>
                        <div className="stat-card__value">
                            {info.size}
                            <span className="stat-card__unit">GB</span>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card__label">
                            {hasLetter ? 'Free Space' : 'Status'}
                        </div>
                        <div className="stat-card__value">
                            {hasLetter ? (
                                <>
                                    {info.freeSpace}
                                    <span className="stat-card__unit">GB</span>
                                </>
                            ) : (
                                <span style={{ fontSize: '1rem' }}>{info.status || 'Available'}</span>
                            )}
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card__label">
                            {hasLetter ? 'File System' : 'Partition Style'}
                        </div>
                        <div className="stat-card__value">
                            {hasLetter ? info.fileSystem : (info.partitionStyle || 'RAW')}
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card__label">
                            {hasLetter ? 'Storage Used' : 'Disk Number'}
                        </div>
                        <div className="stat-card__value">
                            {hasLetter ? (
                                <>
                                    {usedPercentage}
                                    <span className="stat-card__unit">%</span>
                                </>
                            ) : (
                                <span>#{device.diskNumber}</span>
                            )}
                        </div>
                        {hasLetter && (
                            <div className="storage-bar">
                                <div className="storage-bar__track">
                                    <div
                                        className="storage-bar__fill"
                                        style={{ width: `${usedPercentage}%` }}
                                    />
                                </div>
                                <div className="storage-bar__labels">
                                    <span>{(info.size - info.freeSpace).toFixed(1)} GB used</span>
                                    <span>{info.freeSpace} GB free</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Selected Preset Banner */}
                {selectedPreset && hasLetter && (
                    <div className="warning-box" style={{
                        background: 'rgba(123, 104, 238, 0.1)',
                        borderColor: 'rgba(123, 104, 238, 0.3)'
                    }}>
                        <div className="warning-box__icon" style={{ color: '#7b68ee', fontSize: '24px' }}>
                            ⚙️
                        </div>
                        <div className="warning-box__content">
                            <div className="warning-box__title">
                                Preset Selected: {selectedPreset.name}
                            </div>
                            <div className="warning-box__text">
                                {selectedPreset.notes}
                                <br />
                                <strong>File System:</strong> {selectedPreset.fileSystem} | <strong>Label:</strong> {selectedPreset.label}
                            </div>
                        </div>
                        <button className="btn btn--primary" onClick={onApplyPreset}>
                            Apply Preset
                        </button>
                    </div>
                )}

                {/* Actions for disks WITH drive letter */}
                {hasLetter ? (
                    <div className="actions-grid">
                        <button className="action-card" onClick={onFormat}>
                            <div className="action-card__icon">
                                <Icons.Format />
                            </div>
                            <div className="action-card__title">Format</div>
                            <div className="action-card__desc">
                                Erase and format with a new file system
                            </div>
                        </button>

                        <button className="action-card" onClick={onPartition}>
                            <div className="action-card__icon">
                                <Icons.Partition />
                            </div>
                            <div className="action-card__title">Partition</div>
                            <div className="action-card__desc">
                                Create, resize, or delete partitions
                            </div>
                        </button>

                        <button className="action-card" onClick={onExtend}>
                            <div className="action-card__icon">
                                <Icons.Expand />
                            </div>
                            <div className="action-card__title">Extend</div>
                            <div className="action-card__desc">
                                Extend volume into unallocated space
                            </div>
                        </button>

                        <button className="action-card" onClick={onShrink}>
                            <div className="action-card__icon">
                                <Icons.Shrink />
                            </div>
                            <div className="action-card__title">Shrink</div>
                            <div className="action-card__desc">
                                Shrink volume to create free space
                            </div>
                        </button>
                    </div>
                ) : (
                    /* Actions for disks WITHOUT drive letter */
                    <div className="actions-grid">
                        <button className="action-card action-card--primary" onClick={onAssignLetter}>
                            <div className="action-card__icon">
                                <Icons.UsbDrive />
                            </div>
                            <div className="action-card__title">Assign Letter</div>
                            <div className="action-card__desc">
                                Assign a drive letter to access files
                            </div>
                        </button>

                        <button className="action-card" onClick={onFormat}>
                            <div className="action-card__icon">
                                <Icons.Format />
                            </div>
                            <div className="action-card__title">Format Disk</div>
                            <div className="action-card__desc">
                                Clean and format the entire disk
                            </div>
                        </button>

                        <button className="action-card" onClick={onInitialize}>
                            <div className="action-card__icon">
                                <Icons.Partition />
                            </div>
                            <div className="action-card__title">Initialize</div>
                            <div className="action-card__desc">
                                Initialize disk as MBR or GPT
                            </div>
                        </button>

                        <button className="action-card" onClick={onPartition}>
                            <div className="action-card__icon">
                                <Icons.Settings />
                            </div>
                            <div className="action-card__title">Manage</div>
                            <div className="action-card__desc">
                                View and manage disk partitions
                            </div>
                        </button>
                    </div>
                )}

                {/* Protection Warning */}
                {info.isProtected && (
                    <div className="warning-box warning-box--danger">
                        <div className="warning-box__icon">
                            <Icons.AlertTriangle />
                        </div>
                        <div className="warning-box__content">
                            <div className="warning-box__title">Protected Drive</div>
                            <div className="warning-box__text">
                                This drive is protected and cannot be formatted or modified.
                            </div>
                        </div>
                    </div>
                )}

                {/* Partitions List for disks without letter */}
                {!hasLetter && device.partitions && device.partitions.length > 0 && (
                    <div className="partitions-section">
                        <h3 className="partitions-section__title">Partitions</h3>
                        <div className="partitions-list">
                            {device.partitions.map((partition, idx) => (
                                <div key={idx} className="partition-item">
                                    <div className="partition-item__info">
                                        <span className="partition-item__number">#{partition.number}</span>
                                        <span className="partition-item__size">{partition.size} GB</span>
                                        <span className="partition-item__type">{partition.type}</span>
                                        {partition.driveLetter && (
                                            <span className="partition-item__letter">{partition.driveLetter}:</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

export default DeviceDetails;
