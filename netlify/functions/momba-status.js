const fetch = require('node-fetch');

const ICAL_URL = 'https://calendar.google.com/calendar/ical/mombastatus%40gmail.com/public/basic.ics';

function parseICalDate(dateStr) {
    // Handle formats like: 20250103 or 20250103T120000Z
    if (!dateStr) return null;

    const cleaned = dateStr.replace(/[^0-9T]/g, '');

    if (cleaned.length >= 8) {
        const year = cleaned.substring(0, 4);
        const month = cleaned.substring(4, 6);
        const day = cleaned.substring(6, 8);

        if (cleaned.length >= 15) {
            const hour = cleaned.substring(9, 11);
            const minute = cleaned.substring(11, 13);
            return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
        }

        return new Date(`${year}-${month}-${day}T00:00:00`);
    }

    return null;
}

function parseICalEvents(icalText) {
    const events = [];
    const eventBlocks = icalText.split('BEGIN:VEVENT');

    for (let i = 1; i < eventBlocks.length; i++) {
        const block = eventBlocks[i].split('END:VEVENT')[0];
        const event = {};

        // Extract SUMMARY
        const summaryMatch = block.match(/SUMMARY:(.+?)(?:\r?\n|\r)/);
        if (summaryMatch) {
            event.summary = summaryMatch[1].trim();
        }

        // Extract DTSTART
        const dtstartMatch = block.match(/DTSTART[^:]*:(\d+T?\d*Z?)/);
        if (dtstartMatch) {
            event.start = parseICalDate(dtstartMatch[1]);
        }

        // Extract DTEND
        const dtendMatch = block.match(/DTEND[^:]*:(\d+T?\d*Z?)/);
        if (dtendMatch) {
            event.end = parseICalDate(dtendMatch[1]);
        }

        // Extract DESCRIPTION (may be multi-line)
        const descMatch = block.match(/DESCRIPTION:(.+?)(?=\r?\n[A-Z]|\r?\nEND)/s);
        if (descMatch) {
            event.description = descMatch[1]
                .replace(/\\n/g, ' ')
                .replace(/\\,/g, ',')
                .replace(/\r?\n /g, '') // Handle line continuations
                .trim();
        }

        if (event.summary && event.start) {
            events.push(event);
        }
    }

    return events;
}

function getTodayEvents(events) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return events.filter(event => {
        if (!event.start) return false;
        const eventDate = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate());
        return eventDate >= today && eventDate < tomorrow;
    });
}

function determineStatus(summary) {
    const lower = summary.toLowerCase();

    if (lower.includes('closed')) {
        return 'closed';
    } else if (lower.includes('open')) {
        return 'open';
    }

    return 'unknown';
}

exports.handler = async function(event, context) {
    try {
        const response = await fetch(ICAL_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch calendar: ${response.status}`);
        }

        const icalText = await response.text();
        const events = parseICalEvents(icalText);
        const todayEvents = getTodayEvents(events);

        if (todayEvents.length === 0) {
            // If no event today, check the most recent event
            const sortedEvents = events
                .filter(e => e.start)
                .sort((a, b) => b.start - a.start);

            const mostRecent = sortedEvents[0];

            if (mostRecent) {
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: determineStatus(mostRecent.summary),
                        description: `Last update: ${mostRecent.summary}${mostRecent.description ? ' - ' + mostRecent.description : ''}`,
                        lastUpdated: new Date().toISOString()
                    })
                };
            }

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'unknown',
                    description: 'No status updates found',
                    lastUpdated: new Date().toISOString()
                })
            };
        }

        // Use the most recent event from today
        const latestToday = todayEvents.sort((a, b) => b.start - a.start)[0];

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: determineStatus(latestToday.summary),
                description: latestToday.description || latestToday.summary,
                lastUpdated: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error fetching MoMBA status:', error);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'error',
                description: 'Unable to fetch trail status',
                lastUpdated: new Date().toISOString()
            })
        };
    }
};
