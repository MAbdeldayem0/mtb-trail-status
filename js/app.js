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
    const description = document.getElementById(`${trailId}-description`);
    const updated = document.getElementById(`${trailId}-updated`);

    if (statusBadge) {
        statusBadge.className = `status-badge ${getStatusClass(data.status)}`;
        statusBadge.textContent = getStatusText(data.status);
    }

    if (description) {
        description.textContent = data.description || 'No additional information available.';
    }
}

function updateWeatherDisplay(trailId, weather) {
    const weatherDiv = document.getElementById(`${trailId}-weather`);
    const predictionDiv = document.getElementById(`${trailId}-prediction`);

    if (weatherDiv && weather && weather.tomorrow) {
        const t = weather.tomorrow;
        const iconUrl = `https://openweathermap.org/img/wn/${t.icon}@2x.png`;
        weatherDiv.innerHTML = `
            <span class="weather-label">Tomorrow's Weather:</span>
            <img class="weather-icon" src="${iconUrl}" alt="${t.description}">
            <span class="weather-temp">${t.tempLow}°-${t.tempHigh}°F</span>
            <span class="weather-desc">${t.description}</span>
            <span class="weather-details">${t.humidity}% humidity • ${t.wind_speed} mph wind</span>
        `;
    } else if (weatherDiv) {
        weatherDiv.innerHTML = '';
    }

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
            updateWeatherDisplay(trailId, trail.weather);
        }
    });

    updateLastUpdated(data.lastUpdated);
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    refreshStatuses();
});
