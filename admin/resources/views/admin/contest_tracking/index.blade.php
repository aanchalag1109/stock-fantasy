@extends('layouts.admin')

@section('title', 'Contest Tracking')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title">Contest Tracking</h3>
                    <button class="btn btn-primary" onclick="refreshLiveContests()">
                        <i class="fas fa-sync"></i> Refresh Live Contests
                    </button>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-bordered table-striped">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Session</th>
                                    <th>Category</th>
                                    <th>Prize Pool</th>
                                    <th>Status</th>
                                    <th>Start Time</th>
                                    <th>End Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($contests as $contest)
                                <tr>
                                    <td>{{ $contest->id }}</td>
                                    <td>{{ $contest->session_name }}</td>
                                    <td>
                                        <span class="badge badge-info">{{ $contest->category }}</span>
                                    </td>
                                    <td>₹{{ number_format($contest->prize_pool) }}</td>
                                    <td>
                                        @if($contest->status == 'upcoming')
                                            <span class="badge badge-warning">Upcoming</span>
                                        @elseif($contest->status == 'live')
                                            <span class="badge badge-success">Live</span>
                                        @else
                                            <span class="badge badge-secondary">Completed</span>
                                        @endif
                                    </td>
                                    <td>{{ \Carbon\Carbon::parse($contest->start_time)->format('M d, Y H:i') }}</td>
                                    <td>{{ \Carbon\Carbon::parse($contest->end_time)->format('M d, Y H:i') }}</td>
                                    <td>
                                        <div class="btn-group" role="group">
                                            <a href="{{ route('admin.contest-tracking.show', $contest->id) }}" 
                                               class="btn btn-sm btn-info">
                                                <i class="fas fa-eye"></i> View
                                            </a>
                                            
                                            @if($contest->status == 'upcoming')
                                                <button class="btn btn-sm btn-success" 
                                                        onclick="startContest({{ $contest->id }})">
                                                    <i class="fas fa-play"></i> Start
                                                </button>
                                            @endif
                                            
                                            @if($contest->status == 'live')
                                                <button class="btn btn-sm btn-danger" 
                                                        onclick="endContest({{ $contest->id }})">
                                                    <i class="fas fa-stop"></i> End
                                                </button>
                                            @endif
                                        </div>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    
                    {{ $contests->links() }}
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function startContest(contestId) {
    if (confirm('Are you sure you want to start this contest? This will save current prices as starting prices.')) {
        fetch(`/admin/contest-tracking/${contestId}/start`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Contest started successfully!');
                location.reload();
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(error => {
            alert('Error starting contest: ' + error.message);
        });
    }
}

function endContest(contestId) {
    if (confirm('Are you sure you want to end this contest? This will calculate final results.')) {
        fetch(`/admin/contest-tracking/${contestId}/end`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Contest ended successfully!');
                location.reload();
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(error => {
            alert('Error ending contest: ' + error.message);
        });
    }
}

function refreshLiveContests() {
    fetch('/admin/api/live-contests')
        .then(response => response.json())
        .then(data => {
            console.log('Live contests:', data.contests);
            location.reload();
        })
        .catch(error => {
            console.error('Error fetching live contests:', error);
        });
}
</script>
@endsection