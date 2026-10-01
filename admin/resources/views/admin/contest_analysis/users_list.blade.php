@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>👥 Users Analysis</h2>
        <a href="{{ route('admin.contest-analysis.index') }}" class="btn btn-secondary">← Back to Sessions</a>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-4" role="tablist">
        <li class="nav-item" role="presentation">
            <a class="nav-link" href="{{ route('admin.contest-analysis.index') }}">
                📅 Sessions
            </a>
        </li>
        <li class="nav-item" role="presentation">
            <a class="nav-link active" href="{{ route('admin.contest-analysis.users') }}">
                👥 Users
            </a>
        </li>
    </ul>

    <!-- Filter Card -->
    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" action="{{ route('admin.contest-analysis.users') }}" class="row g-3">
                <div class="col-md-4">
                    <label class="form-label">Search (Name/Mobile/Email)</label>
                    <input type="text" name="search" class="form-control" placeholder="Search users..." value="{{ request('search') }}">
                </div>
                <div class="col-md-3">
                    <label class="form-label">From Date</label>
                    <input type="date" name="from_date" class="form-control" value="{{ request('from_date') }}">
                </div>
                <div class="col-md-3">
                    <label class="form-label">To Date</label>
                    <input type="date" name="to_date" class="form-control" value="{{ request('to_date') }}">
                </div>
                <div class="col-md-2 d-flex align-items-end gap-2">
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-funnel"></i> Filter
                    </button>
                    <a href="{{ route('admin.contest-analysis.users') }}" class="btn btn-secondary">
                        <i class="bi bi-x-circle"></i> Clear
                    </a>
                </div>
            </form>
        </div>
    </div>

    <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
            <h5>All Users</h5>
            <span class="badge bg-primary">{{ $usersData->count() }} Users</span>
        </div>
        <div class="card-body">
            @if($usersData->isEmpty())
                <div class="alert alert-info">No users found. Try adjusting your filters.</div>
            @else
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Mobile</th>
                                <th>Email</th>
                                <th>Total Contests</th>
                                <th>Total Winnings</th>
                                <th>Joined</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($usersData as $user)
                            <tr>
                                <td>{{ $user['id'] }}</td>
                                <td><strong>{{ $user['name'] }}</strong></td>
                                <td>{{ $user['mobile'] }}</td>
                                <td>{{ $user['email'] }}</td>
                                <td><span class="badge bg-info">{{ $user['total_contests'] }}</span></td>
                                <td><strong class="text-success">₹{{ number_format($user['total_winnings'], 2) }}</strong></td>
                                <td>{{ \Carbon\Carbon::parse($user['created_at'])->format('d M Y') }}</td>
                                <td>
                                    <a href="{{ route('admin.contest-analysis.user', $user['id']) }}" class="btn btn-sm btn-primary">
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
