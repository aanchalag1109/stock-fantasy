@extends('admin.layouts.app')

@section('title', 'Session Contests')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Session Contests</h3>
                    <a href="{{ route('admin.live-management') }}" class="btn btn-secondary btn-sm float-right">
                        <i class="fas fa-arrow-left"></i> Back to Live Management
                    </a>
                </div>
                <div class="card-body" id="contestsContent">
                    <div class="text-center">
                        <i class="fas fa-spinner fa-spin fa-2x"></i>
                        <p>Loading contests...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script>
$(document).ready(function() {
    loadSessionContests();
});

function loadSessionContests() {
    $.ajax({
        url: `{{ url('/api/session-contests') }}/{{ $sessionId }}`,
        method: 'GET',
        success: function(response) {
            displayContests(response);
        },
        error: function() {
            $('#contestsContent').html(`
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Failed to load session contests
                </div>
            `);
        }
    });
}

function displayContests(response) {
    let html = `
        <div class="row mb-4">
            <div class="col-md-6">
                <h5>Session Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Name:</strong></td><td>${response.session.name}</td></tr>
                    <tr><td><strong>Market Type:</strong></td><td>${response.session.market_type}</td></tr>
                    <tr><td><strong>Status:</strong></td><td><span class="badge badge-${getStatusBadge(response.session.status)}">${response.session.status}</span></td></tr>
                    <tr><td><strong>Max Stocks:</strong></td><td>${response.session.max_stocks}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h5>Statistics</h5>
                <table class="table table-sm">
                    <tr><td><strong>Total Contests:</strong></td><td>${response.contests.length}</td></tr>
                    <tr><td><strong>Total Participants:</strong></td><td>${response.total_participants}</td></tr>
                    <tr><td><strong>Total Prize Pool:</strong></td><td>₹${response.total_prize_pool}</td></tr>
                </table>
            </div>
        </div>
        <hr>
        <h5>Contests</h5>
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Category</th>
                        <th>Entry Fee</th>
                        <th>Participants</th>
                        <th>Prize Pool</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    response.contests.forEach(contest => {
        html += `
            <tr>
                <td>${contest.id}</td>
                <td>${contest.category}</td>
                <td>₹${contest.entry_fee}</td>
                <td>${contest.joined_count || 0}</td>
                <td>₹${contest.prize_pool}</td>
                <td><span class="badge badge-${getStatusBadge(contest.status)}">${contest.status}</span></td>
                <td>
                    <a href="{{ url('/admin/live-contest-detail') }}/${contest.id}" class="btn btn-sm btn-success" target="_blank">
                        <i class="fas fa-external-link-alt"></i> View Detail
                    </a>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    $('#contestsContent').html(html);
}

function getStatusBadge(status) {
    switch(status) {
        case 'live': return 'success';
        case 'upcoming': return 'warning';
        case 'completed': return 'secondary';
        default: return 'light';
    }
}
</script>
@endsection