function displayVerificationResults(results) {
    const contentDiv = document.getElementById('verificationContent');
    
    if (!results || results.length === 0) {
        contentDiv.innerHTML = '<div class="alert alert-success">No pricing errors detected.</div>';
        return;
    }

    let html = `
        <div class="alert alert-warning">
            <strong>Price Analysis Complete:</strong> Found ${results.length} assets with pricing issues.
        </div>
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Asset ID</th>
                        <th>Error Type</th>
                        <th>Severity</th>
                        <th>Start Price</th>
                        <th>End Price</th>
                        <th>Root Cause</th>
                    </tr>
                </thead>
                <tbody>`;

    results.forEach(result => {
        result.errors.forEach(error => {
            const rootCause = getRootCause(error.type);
            const severityClass = error.severity === 'high' ? 'danger' : 'warning';
            
            html += `
                <tr>
                    <td>${result.asset_id}</td>
                    <td>${formatErrorType(error.type)}</td>
                    <td><span class="badge badge-${severityClass}">${error.severity.toUpperCase()}</span></td>
                    <td>${result.start_price || 'N/A'}</td>
                    <td>${result.end_price || 'N/A'}</td>
                    <td>${rootCause}</td>
                </tr>`;
        });
    });

    html += `
                </tbody>
            </table>
        </div>`;

    contentDiv.innerHTML = html;
}

function formatErrorType(type) {
    const types = {
        'missing_start_price': 'Missing Start Price',
        'missing_end_price': 'Missing End Price',
        'invalid_start_price': 'Invalid Start Price',
        'invalid_end_price': 'Invalid End Price',
        'extreme_price_change': 'Extreme Price Change',
        'invalid_time_sequence': 'Invalid Time Sequence'
    };
    return types[type] || type;
}

function getRootCause(errorType) {
    const causes = {
        'missing_start_price': 'API failure during session start',
        'missing_end_price': 'API failure during price updates',
        'invalid_start_price': 'Data source returned invalid value',
        'invalid_end_price': 'Data source returned invalid value',
        'extreme_price_change': 'Market volatility or data error',
        'invalid_time_sequence': 'System clock synchronization issue'
    };
    return causes[errorType] || 'Unknown cause';
}