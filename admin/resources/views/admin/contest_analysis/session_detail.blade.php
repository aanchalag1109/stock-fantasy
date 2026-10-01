@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>📊 Session: {{ $session->name }}</h2>
        <a href="{{ route('admin.contest-analysis.index') }}" class="btn btn-secondary">← Back</a>
    </div>

    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card">
                <div class="card-body text-center">
                    <h6>Market Type</h6>
                    <h4>{{ $session->market_type }}</h4>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card">
                <div class="card-body text-center">
                    <h6>Status</h6>
                    <h4>
                        @if($session->status == 'live')
                            <span class="badge bg-success">Live</span>
                        @elseif($session->status == 'completed')
                            <span class="badge bg-secondary">Completed</span>
                        @else
                            <span class="badge bg-warning">Upcoming</span>
                        @endif
                    </h4>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card">
                <div class="card-body text-center">
                    <h6>Total Contests</h6>
                    <h4>{{ $contestsData->count() }}</h4>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card">
                <div class="card-body text-center">
                    <h6>Total Winnings</h6>
                    <h4>₹{{ number_format($contestsData->sum('total_winnings'), 2) }}</h4>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-header">
            <h5>Contests in this Session</h5>
        </div>
        <div class="card-body">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Contest ID</th>
                        <th>Category</th>
                        <th>Entry Fee</th>
                        <th>Prize Pool</th>
                        <th>Total Players</th>
                        <th>Total Winnings</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($contestsData as $contest)
                    <tr>
                        <td>{{ $contest['id'] }}</td>
                        <td><span class="badge bg-info">{{ $contest['category'] }}</span></td>
                        <td>₹{{ $contest['entry_fee'] }}</td>
                        <td>₹{{ $contest['prize_pool'] }}</td>
                        <td>{{ $contest['total_players'] }}</td>
                        <td>₹{{ number_format($contest['total_winnings'], 2) }}</td>
                        <td>
                            @if($contest['status'] == 'live')
                                <span class="badge bg-success">Live</span>
                            @elseif($contest['status'] == 'completed')
                                <span class="badge bg-secondary">Completed</span>
                            @else
                                <span class="badge bg-warning">{{ $contest['status'] }}</span>
                            @endif
                        </td>
                        <td>
                            <a href="{{ route('admin.contest-analysis.contest', $contest['id']) }}" class="btn btn-sm btn-primary">
                                Full Analysis
                            </a>
                        </td>
                    </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>
</div>
@endsection
