async function fetchAllStatuses() {
    try {
        const response = await fetch('/.netlify/functions/all-statuses');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        return { trails: {}, error: 'Unable to fetch statuses' };
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

    if (statusBadge) {
        statusBadge.className = `status-badge ${getStatusClass(data.status)}`;
        statusBadge.textContent = getStatusText(data.status);
    }
}

function getMapsUrl(address) {
    const encoded = encodeURIComponent(address);
    const ua = navigator.userAgent;

    // iOS - use Apple Maps
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
        return `maps://maps.apple.com/?daddr=${encoded}`;
    }

    // Android - use geo: URI to open default maps app
    if (/Android/.test(ua)) {
        return `geo:0,0?q=${encoded}`;
    }

    // Desktop/other - Google Maps web
    return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

function updateDirectionsDisplay(trailId, trailheads) {
    const directionsDiv = document.getElementById(`${trailId}-directions`);
    if (!directionsDiv) return;

    if (!trailheads || trailheads.length === 0) {
        directionsDiv.innerHTML = '';
        return;
    }

    const links = trailheads.map(th => {
        const mapsUrl = getMapsUrl(th.address);
        const note = th.note ? ` <span class="trailhead-note">(${th.note})</span>` : '';
        return `<a href="${mapsUrl}" target="_blank" rel="noopener" class="directions-link">
            <svg class="directions-icon" viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M21.71 11.29l-9-9a.996.996 0 00-1.41 0l-9 9a.996.996 0 000 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 000-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/>
            </svg>
            ${th.name}${note}
        </a>`;
    }).join('');

    directionsDiv.innerHTML = `
        <span class="directions-label">Directions:</span>
        <div class="directions-links">${links}</div>
    `;
}

function updateWeatherDisplay(trailId, weather) {
    const predictionDiv = document.getElementById(`${trailId}-prediction`);

    if (predictionDiv && weather && weather.prediction) {
        const confidenceClass = weather.confidence || 'low';
        predictionDiv.className = `prediction-info ${confidenceClass}`;
        predictionDiv.innerHTML = `
            <span class="prediction-label">Tomorrow (Prediction):</span>
            <span class="prediction-badge ${weather.prediction}">${getStatusText(weather.prediction)}</span>
            <span class="prediction-reason">${weather.reason || ''}</span>
            <span class="prediction-disclaimer">*Weather-based estimate, not official</span>
        `;
    } else if (predictionDiv) {
        predictionDiv.innerHTML = '';
        predictionDiv.className = 'prediction-info';
    }
}

function updateLastUpdated(isoString) {
    const elements = document.querySelectorAll('.last-updated');
    const timeText = formatTime(isoString);
    elements.forEach(el => { el.textContent = timeText; });
}

async function refreshStatuses() {
    const data = await fetchAllStatuses();
    const trails = data.trails || {};

    // Update each trail card
    ['momba', 'johnbryan', 'caesarcreek', 'troy'].forEach(trailId => {
        const trail = trails[trailId];
        if (trail) {
            updateTrailCard(trailId, trail);
            updateDirectionsDisplay(trailId, trail.trailheads);
            updateWeatherDisplay(trailId, trail.weather);
        }
    });

    updateLastUpdated(data.lastUpdated);
}

// Tab switching
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update button states
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content visibility
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    refreshStatuses();
});
