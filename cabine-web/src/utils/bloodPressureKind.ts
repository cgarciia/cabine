/** HEM-6161T2 readings are stored in the same table and told apart by device name. */
export function isWristMonitor(deviceName: string | null | undefined): boolean {
    return (deviceName ?? '').toLowerCase().replace(/[\s-]/g, '').includes('6161');
}
