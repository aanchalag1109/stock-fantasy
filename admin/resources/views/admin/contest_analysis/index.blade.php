@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <h2 class="mb-4">📊 Contest Analysis</h2>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-4" role="tablist">
        <li class="nav-item" role="presentation">
            <a class="nav-link active" href="{{ route('admin.contest-analysis.index') }}">
                📅 Sessions
            </a>
        </li>
        <li class="nav-item" role="presentation">
            <a class="nav-link" href="{{ route('admin.contest-analysis.users') }}">
                👥 Users
            </a>
        </li>
    </ul>

    <!-- Filter Card -->
    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" action="{{ route('admin.contest-analysis.index') }}" class="row g-3">
                <div class="col-md-3">
                    <label class="form-label">From Date</label>
                    <input type="date" name="from_date" class="form-control" value="{{ request('from_date') }}">
                </div>
                <div class="col-md-3">
                    <label class="form-label">To Date</label>
                    <input type="date" name="to_date" class="form-control" value="{{ request('to_date') }}">
                </div>
                <div class="col-md-3">
                    <label class="form-label">Status</label>
                    <select name="status" class="form-select">
                        <option value="">All Status</option>
                        <option value="upcoming" {{ request('status') == 'upcoming' ? 'selected' : '' }}>Upcoming</option>
                        <option value="live" {{ request('status') == 'live' ? 'selected' : '' }}>Live</option>
                        <option value="completed" {{ request('status') == 'completed' ? 'selected' : '' }}>Completed</option>
                    </select>
                </div>
                <div class="col-md-3 d-flex align-items-end gap-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-funnel"></i> Filter
                    </button>
                    <a href="{{ route('admin.contest-analysis.index') }}" class="btn btn-secondary">
                        <i class="bi bi-x-circle"></i> Clear
                    </a>
                </div>
            </form>
        </div>
    </div>

    <!-- Results Card -->
    <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
            <h5>All Sessions</h5>
            <span class="badge bg-primary">{{ $sessions->count() }} Sessions</span>
        </div>
        <div class="card-body">
            @if($sessions->isEmpty())
                <div class="alert alert-info">No sessions found. Try adjusting your filters.</div>
            @else
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Session Name</th>
                                <th>Market Type</th>
                                <th>Status</th>
                                <th>Start Time</th>
                                <th>End Time</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($sessions as $session)
                            <tr>
                                <td>{{ $session->id }}</td>
                                <td>{{ $session->name }}</td>
                                <td><span class="badge bg-info">{{ $session->market_type }}</span></td>
                                <td>
                                    @if($session->status == 'live')
                                        <span class="badge bg-success">Live</span>
                                    @elseif($session->status == 'completed')
                                        <span class="badge bg-secondary">Completed</span>
                                    @else
                                        <span class="badge bg-warning">Upcoming</span>
                                    @endif
                                </td>
                                <td>{{ \Carbon\Carbon::parse($session->start_time)->format('d M Y, h:i A') }}</td>
                                <td>{{ \Carbon\Carbon::parse($session->end_time)->format('d M Y, h:i A') }}</td>
                                <td>
                                    <a href="{{ route('admin.contest-analysis.session', $session->id) }}" class="btn btn-sm btn-primary">
                                        View Details
                                    </a>
                                </td>
                            </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </div>
    </div>
</div>
@endsection
