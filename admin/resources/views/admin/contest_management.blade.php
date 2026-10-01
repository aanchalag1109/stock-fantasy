<!DOCTYPE html>
<html>
<head>
    <title>Contest Management</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .contest-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .status { padding: 5px 10px; border-radius: 3px; color: white; font-size: 12px; }
        .upcoming { background: #007bff; }
        .live { background: #28a745; }
        .completed { background: #6c757d; }
        .btn { padding: 8px 15px; margin: 5px; border: none; border-radius: 3px; cursor: pointer; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-secondary { background: #6c757d; color: white; }
        .form-group { margin: 10px 0; }
        .form-control { width: 200px; padding: 5px; }
    </style>
</head>
<body>
    <h1>Contest Management</h1>
    
    <div id="contests"></div>

    <script>
        async function loadContests() {
            try {
                const response = await fetch('/api/contests');
                const data = await response.json();
                
                const container = document.getElementById('contests');
                container.innerHTML = '';
                
                data.contests.forEach(contest => {
                    const card = document.createElement('div');
                    card.className = 'contest-card';
                    card.innerHTML = `
                        <h3>Contest #${contest.id} - ${contest.category || 'Contest'}</h3>
                        <p><strong>Status:</strong> <span class="status ${contest.status}">${contest.status.toUpperCase()}</span></p>
                        <p><strong>Prize Pool:</strong> ₹${contest.prize_pool}</p>
                        <p><strong>Entry Fee:</strong> ₹${contest.entry_fee}</p>
                        <p><strong>Participants:</strong> ${contest.joined_count}/${contest.participants}</p>
                        <p><strong>Start Time:</strong> ${contest.start_time || 'Not set'}</p>
                        <p><strong>End Time:</strong> ${contest.end_time || 'Not set'}</p>
                        
                        <div class="form-group">
                            <label>Status:</label>
                            <select id="status-${contest.id}" class="form-control">
                                <option value="upcoming" ${contest.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
                                <option value="live" ${contest.status === 'live' ? 'selected' : ''}>Live</option>
                                <option value="completed" ${contest.status === 'completed' ? 'selected' : ''}>Completed</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Start Time:</label>
                            <input type="datetime-local" id="start-${contest.id}" class="form-control" value="${formatDateTime(contest.start_time)}">
                        </div>
                        
                        <div class="form-group">
                            <label>End Time:</label>
                            <input type="datetime-local" id="end-${contest.id}" class="form-control" value="${formatDateTime(contest.end_time)}">
                        </div>
                        
                        <button class="btn btn-primary" onclick="updateContest(${contest.id})">Update Contest</button>
                        <button class="btn btn-success" onclick="viewLeaderboard(${contest.id})">View Leaderboard</button>
                    `;
                    container.appendChild(card);
                });
            } catch (error) {
                console.error('Error loading contests:', error);
            }
        }

        function formatDateTime(dateTime) {
            if (!dateTime) return '';
            return new Date(dateTime).toISOString().slice(0, 16);
        }

        async function updateContest(contestId) {
            const status = document.getElementById(`status-${contestId}`).value;
            const startTime = document.getElementById(`start-${contestId}`).value;
            const endTime = document.getElementById(`end-${contestId}`).value;
            
            try {
                const response = await fetch(`/api/contests/${contestId}/status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        status: status,
                        start_time: startTime || null,
                        end_time: endTime || null
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Contest updated successfully!');
                    loadContests();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error updating contest: ' + error.message);
            }
        }

        async function viewLeaderboard(contestId) {
            try {
                const response = await fetch(`/api/contests/${contestId}/leaderboard`);
                const data = await response.json();
                
                if (data.success) {
                    let leaderboardHtml = `<h3>Contest #${contestId} Leaderboard</h3><ol>`;
                    data.leaderboard.forEach(participant => {
                        leaderboardHtml += `<li>${participant.user_name} - Score: ${participant.total_score}</li>`;
                    });
                    leaderboardHtml += '</ol>';
                    
                    const newWindow = window.open('', '_blank');
                    newWindow.document.write(leaderboardHtml);
                } else {
                    alert('Error loading leaderboard: ' + data.error);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }

        // Load contests on page load
        loadContests();
        
        // Refresh every 30 seconds
        setInterval(loadContests, 30000);
    </script>
</body>
</html>