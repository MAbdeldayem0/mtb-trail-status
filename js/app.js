const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function fetchMombaStatus() {
    try {
        const response = await fetch('/.netlify/functions/momba-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('MoMBA fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

async function fetchJohnBryanStatus() {
    try {
        const response = await fetch('/.netlify/functions/johnbryan-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('John Bryan fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

async function fetchCaesarCreekStatus() {
    try {
        const response = await fetch('/.netlify/functions/caesarcreek-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('Caesar Creek fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

async function fetchTroyStatus() {
    try {
        const response = await fetch('/.netlify/functions/troy-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('Troy fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

function getStatusClass(status) {
    const statusMap = {
        'open': 'open',
        'closed': 'closed',
        'caution': 'caution',
        'wet': 'caution',
        'freeze-thaw': 'freeze-thaw',
        'freeze/thaw': 'freeze-thaw',
        'unknown': 'unknown',
        'error': 'error'
    };
    return statusMap[status.toLowerCase()] || 'unknown';
}

function getStatusText(status) {
    const textMap = {
        'open': 'Open',
        'closed': 'Closed',
        'caution': 'Caution',
        'wet': 'Caution',
        'freeze-thaw': 'Freeze/Thaw',
        'freeze/thaw': 'Freeze/Thaw',
        'unknown': 'Unknown',
        'error': 'Error'
    };
    return textMap[status.toLowerCase()] || status;
}

function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function updateTrailCard(trailId, data) {
    const statusBadge = document.getElementById(`${trailId}-status`);
    const description = document.getElementById(`${trailId}-description`);
    const updated = document.getElementById(`${trailId}-updated`);

    if (statusBadge) {
        statusBadge.className = `status-badge ${getStatusClass(data.status)}`;
        statusBadge.textContent = getStatusText(data.status);
    }

    if (description) {
        description.textContent = data.description || 'No additional information available.';
    }

    if (updated) {
        updated.textContent = formatTime(data.lastUpdated);
    }
}

async function refreshStatuses() {
    const [mombaData, johnBryanData, caesarCreekData, troyData] = await Promise.all([
        fetchMombaStatus(),
        fetchJohnBryanStatus(),
        fetchCaesarCreekStatus(),
        fetchTroyStatus()
    ]);

    updateTrailCard('momba', mombaData);
    updateTrailCard('johnbryan', johnBryanData);
    updateTrailCard('caesarcreek', caesarCreekData);
    updateTrailCard('troy', troyData);
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    refreshStatuses();
    setInterval(refreshStatuses, REFRESH_INTERVAL);
});
