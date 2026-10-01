@extends('layouts.admin')

@section('title', 'Contest Details')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Contest Details - {{ $contest->category }}</h3>
                    <div class="card-tools">
                        <a href="{{ route('admin.contest-tracking.index') }}" class="btn btn-secondary">
                            <i class="fas fa-arrow-left"></i> Back
                        </a>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <table class="table table-bordered">
                                <tr>
                                    <th>Contest ID</th>
                                    <td>{{ $contest->id }}</td>
                                </tr>
                                <tr>
                                    <th>Session</th>
                                    <td>{{ $contest->session_name }}</td>
                                </tr>
                                <tr>
                                    <th>Category</th>
                                    <td>{{ $contest->category }}</td>
                                </tr>
                                <tr>
                                    <th>Prize Pool</th>
                                    <td>₹{{ number_format($contest->prize_pool) }}</td>
                                </tr>
                                <tr>
                                    <th>Status</th>
                                    <td>
                                        @if($contest->status == 'upcoming')
                                            <span class="badge badge-warning">Upcoming</span>
                                        @elseif($contest->status == 'live')
                                            <span class="badge badge-success">Live</span>
                                        @else
                                            <span class="badge badge-secondary">Completed</span>
                                        @endif
                                    </td>
                                </tr>
                                <tr>
                                    <th>Participants</th>
                                    <td>{{ count($participants) }}</td>
                                </tr>
                            </table>
                        </div>
                        <div class="col-md-6">
                            <div class="btn-group-vertical w-100">
                                @if($contest->status == 'upcoming')
                                    <button class="btn btn-success mb-2" onclick="startContest({{ $contest->id }})">
                                        <i class="fas fa-play"></i> Start Contest
                                    </button>
                                @endif
                                
                                @if($contest->status == 'live')
                                    <button class="btn btn-danger mb-2" onclick="endContest({{ $contest->id }})">
                                        <i class="fas fa-stop"></i> End Contest
                                    </button>
                                @endif
                                
                                <button class="btn btn-info mb-2" onclick="refreshPrices()">
                                    <i class="fas fa-sync"></i> Refresh Prices
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Start Prices -->
    @if(count($startPrices) > 0)
    <div class="row mt-4">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h4>Starting Prices</h4>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Start Price</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($startPrices as $price)
                                <tr>
                                    <td>{{ $price->symbol }}</td>
                                    <td>₹{{ number_format($price->start_price, 4) }}</td>
                                    <td>{{ \Carbon\Carbon::parse($price->timestamp)->format('M d, Y H:i:s') }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    @endif

    <!-- End Prices -->
    @if(count($endPrices) > 0)
    <div class="row mt-4">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h4>Ending Prices</h4>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>End Price</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($endPrices as $price)
                                <tr>
                                    <td>{{ $price->symbol }}</td>
                                    <td>₹{{ number_format($price->end_price, 4) }}</td>
                                    <td>{{ \Carbon\Carbon::parse($price->timestamp)->format('M d, Y H:i:s') }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    @endif

    <!-- Results -->
    @if(count($results) > 0)
    <div class="row mt-4">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h4>Contest Results</h4>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>User</th>
                                    <th>Mobile</th>
                                    <th>Total Score</th>
                                    <th>Prize Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($results as $result)
                                <tr>
                                    <td>
                                        @if($result->rank == 1)
                                            <span class="badge badge-warning">#{{ $result->rank }}</span>
                                        @elseif($result->rank <= 3)
                                            <span class="badge badge-info">#{{ $result->rank }}</span>
                                        @else
                                            <span class="badge badge-secondary">#{{ $result->rank }}</span>
                                        @endif
                                    </td>
                                    <td>{{ $result->user_name }}</td>
                                    <td>{{ $result->user_mobile }}</td>
                                    <td>{{ number_format($result->total_score, 2) }}%</td>
                                    <td>₹{{ number_format($result->prize_amount, 2) }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    @endif

    <!-- Participants -->
    <div class="row mt-4">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h4>Participants ({{ count($participants) }})</h4>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Mobile</th>
                                    <th>Assets</th>
                                    <th>Joined At</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($participants as $participant)
                                <tr>
                                    <td>{{ $participant->user_name }}</td>
                                    <td>{{ $participant->user_mobile }}</td>
                                    <td>
                                        @php
                                            $assets = json_decode($participant->assets, true) ?? [];
                                        @endphp
                                        {{ count($assets) }} assets
                                    </td>
                                    <td>{{ \Carbon\Carbon::parse($participant->created_at)->format('M d, Y H:i') }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function startContest(contestId) {
    if (confirm('Start this contest and save current prices?')) {
        fetch(`/admin/contest-tracking/${contestId}/start`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
            }
        })
        .then(response => {
            if (response.ok) {
                alert('Contest started successfully!');
                location.reload();
            } else {
                alert('Error starting contest');
            }
        });
    }
}

function endContest(contestId) {
    if (confirm('End this contest and calculate results?')) {
        fetch(`/admin/contest-tracking/${contestId}/end`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
            }
        })
        .then(response => {
            if (response.ok) {
                alert('Contest ended successfully!');
                location.reload();
            } else {
                alert('Error ending contest');
            }
        });
    }
}

function refreshPrices() {
    alert('Price refresh functionality will be implemented');
}
</script>
@endsection