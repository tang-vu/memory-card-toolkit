import React, { useState, useEffect, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import DeviceDetails from './components/DeviceDetails';
import FormatModal from './components/FormatModal';
import ExtendModal from './components/ExtendModal';
import ShrinkModal from './components/ShrinkModal';
import DeletePartitionModal from './components/DeletePartitionModal';
import { devicePresets } from './data/presets';
import useDeviceInfo from './hooks/useDeviceInfo';

function App() {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [selectedPreset, setSelectedPreset] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [modalState, setModalState] = useState({ type: null, isOpen: false, data: null });
    const {
        deviceInfo,
        deviceInfoStatus,
        fetchDeviceInfo,
        beginDeviceInfoRead,
        completeDeviceInfoRead,
        failDeviceInfoRead,
    } = useDeviceInfo(selectedDevice);
    const [showAllDisks, setShowAllDisks] = useState(true); // Show all disks by default

    // Fetch devices (all or removable only)
    const fetchDevices = useCallback(async () => {
        setIsLoading(true);
        try {
            if (window.electronAPI) {
                // Always fetch all disks including internal
                const disks = await window.electronAPI.disk.getAllIncludingInternal();
                setDevices(disks);
            } else {
                // Mock data for development in browser
                setDevices([
                    {
                        driveLetter: 'E:',
                        label: 'SD Card',
                        size: 32,
                        freeSpace: 15.5,
                        fileSystem: 'FAT32',
                        isRemovable: true,
                        hasLetter: true,
                        diskNumber: 1,
                    },
                    {
                        driveLetter: null,
                        label: 'Generic USB Flash Disk',
                        size: 16,
                        freeSpace: 0,
                        fileSystem: 'RAW',
                        isRemovable: true,
                        hasLetter: false,
                        diskNumber: 2,
                        status: 'Online',
                        partitions: [
                            { number: 1, size: 16, type: 'Basic', driveLetter: null }
                        ],
                    },
                ]);
            }
        } catch (error) {
            console.error('Error fetching devices:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    // Handle device selection
    const handleDeviceSelect = (device) => {
        setSelectedDevice(device);
        setSelectedPreset(null);
    };

    // Handle preset selection
    const handlePresetSelect = (preset) => {
        setSelectedPreset(preset);
    };

    // Open format modal
    const openFormatModal = () => {
        setModalState({ type: 'format', isOpen: true, data: null });
    };

    // Open partition modal (placeholder)
    const openPartitionModal = () => {
        setModalState({ type: 'partition', isOpen: true, data: null });
    };

    // Open assign letter dialog
    const openAssignLetterModal = async () => {
        try {
            let availableLetters = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
            if (window.electronAPI) {
                availableLetters = await window.electronAPI.disk.getAvailableLetters();
            }
            setModalState({
                type: 'assignLetter',
                isOpen: true,
                data: { availableLetters }
            });
        } catch (error) {
            console.error('Error getting available letters:', error);
        }
    };

    // Open initialize disk dialog
    const openInitializeModal = () => {
        setModalState({ type: 'initialize', isOpen: true, data: null });
    };

    // Open extend modal
    const openExtendModal = () => {
        setModalState({ type: 'extend', isOpen: true, data: null });
    };

    // Open shrink modal
    const openShrinkModal = () => {
        setModalState({ type: 'shrink', isOpen: true, data: null });
    };

    // Open delete partition modal
    const openDeleteModal = (partition) => {
        setModalState({ type: 'delete', isOpen: true, data: partition });
    };

    // Close modal
    const closeModal = () => {
        setModalState({ type: null, isOpen: false, data: null });
    };

    // Handle format completion
    const handleFormatComplete = async () => {
        closeModal();
        await fetchDevices();
        if (selectedDevice) {
            await fetchDeviceInfo(selectedDevice);
        }
    };

    // Handle assign letter
    const handleAssignLetter = async (letter) => {
        if (!selectedDevice || !window.electronAPI) return;

        let deviceInfoRequest = null;
        try {
            const partition = selectedDevice.partitions?.[0];
            if (partition) {
                await window.electronAPI.disk.assignLetter({
                    diskNumber: selectedDevice.diskNumber,
                    partitionNumber: partition.number,
                    driveLetter: letter,
                });
                closeModal();

                // Refresh devices list
                const disks = await window.electronAPI.disk.getAll();
                setDevices(disks);

                // Find and select the updated device with new letter
                const updatedDevice = disks.find(d => d.diskNumber === selectedDevice.diskNumber);
                if (updatedDevice) {
                    setSelectedDevice(updatedDevice);
                    // Also fetch updated info
                    if (updatedDevice.driveLetter) {
                        // The selection effect owns new objects after they commit.
                        deviceInfoRequest = beginDeviceInfoRead(updatedDevice);
                        const info = await window.electronAPI.disk.getInfo(updatedDevice.driveLetter);
                        completeDeviceInfoRead(deviceInfoRequest, info);
                    }
                }

                alert(`Drive letter ${letter}: assigned successfully!`);
            }
        } catch (error) {
            failDeviceInfoRead(deviceInfoRequest);
            console.error('Error assigning letter:', error);
            alert(`Failed to assign letter: ${error.message}`);
        }
    };

    // Handle initialize disk
    const handleInitialize = async (style) => {
        if (!selectedDevice || !window.electronAPI) return;

        try {
            await window.electronAPI.disk.initialize({
                diskNumber: selectedDevice.diskNumber,
                partitionStyle: style,
            });
            closeModal();
            await fetchDevices();
        } catch (error) {
            console.error('Error initializing disk:', error);
            alert(`Failed to initialize: ${error.message}`);
        }
    };

    // Apply preset
    const applyPreset = () => {
        if (selectedDevice && selectedPreset) {
            setModalState({ type: 'format', isOpen: true, data: null });
        }
    };

    return (
        <div className="app">
            <TitleBar />

            <div className="main-content">
                <Sidebar
                    devices={devices}
                    presets={devicePresets}
                    selectedDevice={selectedDevice}
                    selectedPreset={selectedPreset}
                    isLoading={isLoading}
                    onDeviceSelect={handleDeviceSelect}
                    onPresetSelect={handlePresetSelect}
                    onRefresh={fetchDevices}
                    onDeletePartition={openDeleteModal}
                />

                <DeviceDetails
                    device={selectedDevice}
                    deviceInfo={deviceInfo}
                    deviceInfoStatus={deviceInfoStatus}
                    onRetryDeviceInfo={() => fetchDeviceInfo(selectedDevice)}
                    selectedPreset={selectedPreset}
                    onFormat={openFormatModal}
                    onPartition={openPartitionModal}
                    onApplyPreset={applyPreset}
                    onAssignLetter={openAssignLetterModal}
                    onInitialize={openInitializeModal}
                    onExtend={openExtendModal}
                    onShrink={openShrinkModal}
                />
            </div>

            {/* Format Modal */}
            {modalState.isOpen && modalState.type === 'format' && (
                <FormatModal
                    device={selectedDevice}
                    preset={selectedPreset}
                    onClose={closeModal}
                    onComplete={handleFormatComplete}
                />
            )}

            {/* Extend Modal */}
            <ExtendModal
                isOpen={modalState.isOpen && modalState.type === 'extend'}
                device={selectedDevice}
                onClose={closeModal}
                onExtend={handleFormatComplete}
            />

            {/* Shrink Modal */}
            <ShrinkModal
                isOpen={modalState.isOpen && modalState.type === 'shrink'}
                device={selectedDevice}
                onClose={closeModal}
                onShrink={handleFormatComplete}
            />

            {/* Assign Letter Modal */}
            {modalState.isOpen && modalState.type === 'assignLetter' && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h2 className="modal__title">Assign Drive Letter</h2>
                            <button className="modal__close" onClick={closeModal}>×</button>
                        </div>
                        <div className="modal__content">
                            <p>Select a drive letter to assign to this disk:</p>
                            <div className="letter-grid">
                                {(modalState.data?.availableLetters || []).map(letter => (
                                    <button
                                        key={letter}
                                        className="letter-btn"
                                        onClick={() => handleAssignLetter(letter)}
                                    >
                                        {letter}:
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Initialize Disk Modal */}
            {modalState.isOpen && modalState.type === 'initialize' && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h2 className="modal__title">Initialize Disk</h2>
                            <button className="modal__close" onClick={closeModal}>×</button>
                        </div>
                        <div className="modal__content">
                            <p>Select partition style:</p>
                            <div className="init-options">
                                <button
                                    className="init-option"
                                    onClick={() => handleInitialize('MBR')}
                                >
                                    <strong>MBR</strong>
                                    <span>Master Boot Record</span>
                                    <span className="init-option__desc">Better compatibility with older systems</span>
                                </button>
                                <button
                                    className="init-option"
                                    onClick={() => handleInitialize('GPT')}
                                >
                                    <strong>GPT</strong>
                                    <span>GUID Partition Table</span>
                                    <span className="init-option__desc">Modern standard, supports larger disks</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Partition Modal */}
            <DeletePartitionModal
                isOpen={modalState.isOpen && modalState.type === 'delete'}
                onClose={closeModal}
                partition={modalState.data}
                onDelete={async () => {
                    closeModal();
                    await fetchDevices();
                }}
            />
        </div>
    );
}

export default App;
